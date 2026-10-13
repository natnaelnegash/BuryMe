import { prisma } from "../db/client.js";
import { Prisma, type Obligation } from "../generated/prisma/client.js";
import { ApiError } from "../middleware/errors.js";

const OPEN_STATUSES = ["Active", "PartiallyPaid"] as const;

export interface EligiblePair {
  obligationA: Obligation;
  obligationB: Obligation;
}

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

  if (
    // Installments are refused: settling one would strand Pending installments
    // under a Settled obligation, and marking them Paid would record payments
    // that never happened.
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

export function settleEffects(obligationIds: string[]): Prisma.PrismaPromise<unknown>[] {
  const now = new Date();
  return obligationIds.map((id) =>
    prisma.obligation.update({
      where: { id },
      data: { outstandingBalance: new Prisma.Decimal(0), status: "Settled", settledAt: now },
    }),
  );
}
