import type { Schemas } from "@buryme/shared";

import type { PillStatus } from "../components/ui/StatusPill.js";

export type ObligationDirection = "owed" | "owe" | "self";

// Which side of the obligation the signed-in user is on.
export function obligationDirection(
  o: Schemas["Obligation"],
  uid: string | undefined,
): ObligationDirection {
  if (o.lender.user_id === uid) return "owed";
  if (o.borrower.user_id === uid) return "owe";
  return "self";
}

// "Overdue" is derived, not an API status: an Active obligation whose due
// date has passed with money still outstanding.
export function isOverdue(o: Schemas["Obligation"]): boolean {
  const today = new Date().toISOString().slice(0, 10);
  return o.status === "Active" && o.due_date < today && o.outstanding_balance.amount > 0;
}

// Obligation status → the pill colour the design uses for it.
export const PILL_BY_STATUS: Record<string, PillStatus> = {
  Active: "teal",
  "Pending Disbursement": "indigo",
  "Partially Paid": "amber",
  Settled: "gray",
  Disputed: "red",
};
