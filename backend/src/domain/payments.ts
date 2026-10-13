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

export type ObligationWithParties = Obligation & { borrower: User; lender: User };

export interface PaymentTarget {
  direction: PaymentDirection;
  installment: Installment | null;
}

export function systemAmount(obligation: Obligation, target: PaymentTarget): Prisma.Decimal {
  if (target.direction === "Disbursement") return obligation.principalAmount;
  return target.installment ? target.installment.amount : obligation.outstandingBalance;
}

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

export function partiesFor(obligation: Obligation, direction: PaymentDirection) {
  return direction === "Disbursement"
    ? { payerId: obligation.lenderId, recipientId: obligation.borrowerId }
    : { payerId: obligation.borrowerId, recipientId: obligation.lenderId };
}

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

// Idempotent against current state, so a replayed webhook is harmless.
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

  const installment = await prisma.installment.findUnique({
    where: { id: payment.installmentId },
  });
  if (!installment) return [];
  const unpaidOthers = await prisma.installment.count({
    where: {
      scheduleId: installment.scheduleId,
      id: { not: installment.id },
      status: { not: "Paid" },
    },
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
