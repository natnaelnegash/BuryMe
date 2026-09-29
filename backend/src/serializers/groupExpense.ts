import type { Schemas } from "@buryme/shared";

import { Prisma } from "../generated/prisma/client.js";
import { toMoney } from "./money.js";
import { toUserSummaryResponse } from "./user.js";

export type GroupExpenseWithParties = Prisma.GroupExpenseGetPayload<{
  include: {
    payer: true;
    participants: { include: { participant: true; obligation: true } };
  };
}>;

export const WITH_EXPENSE_PARTIES = {
  payer: true,
  participants: { include: { participant: true, obligation: true } },
} as const;

// `outstanding_total` is viewer-relative: the payer is owed every
// participant's remaining share, while a participant only ever sees their
// own. The payer's own share never appears — it is not an obligation
// (§8.12). Summed as Decimal so the shares reconstruct exactly.
function outstandingTotal(expense: GroupExpenseWithParties, viewerId: string): Prisma.Decimal {
  const rows =
    expense.payerId === viewerId
      ? expense.participants
      : expense.participants.filter((p) => p.participantId === viewerId);

  return rows.reduce(
    (sum, p) => sum.plus(p.obligation?.outstandingBalance ?? new Prisma.Decimal(0)),
    new Prisma.Decimal(0),
  );
}

export function toGroupExpenseResponse(
  expense: GroupExpenseWithParties,
  viewerId: string,
): Schemas["GroupExpense"] {
  return {
    expense_id: expense.id,
    payer: toUserSummaryResponse(expense.payer),
    total_amount: toMoney(expense.totalAmount),
    description: expense.description,
    expense_date: expense.expenseDate.toISOString().slice(0, 10),
    due_date: expense.dueDate.toISOString().slice(0, 10),
    payer_share_included: expense.payerShareIncluded,
    payer_share_amount: expense.payerShareAmount ? toMoney(expense.payerShareAmount) : null,
    outstanding_total: toMoney(outstandingTotal(expense, viewerId)),
    participants: expense.participants.map((p) => ({
      participant_entry_id: p.id,
      participant: toUserSummaryResponse(p.participant),
      assigned_amount: toMoney(p.assignedAmount),
      // Always set in practice — the obligation is created in the same
      // transaction as the participant row.
      obligation_id: p.obligation?.id ?? "",
    })),
    created_at: expense.createdAt.toISOString(),
  };
}
