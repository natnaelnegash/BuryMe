import { useQuery } from "@tanstack/react-query";
import type { Schemas } from "@buryme/shared";

import { getSchedule } from "../api/schedule.js";

// Only Installments obligations have a schedule (Lump Sum → 404), so
// callers pass the obligation and the query stays off otherwise.
export function useScheduleQuery(obligation: Schemas["Obligation"] | undefined) {
  const enabled = obligation?.repayment_type === "Installments";
  return useQuery({
    queryKey: ["schedule", obligation?.obligation_id],
    queryFn: () => getSchedule(obligation!.obligation_id),
    enabled,
  });
}

// The installment a payment should target by default: earliest Overdue,
// else earliest Pending (mirrors backend lib/schedule.ts nextPayable).
export function nextPayable(
  schedule: Schemas["RepaymentSchedule"] | undefined,
): Schemas["Installment"] | undefined {
  const rows = schedule?.installments ?? [];
  return rows.find((i) => i.status === "Overdue") ?? rows.find((i) => i.status === "Pending");
}
