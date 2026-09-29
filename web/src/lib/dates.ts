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

// The notification feed writes ages as "2h ago" / "3d ago" (37:1443).
export function formatRelative(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return iso;
  const seconds = Math.max(0, Math.floor((now.getTime() - then.getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(iso);
}
