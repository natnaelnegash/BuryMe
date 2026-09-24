import type { Schemas } from "@buryme/shared";

import type { Installment } from "../generated/prisma/client.js";
import type { ScheduleWithInstallments } from "../lib/schedule.js";
import { toMoney } from "./money.js";

export function toInstallmentResponse(i: Installment): Schemas["Installment"] {
  return {
    installment_id: i.id,
    amount: toMoney(i.amount),
    due_date: i.dueDate.toISOString().slice(0, 10),
    // No spaces in these enums — Prisma identifiers equal the contract strings.
    status: i.status,
    paid_at: i.paidAt?.toISOString() ?? null,
  };
}

export function toScheduleResponse(s: ScheduleWithInstallments): Schemas["RepaymentSchedule"] {
  return {
    schedule_id: s.id,
    obligation_id: s.obligationId,
    installment_count: s.installmentCount,
    status: s.status,
    installments: s.installments.map(toInstallmentResponse),
    created_at: s.createdAt.toISOString(),
  };
}
