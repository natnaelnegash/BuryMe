import { prisma } from "../db/client.js";
import type { Installment, Obligation, Prisma } from "../generated/prisma/client.js";
import { ApiError } from "../middleware/errors.js";
import type { ProposedTerms } from "./validation.js";

// Repayment schedules (§6.3.2, §8.7, §8.8): fixed at agreement, read-only
// after. Rows are created inside the accept transaction; `Pending →
// Overdue` is applied lazily whenever a schedule is read or paid against,
// since the stack has no scheduler yet (reminders arrive with Slice 9).

export type ScheduleWithInstallments = Prisma.RepaymentScheduleGetPayload<{
  include: { installments: true };
}>;

// The nested-create payload for `obligation.create({ data: { schedule: … } })`
// so accept keeps everything in one transaction.
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

// Persists Pending → Overdue for rows whose due date has passed. Cheap and
// idempotent, so callers run it before every read that shows status.
export async function refreshInstallmentStatuses(scheduleId: string): Promise<void> {
  await prisma.installment.updateMany({
    where: { scheduleId, status: "Pending", dueDate: { lt: startOfToday() } },
    data: { status: "Overdue" },
  });
}

const ORDERED = { installments: { orderBy: { dueDate: "asc" as const } } };

// Loads the obligation's schedule, creating it from the originating
// request's agreed terms if the obligation was accepted before Slice 6
// materialised schedules. Throws 404 for Lump Sum (contract).
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

// Pre-Slice-6 obligations: the agreed schedule lives only in the accepted
// request's JSON (counter-proposal wins over the original, as at accept).
async function backfillTermsFor(
  obligation: Obligation,
): Promise<NonNullable<ProposedTerms["schedule"]>> {
  const request = obligation.originatingRequestId
    ? await prisma.request.findUnique({ where: { id: obligation.originatingRequestId } })
    : null;
  const counter = request?.counterProposal as { proposed_schedule?: unknown } | null;
  const schedule = (counter?.proposed_schedule ?? request?.proposedSchedule) as
    | ProposedTerms["schedule"]
    | undefined;
  if (!schedule?.installments?.length) {
    throw new ApiError(
      "STATUS_CONFLICT",
      "This obligation has no repayment schedule on record.",
      409,
    );
  }
  return schedule;
}

// The installment a payment should target by default: the earliest
// Overdue one, else the earliest Pending one.
export function nextPayable(installments: Installment[]): Installment | undefined {
  return (
    installments.find((i) => i.status === "Overdue") ??
    installments.find((i) => i.status === "Pending")
  );
}
