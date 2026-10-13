import { prisma } from "../db/client.js";
import { Prisma, type Obligation } from "../generated/prisma/client.js";
import { ApiError } from "../middleware/errors.js";

// Two-party net settlement (§8.14). When two people each owe the other,
// one payment clears both: the obligations cancel out and whoever owes
// more pays the difference. This module holds the pairing and netting
// rules; the routes stay thin.

// Only open obligations can be netted. "Open" matches what `lib/payments.ts`
// treats as payable, so a settlement can never target something a payment
// couldn't.
const OPEN_STATUSES = ["Active", "PartiallyPaid"] as const;

export interface EligiblePair {
  /** The obligation the initiator borrows on — the contract's `obligation_id_a`. */
  obligationA: Obligation;
  /** The obligation the counterparty borrows on. */
  obligationB: Obligation;
}

// Exactly one open obligation in each direction, or it isn't settleable.
// The design says "Two open obligations between you", and with three or
// more there is no single correct pairing to propose — better to refuse
// than to guess which debts the user meant.
export async function findEligiblePair(
  initiatorId: string,
  counterpartyId: string,
): Promise<EligiblePair> {
  if (initiatorId === counterpartyId) {
    throw new ApiError(
      "VALIDATION_ERROR",
      "You can't settle with yourself.",
      400,
      "counterparty_user_id",
    );
  }

  const [initiatorOwes, counterpartyOwes] = await Promise.all([
    prisma.obligation.findMany({
      where: {
        borrowerId: initiatorId,
        lenderId: counterpartyId,
        status: { in: [...OPEN_STATUSES] },
        outstandingBalance: { gt: 0 },
      },
    }),
    prisma.obligation.findMany({
      where: {
        borrowerId: counterpartyId,
        lenderId: initiatorId,
        status: { in: [...OPEN_STATUSES] },
        outstandingBalance: { gt: 0 },
      },
    }),
  ]);

  if (initiatorOwes.length === 0 || counterpartyOwes.length === 0) {
    throw new ApiError(
      "STATUS_CONFLICT",
      "Settling needs one open obligation in each direction between you.",
      409,
    );
  }
  if (initiatorOwes.length > 1 || counterpartyOwes.length > 1) {
    throw new ApiError(
      "STATUS_CONFLICT",
      "More than one open obligation in a direction — settle them individually.",
      409,
    );
  }

  const obligationA = initiatorOwes[0]!;
  const obligationB = counterpartyOwes[0]!;

  // Installments are refused for now: settling one would strand Pending
  // installments under a Settled obligation, and the contract has no
  // cancelled InstallmentStatus to move them to. Marking them Paid would
  // record payments that never happened.
  if (
    obligationA.repaymentType === "Installments" ||
    obligationB.repaymentType === "Installments"
  ) {
    throw new ApiError(
      "STATUS_CONFLICT",
      "Obligations on an installment plan can't be settled this way yet.",
      409,
    );
  }

  return { obligationA, obligationB };
}

export interface Net {
  netAmount: Prisma.Decimal;
  netPayerId: string;
  netRecipientId: string;
}

// The difference between the two outstanding balances, owed by whoever
// owes more. Equal balances net to zero and nobody pays anything — the
// obligations still both settle.
export function netOf(pair: EligiblePair): Net {
  const { obligationA, obligationB } = pair;
  const aOwes = obligationA.outstandingBalance;
  const bOwes = obligationB.outstandingBalance;
  const aOwesMore = aOwes.greaterThanOrEqualTo(bOwes);

  return {
    netAmount: aOwesMore ? aOwes.minus(bOwes) : bOwes.minus(aOwes),
    netPayerId: aOwesMore ? obligationA.borrowerId : obligationB.borrowerId,
    netRecipientId: aOwesMore ? obligationA.lenderId : obligationB.lenderId,
  };
}

// Both obligations have to still be open when the second party accepts —
// one of them may have been paid off by other means in the meantime, which
// the contract calls out explicitly on the accept endpoint.
export async function assertStillSettleable(obligationIds: string[]): Promise<void> {
  const open = await prisma.obligation.count({
    where: {
      id: { in: obligationIds },
      status: { in: [...OPEN_STATUSES] },
    },
  });
  if (open !== obligationIds.length) {
    throw new ApiError(
      "STATUS_CONFLICT",
      "One of these obligations has already been settled by other means.",
      409,
    );
  }
}

// What accepting does to the two obligations. Mirrors the settle branch of
// `confirmedPaymentEffects` in lib/payments.ts so the invariant is
// identical: zero outstanding, Settled, and a settledAt stamp.
export function settleEffects(obligationIds: string[]): Prisma.PrismaPromise<unknown>[] {
  const now = new Date();
  return obligationIds.map((id) =>
    prisma.obligation.update({
      where: { id },
      data: { outstandingBalance: new Prisma.Decimal(0), status: "Settled", settledAt: now },
    }),
  );
}
