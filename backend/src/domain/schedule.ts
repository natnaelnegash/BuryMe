import { prisma } from "../db/client.js";
import type { Installment, Obligation, Prisma } from "../generated/prisma/client.js";
import { ApiError } from "../middleware/errors.js";
import type { ProposedTerms } from "../schemas/requests.js";

export type ScheduleWithInstallments = Prisma.RepaymentScheduleGetPayload<{
  include: { installments: true };
}>;

export function scheduleCreateInput(
  schedule: NonNullable<ProposedTerms["schedule"]>,
): Prisma.RepaymentScheduleCreateNestedOneWithoutObligationInput {
  return {
    create: {
      installmentCount: schedule.installments.length,
      installments: {
        create: schedule.installments.map((i) => ({
          amount: i.amount.amount,
          dueDate: new Date(i.due_date),
        })),
      },
    },
  };
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// Idempotent — callers run it before every read that shows installment status.
export async function refreshInstallmentStatuses(scheduleId: string): Promise<void> {
  await prisma.installment.updateMany({
    where: { scheduleId, status: "Pending", dueDate: { lt: startOfToday() } },
    data: { status: "Overdue" },
  });
}

const ORDERED = { installments: { orderBy: { dueDate: "asc" as const } } };

export async function loadSchedule(obligation: Obligation): Promise<ScheduleWithInstallments> {
  if (obligation.repaymentType !== "Installments") {
    throw new ApiError("NOT_FOUND", "This obligation is repaid as a lump sum — no schedule.", 404);
  }

  let schedule = await prisma.repaymentSchedule.findUnique({
    where: { obligationId: obligation.id },
    include: ORDERED,
  });

  if (!schedule) {
    const proposed = await backfillTermsFor(obligation);
    schedule = await prisma.repaymentSchedule.create({
      data: { obligationId: obligation.id, ...scheduleCreateInput(proposed).create! },
      include: ORDERED,
    });
  }

  await refreshInstallmentStatuses(schedule.id);
  return prisma.repaymentSchedule.findUniqueOrThrow({
    where: { id: schedule.id },
    include: ORDERED,
  });
}

async function backfillTermsFor(
  obligation: Obligation,
): Promise<NonNullable<ProposedTerms["schedule"]>> {
  const request = obligation.originatingRequestId
    ? await prisma.request.findUnique({ where: { id: obligation.originatingRequestId } })
    : null;
  const counter = request?.counterProposal as { proposed_schedule?: unknown } | null;
  const schedule = (counter?.proposed_schedule ?? request?.proposedSchedule) as
    ProposedTerms["schedule"] | undefined;
  if (!schedule?.installments?.length) {
    throw new ApiError(
      "STATUS_CONFLICT",
      "This obligation has no repayment schedule on record.",
      409,
    );
  }
  return schedule;
}

export function nextPayable(installments: Installment[]): Installment | undefined {
  return (
    installments.find((i) => i.status === "Overdue") ??
    installments.find((i) => i.status === "Pending")
  );
}
