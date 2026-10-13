import { reminderConfig } from "../config/reminders.js";
import { prisma } from "../db/client.js";
import { etb, notify } from "./notifications.js";

const OPEN_STATUSES = ["Active", "PartiallyPaid"] as const;

function dayStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, n: number): Date {
  const next = dayStart(date);
  next.setUTCDate(next.getUTCDate() + n);
  return next;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function human(date: Date): string {
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export interface SweepResult {
  upcomingInstallments: number;
  overdueInstallments: number;
  upcomingObligations: number;
  confirmationChases: number;
}

async function sweepUpcomingInstallments(now: Date, leadDays: number[]): Promise<number> {
  let sent = 0;
  for (const lead of leadDays) {
    const due = addDays(now, lead);
    const installments = await prisma.installment.findMany({
      where: {
        status: "Pending",
        dueDate: due,
        schedule: { obligation: { status: { in: [...OPEN_STATUSES] } } },
      },
      include: { schedule: { include: { obligation: true } } },
    });

    for (const installment of installments) {
      await notify({
        userId: installment.schedule.obligation.borrowerId,
        type: "RS-04",
        params: { amount: etb(installment.amount), date: human(installment.dueDate) },
        referenceId: installment.schedule.obligationId,
        dedupeKey: `RS-04:${installment.id}:${lead}`,
      });
      sent += 1;
    }
  }
  return sent;
}

async function sweepOverdueInstallments(now: Date): Promise<number> {
  const installments = await prisma.installment.findMany({
    where: {
      status: { not: "Paid" },
      dueDate: { lt: dayStart(now) },
      schedule: { obligation: { status: { in: [...OPEN_STATUSES] } } },
    },
    include: { schedule: { include: { obligation: true } } },
  });

  for (const installment of installments) {
    await notify({
      userId: installment.schedule.obligation.borrowerId,
      type: "RS-05",
      params: { amount: etb(installment.amount), date: human(installment.dueDate) },
      referenceId: installment.schedule.obligationId,
      dedupeKey: `RS-05:${installment.id}`,
    });
  }
  return installments.length;
}

async function sweepUpcomingObligations(now: Date, leadDays: number[]): Promise<number> {
  let sent = 0;
  for (const lead of leadDays) {
    const due = addDays(now, lead);
    const obligations = await prisma.obligation.findMany({
      where: {
        repaymentType: "LumpSum",
        status: { in: [...OPEN_STATUSES] },
        outstandingBalance: { gt: 0 },
        dueDate: due,
      },
      include: { lender: true },
    });

    for (const obligation of obligations) {
      await notify({
        userId: obligation.borrowerId,
        type: "RS-06",
        params: {
          outstanding: etb(obligation.outstandingBalance),
          name: obligation.lender.displayName,
          date: human(obligation.dueDate),
        },
        referenceId: obligation.id,
        dedupeKey: `RS-06:${obligation.id}:${lead}`,
      });
      sent += 1;
    }
  }
  return sent;
}

async function sweepConfirmationChases(now: Date, afterDays: number): Promise<number> {
  const cutoff = addDays(now, -afterDays);
  const payments = await prisma.payment.findMany({
    where: {
      paymentMethod: "External",
      status: "PendingAcknowledgement",
      recordedAt: { lte: cutoff },
      recordedByUserId: { not: null },
    },
    include: { payer: true, recipient: true },
  });

  for (const payment of payments) {
    const awaiting =
      payment.recordedByUserId === payment.payerId ? payment.recipientId : payment.payerId;
    const recorder =
      payment.recordedByUserId === payment.payerId ? payment.payer : payment.recipient;
    const elapsed = Math.floor(
      (dayStart(now).getTime() - dayStart(payment.recordedAt).getTime()) / 86_400_000,
    );

    await notify({
      userId: awaiting,
      type: "REM-01",
      params: { name: recorder.displayName, amount: etb(payment.amount), days: elapsed },
      referenceId: payment.id,
      dedupeKey: `REM-01:${payment.id}`,
    });
  }
  return payments.length;
}

export async function runReminderSweep(now: Date = new Date()): Promise<SweepResult> {
  const config = reminderConfig();
  return {
    upcomingInstallments: await sweepUpcomingInstallments(now, config.installmentLeadDays),
    overdueInstallments: await sweepOverdueInstallments(now),
    upcomingObligations: await sweepUpcomingObligations(now, config.obligationLeadDays),
    confirmationChases: await sweepConfirmationChases(now, config.confirmationChaseDays),
  };
}

export function startReminderScheduler(): () => void {
  const { sweepMinutes } = reminderConfig();
  let running = false;

  const tick = async () => {
    // A slow sweep must not overlap the next tick and send twice.
    if (running) return;
    running = true;
    try {
      await runReminderSweep();
    } catch (err) {
      console.error("Reminder sweep failed:", err);
    } finally {
      running = false;
    }
  };

  void tick();
  const handle = setInterval(() => void tick(), sweepMinutes * 60_000);
  handle.unref?.();
  return () => clearInterval(handle);
}

export { isoDate };
