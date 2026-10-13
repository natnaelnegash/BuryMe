import { useQuery } from "@tanstack/react-query";
import type { Schemas } from "@buryme/shared";

import { getSchedule } from "../api/schedule.js";

export function useScheduleQuery(obligation: Schemas["Obligation"] | undefined) {
  const enabled = obligation?.repayment_type === "Installments";
  return useQuery({
    queryKey: ["schedule", obligation?.obligation_id],
    queryFn: () => getSchedule(obligation!.obligation_id),
    enabled,
  });
}

export function nextPayable(
  schedule: Schemas["RepaymentSchedule"] | undefined,
): Schemas["Installment"] | undefined {
  const rows = schedule?.installments ?? [];
  return rows.find((i) => i.status === "Overdue") ?? rows.find((i) => i.status === "Pending");
}
