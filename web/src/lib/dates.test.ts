import { describe, expect, it } from "vitest";

import { formatDate, formatRelative, isoPlusDays, isoPlusMonths, todayIso } from "./dates.js";

describe("formatDate", () => {
  it("renders a contract date and a timestamp the same way", () => {
    expect(formatDate("2026-03-09")).toBe("9 Mar 2026");
    expect(formatDate("2026-03-09T13:45:00.000Z")).toBe("9 Mar 2026");
  });

  it("returns the input unchanged when it isn't a date", () => {
    expect(formatDate("not a date")).toBe("not a date");
  });
});

describe("todayIso", () => {
  it("is a date-only string, so it compares against contract due dates", () => {
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(todayIso()).toBe(isoPlusDays(0));
  });
});

describe("isoPlusDays", () => {
  it("counts forward across month and year ends", () => {
    expect(isoPlusDays(7, new Date(2026, 2, 9))).toBe("2026-03-16");
    expect(isoPlusDays(14, new Date(2026, 2, 25))).toBe("2026-04-08");
    expect(isoPlusDays(7, new Date(2026, 11, 28))).toBe("2027-01-04");
  });

  it("reads the local calendar day, not the UTC one", () => {
    // Early morning east of UTC: toISOString would still say the day before.
    expect(isoPlusDays(0, new Date(2026, 0, 5, 1, 30))).toBe("2026-01-05");
  });
});

describe("isoPlusMonths", () => {
  it("keeps the same day of the month", () => {
    expect(isoPlusMonths(1, new Date(2026, 2, 9))).toBe("2026-04-09");
    expect(isoPlusMonths(3, new Date(2026, 2, 9))).toBe("2026-06-09");
    expect(isoPlusMonths(3, new Date(2026, 10, 15))).toBe("2027-02-15");
  });

  it("clamps to the last day when the target month is shorter", () => {
    expect(isoPlusMonths(1, new Date(2026, 0, 31))).toBe("2026-02-28");
    expect(isoPlusMonths(1, new Date(2024, 0, 31))).toBe("2024-02-29");
    expect(isoPlusMonths(1, new Date(2026, 4, 31))).toBe("2026-06-30");
  });
});

describe("formatRelative", () => {
  const now = new Date("2026-03-09T12:00:00.000Z");
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

  it("steps through seconds, minutes, hours and days", () => {
    expect(formatRelative(ago(30_000), now)).toBe("just now");
    expect(formatRelative(ago(5 * 60_000), now)).toBe("5m ago");
    expect(formatRelative(ago(3 * 3_600_000), now)).toBe("3h ago");
    expect(formatRelative(ago(2 * 86_400_000), now)).toBe("2d ago");
  });

  it("switches to an absolute date beyond a week", () => {
    expect(formatRelative(ago(8 * 86_400_000), now)).toBe("1 Mar 2026");
  });

  it("treats a clock-skewed future timestamp as just now", () => {
    expect(formatRelative(new Date(now.getTime() + 60_000).toISOString(), now)).toBe("just now");
  });
});
