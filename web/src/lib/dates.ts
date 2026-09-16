// The design writes dates as "12 Sep 2026". Input is the contract's
// `date` / `date-time` string; an unparseable value is echoed back so a bad
// row still renders something rather than "Invalid Date".
export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// Today as the `YYYY-MM-DD` string a date input's `min` wants.
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
