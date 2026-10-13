import { describe, expect, it } from "vitest";
import type { Schemas } from "@buryme/shared";

import { historyTimeline } from "./history.js";

const ME = "u-me";

function entry(
  eventType: Schemas["ObligationHistoryEventType"],
  detail: Record<string, unknown> = {},
  initiatedBy = ME,
): Schemas["ObligationHistoryEntry"] {
  return {
    history_id: `h-${eventType}`,
    obligation_id: "obl-1",
    event_type: eventType,
    initiated_by: { user_id: initiatedBy, display_name: "Abebe Bekele", profile_photo_url: null },
    event_detail: detail,
    occurred_at: "2026-03-09T10:00:00.000Z",
  };
}

const etb = (amount: number) => ({ amount, currency: "ETB" as const });

describe("historyTimeline", () => {
  it("names each event type", () => {
    const titles = historyTimeline(
      [
        entry("Created"),
        entry("Terms Changed"),
        entry("Payment Confirmed", { amount: etb(500), payment_direction: "Disbursement" }),
        entry("Payment Confirmed", { amount: etb(200), payment_direction: "Repayment" }),
        entry("Disputed", { amount: etb(200), payment_direction: "Repayment" }),
        entry("Settled"),
      ],
      ME,
    ).map((item) => item.title);

    expect(titles).toEqual([
      "Obligation created",
      "Terms changed",
      "Disbursed 500 ETB",
      "Repaid 200 ETB",
      "Disputed 200 ETB",
      "Settled",
    ]);
  });

  it("separates the two payment directions by colour", () => {
    const [disbursed, repaid] = historyTimeline(
      [
        entry("Payment Confirmed", { amount: etb(500), payment_direction: "Disbursement" }),
        entry("Payment Confirmed", { amount: etb(200), payment_direction: "Repayment" }),
      ],
      ME,
    );
    expect(disbursed?.color).toBe("teal");
    expect(repaid?.color).toBe("amber");
  });

  it("attributes the event to the viewer or to the other party by name", () => {
    expect(historyTimeline([entry("Created")], ME)[0]?.subtitle).toBe("9 Mar 2026 · by you");
    expect(historyTimeline([entry("Created", {}, "u-them")], ME)[0]?.subtitle).toBe(
      "9 Mar 2026 · by Abebe Bekele",
    );
  });

  it("falls back to a bare label when the detail carries no amount", () => {
    expect(historyTimeline([entry("Payment Confirmed")], ME)[0]?.title).toBe("Payment confirmed");
    expect(historyTimeline([entry("Disputed")], ME)[0]?.title).toBe("Payment disputed");
  });
});
