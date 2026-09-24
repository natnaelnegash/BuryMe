import type { Schemas } from "@buryme/shared";

import { apiClient } from "./client.js";

export interface GroupExpensePage {
  data: Schemas["GroupExpense"][];
  next_cursor: string | null;
}

export const listGroupExpenses = (params?: { role?: "payer" | "participant" }) =>
  apiClient.get<GroupExpensePage>(
    `/group-expenses${params?.role ? `?role=${params.role}` : ""}`,
  );

export const getGroupExpense = (expenseId: string) =>
  apiClient.get<Schemas["GroupExpense"]>(`/group-expenses/${encodeURIComponent(expenseId)}`);

export const createGroupExpense = (body: Schemas["CreateGroupExpenseInput"]) =>
  apiClient.post<Schemas["GroupExpense"]>("/group-expenses", body);
