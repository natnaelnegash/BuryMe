// §13.3 Reminder Notification Schedule. Every value in that table is marked
// configurable, so the lead times live in env rather than in the code.
// Read lazily, like config/otp.ts and config/sms.ts, so route tests that
// mock the DB don't need a full env to import the sweep.

function days(name: string, fallback: number[]): number[] {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = raw
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((n) => Number.isInteger(n) && n >= 0);
  return parsed.length > 0 ? parsed : fallback;
}

function num(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function reminderConfig() {
  return {
    // RS-04: 3 days before, then 1 day before the installment's due date.
    installmentLeadDays: days("REMINDER_INSTALLMENT_LEAD_DAYS", [3, 1]),
    // RS-06: the same two points before a Lump Sum obligation's due date.
    obligationLeadDays: days("REMINDER_OBLIGATION_LEAD_DAYS", [3, 1]),
    // REM-01: days after an external payment was recorded with no response.
    confirmationChaseDays: num("REMINDER_CONFIRMATION_DAYS", 3),
    // How often the sweep runs. Lead times are whole days, so hourly is
    // ample and keeps the work small.
    sweepMinutes: num("REMINDER_SWEEP_MINUTES", 60),
  };
}
