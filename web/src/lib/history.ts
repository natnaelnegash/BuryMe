import type { Schemas } from "@buryme/shared";

import type { TimelineColor } from "../components/domain/TimelineItem.js";
import { formatDate } from "./dates.js";
import { formatMoney } from "./money.js";

type HistoryEntry = Schemas["ObligationHistoryEntry"];

export interface TimelineEntry {
  title: string;
  subtitle: string;
  color: TimelineColor;
}

// event_detail is free-form by contract, so each reader states what it expects.
function money(detail: HistoryEntry["event_detail"]): Schemas["Money"] | null {
  const value = detail.amount as Schemas["Money"] | undefined;
  return value && typeof value.amount === "number" ? value : null;
}

function isDisbursement(detail: HistoryEntry["event_detail"]): boolean {
  return detail.payment_direction === "Disbursement";
}

function title(entry: HistoryEntry): string {
  const amount = money(entry.event_detail);
  switch (entry.event_type) {
    case "Created":
      return "Obligation created";
    case "Terms Changed":
      return "Terms changed";
    case "Schedule Accepted":
      return "Schedule accepted";
    case "Payment Confirmed":
      if (!amount) return "Payment confirmed";
      return isDisbursement(entry.event_detail)
        ? `Disbursed ${formatMoney(amount)}`
        : `Repaid ${formatMoney(amount)}`;
    case "Disputed":
      return amount ? `Disputed ${formatMoney(amount)}` : "Payment disputed";
    case "Settled":
      return "Settled";
  }
}

function color(entry: HistoryEntry): TimelineColor {
  switch (entry.event_type) {
    case "Created":
      return "teal";
    case "Terms Changed":
    case "Schedule Accepted":
      return "indigo";
    case "Payment Confirmed":
      return isDisbursement(entry.event_detail) ? "teal" : "amber";
    case "Disputed":
      return "amber";
    case "Settled":
      return "gray";
  }
}

export function historyTimeline(entries: HistoryEntry[], uid: string | undefined): TimelineEntry[] {
  return entries.map((entry) => ({
    title: title(entry),
    subtitle: `${formatDate(entry.occurred_at)} · ${
      entry.initiated_by.user_id === uid ? "by you" : `by ${entry.initiated_by.display_name}`
    }`,
    color: color(entry),
  }));
}
