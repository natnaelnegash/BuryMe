import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Schemas } from "@buryme/shared";

import { createGroupExpense, getGroupExpense, listGroupExpenses } from "../api/groupExpenses.js";

const EXPENSES_KEY = ["group-expenses"] as const;

export function useGroupExpensesQuery(params?: { role?: "payer" | "participant" }) {
  return useQuery({
    queryKey: [...EXPENSES_KEY, params?.role ?? "all"],
    queryFn: () => listGroupExpenses(params),
  });
}

export function useGroupExpenseQuery(expenseId: string | undefined) {
  return useQuery({
    queryKey: [...EXPENSES_KEY, "detail", expenseId],
    queryFn: () => getGroupExpense(expenseId as string),
    enabled: expenseId !== undefined,
  });
}

// Creating an expense spawns one obligation per participant, so the
// obligations namespace is stale too.
export function useCreateGroupExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Schemas["CreateGroupExpenseInput"]) => createGroupExpense(body),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: EXPENSES_KEY }),
        queryClient.invalidateQueries({ queryKey: ["obligations"] }),
      ]),
  });
}
