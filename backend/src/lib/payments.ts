import { Prisma } from "../generated/prisma/client.js";

import { chapaCallbackUrl, chapaReturnUrl, getChapaClient } from "../config/chapa.js";
import { prisma } from "../db/client.js";
import type {
  Installment,
  Obligation,
  Payment,
  PaymentDirection,
  User,
} from "../generated/prisma/client.js";
import { ApiError } from "../middleware/errors.js";
import { loadSchedule } from "./schedule.js";

// The money rules for an Obligation's Payments (§6.4, §12.2.4), in one place
// so the Chapa path (webhooks) and the external path (acknowledge) can't
// drift: who may pay, how much (never free-entered), and what a confirmed
// payment does to the obligation.
//
// Lump Sum repays the whole outstanding balance in one go; Installments
// repay one Installment row at a time (`installment_id`), and the
// obligation moves Active → Partially Paid → Settled as rows are Paid.

export type ObligationWithParties = Obligation & { borrower: User; lender: User };

// What a payment is for: the whole principal (disbursement), the whole
// outstanding balance (Lump Sum repayment), or one installment.
export interface PaymentTarget {
  direction: PaymentDirection;
  installment: Installment | null;
}

// The only amount a payment can carry.
export function systemAmount(obligation: Obligation, target: PaymentTarget): Prisma.Decimal {
  if (target.direction === "Disbursement") return obligation.principalAmount;
  return target.installment ? target.installment.amount : obligation.outstandingBalance;
}

// Resolves what a repayment on this obligation targets: for Installments
// the caller must name a Pending/Overdue installment of this schedule; for
// Lump Sum `installment_id` must be absent.
export async function resolveTarget(
  obligation: Obligation,
  direction: PaymentDirection,
  installmentId: string | null | undefined,
): Promise<PaymentTarget> {
  if (direction === "Disbursement" || obligation.repaymentType === "LumpSum") {
    if (installmentId) {
      throw new ApiError(
        "VALIDATION_ERROR",
        "This payment doesn't target an installment.",
        400,
        "installment_id",
      );
    }
    return { direction, installment: null };
  }

  if (!installmentId) {
    throw new ApiError(
      "VALIDATION_ERROR",
      "Choose which installment this payment is for.",
      400,
      "installment_id",
    );
  }
  const schedule = await loadSchedule(obligation);
  const installment = schedule.installments.find((i) => i.id === installmentId);
  if (!installment) {
    throw new ApiError("NOT_FOUND", "No such installment on this obligation.", 404);
  }
  if (installment.status === "Paid") {
    throw new ApiError("STATUS_CONFLICT", "That installment is already paid.", 409);
  }
  return { direction, installment };
}

// Throws the contract's errors when a payment can't be started on this
// obligation right now. `payerId` is the user who will actually hand over
// money (payer of the Payment row).
export async function assertPayable(
  obligation: Obligation,
  target: PaymentTarget,
  payerId: string,
): Promise<void> {
  const { direction, installment } = target;
  if (direction === "Disbursement") {
    if (obligation.lenderId !== payerId) {
      throw new ApiError("UNAUTHORIZED", "Only the lender can send the disbursement.", 403);
    }
    if (obligation.status !== "PendingDisbursement") {
      throw new ApiError(
        "STATUS_CONFLICT",
        "This obligation is not waiting for a disbursement.",
        409,
      );
    }
  } else {
    if (obligation.borrowerId !== payerId) {
      throw new ApiError("UNAUTHORIZED", "Only the borrower can make a repayment.", 403);
    }
    if (obligation.status !== "Active" && obligation.status !== "PartiallyPaid") {
      throw new ApiError(
        "STATUS_CONFLICT",
        obligation.status === "Settled"
          ? "This obligation is already settled."
          : "This obligation isn't accepting repayments right now.",
        409,
      );
    }
  }

  // One live payment per target; a Failed or Disputed one may be retried.
  const inFlight = await prisma.payment.findFirst({
    where: {
      obligationId: obligation.id,
      paymentDirection: direction,
      status: "PendingAcknowledgement",
      ...(installment ? { installmentId: installment.id } : {}),
    },
  });
  if (inFlight) {
    throw new ApiError(
      "DUPLICATE_SUBMISSION",
      direction === "Disbursement"
        ? "A disbursement for this obligation is already in progress."
        : installment
          ? "A payment for that installment is already awaiting confirmation."
          : "A repayment on this obligation is already awaiting confirmation.",
      409,
    );
  }
}

// Who pays whom in `direction`.
export function partiesFor(obligation: Obligation, direction: PaymentDirection) {
  return direction === "Disbursement"
    ? { payerId: obligation.lenderId, recipientId: obligation.borrowerId }
    : { payerId: obligation.borrowerId, recipientId: obligation.lenderId };
}

// Guards the Chapa path: the recipient must have somewhere to receive the
// transfer hop. Returned for callers that want the number.
export async function assertRecipientVerified(recipient: User) {
  const telebirr = await prisma.telebirrAccount.findUnique({ where: { userId: recipient.id } });
  if (telebirr?.verificationStatus !== "Verified" || !telebirr.telebirrNumber) {
    throw new ApiError(
      "RECIPIENT_UNVERIFIED",
      `${recipient.displayName} hasn't verified their Telebirr yet.`,
      409,
    );
  }
  return telebirr;
}

export const WITH_PAYMENT_PARTIES = { payer: true, recipient: true } as const;

// Creates a Chapa payment (first hop): the Payment row plus a hosted
// checkout for the payer. Shared by /disburse (lender pays in) and
// /payments/chapa (borrower pays in). On checkout failure the row is
// marked Failed and PAYMENT_GATEWAY_ERROR is thrown.
export async function createChapaPayment(obligation: ObligationWithParties, target: PaymentTarget) {
  const { payerId, recipientId } = partiesFor(obligation, target.direction);
  const payer = payerId === obligation.lenderId ? obligation.lender : obligation.borrower;

  const payment = await prisma.payment.create({
    data: {
      obligationId: obligation.id,
      payerId,
      recipientId,
      amount: systemAmount(obligation, target),
      paymentDirection: target.direction,
      paymentMethod: "Chapa",
      status: "PendingAcknowledgement",
      installmentId: target.installment?.id ?? null,
    },
  });

  const callbackUrl = chapaCallbackUrl();
  let checkoutUrl: string;
  try {
    ({ checkoutUrl } = await getChapaClient().initiateCheckout({
      amount: payment.amount.toNumber(),
      currency: "ETB",
      reference: payment.id,
      payerName: payer.displayName,
      payerPhone: payer.identifier,
      returnUrl: chapaReturnUrl(`/obligations/${obligation.id}`),
      ...(callbackUrl ? { callbackUrl } : {}),
    }));
  } catch (err) {
    console.error("Chapa checkout failed:", err instanceof Error ? err.message : err);
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "Failed" } });
    throw new ApiError(
      "PAYMENT_GATEWAY_ERROR",
      "The payment couldn't be started right now. Please try again.",
      502,
    );
  }

  return prisma.payment.update({
    where: { id: payment.id },
    data: { checkoutUrl },
    include: WITH_PAYMENT_PARTIES,
  });
}

// What a confirmed payment does to its obligation (and installment).
// Returns the Prisma operations so callers can run them in one transaction
// with the payment's own status update. Idempotent against current state.
export async function confirmedPaymentEffects(
  payment: Payment,
  obligation: Obligation,
): Promise<Prisma.PrismaPromise<unknown>[]> {
  if (payment.paymentDirection === "Disbursement") {
    if (obligation.status !== "PendingDisbursement") return [];
    return [
      prisma.obligation.update({
        where: { id: obligation.id },
        data: { status: "Active", outstandingBalance: obligation.principalAmount },
      }),
    ];
  }

  const now = new Date();
  const remaining = Prisma.Decimal.max(
    obligation.outstandingBalance.minus(payment.amount),
    new Prisma.Decimal(0),
  );
  const settled = remaining.isZero();

  // Lump Sum: one payment clears everything.
  if (!payment.installmentId) {
    return [
      prisma.obligation.update({
        where: { id: obligation.id },
        data: {
          outstandingBalance: remaining,
          ...(settled ? { status: "Settled", settledAt: now } : {}),
        },
      }),
    ];
  }

  // Installments: mark the row Paid; Partially Paid until the last one,
  // then Settled and the schedule Completed.
  const installment = await prisma.installment.findUnique({
    where: { id: payment.installmentId },
  });
  if (!installment) return [];
  const unpaidOthers = await prisma.installment.count({
    where: { scheduleId: installment.scheduleId, id: { not: installment.id }, status: { not: "Paid" } },
  });
  const allPaid = unpaidOthers === 0;

  return [
    prisma.installment.update({
      where: { id: installment.id },
      data: { status: "Paid", paidAt: now },
    }),
    prisma.obligation.update({
      where: { id: obligation.id },
      data: {
        outstandingBalance: allPaid ? new Prisma.Decimal(0) : remaining,
        status: allPaid ? "Settled" : "PartiallyPaid",
        ...(allPaid ? { settledAt: now } : {}),
      },
    }),
    ...(allPaid
      ? [
          prisma.repaymentSchedule.update({
            where: { id: installment.scheduleId },
            data: { status: "Completed" },
          }),
        ]
      : []),
  ];
}
