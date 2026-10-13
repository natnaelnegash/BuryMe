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
    installmentLeadDays: days("REMINDER_INSTALLMENT_LEAD_DAYS", [3, 1]),
    obligationLeadDays: days("REMINDER_OBLIGATION_LEAD_DAYS", [3, 1]),
    confirmationChaseDays: num("REMINDER_CONFIRMATION_DAYS", 3),
    sweepMinutes: num("REMINDER_SWEEP_MINUTES", 60),
  };
}
