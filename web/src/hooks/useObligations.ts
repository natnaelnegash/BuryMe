import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Schemas } from "@buryme/shared";

import {
  disburseObligation,
  getObligation,
  listObligations,
  requestRepayment,
} from "../api/obligations.js";

const OBLIGATIONS_KEY = ["obligations"] as const;

export function useObligationsQuery(params?: { role?: "borrower" | "lender"; limit?: number }) {
  return useQuery({
    queryKey: [...OBLIGATIONS_KEY, params?.role ?? "all", params?.limit ?? "default"],
    queryFn: () => listObligations(params),
  });
}

export function useObligationQuery(obligationId: string | undefined) {
  return useQuery({
    queryKey: [...OBLIGATIONS_KEY, "detail", obligationId],
    queryFn: () => getObligation(obligationId as string),
    enabled: obligationId !== undefined,
  });
}

export function useRequestRepayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      obligationId,
      body,
    }: {
      obligationId: string;
      body?: Schemas["RepaymentRequestBody"];
    }) => requestRepayment(obligationId, body),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: OBLIGATIONS_KEY }),
        queryClient.invalidateQueries({ queryKey: ["schedule"] }),
      ]),
  });
}

export function useDisburseObligation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (obligationId: string) => disburseObligation(obligationId),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: OBLIGATIONS_KEY }),
        queryClient.invalidateQueries({ queryKey: ["schedule"] }),
      ]),
  });
}
