import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Schemas } from "@buryme/shared";

import {
  disburseObligation,
  getObligation,
  listObligations,
  requestRepayment,
} from "../api/obligations.js";

const OBLIGATIONS_KEY = ["obligations"] as const;

export function useObligationsQuery(params?: { role?: "borrower" | "lender" }) {
  return useQuery({
    queryKey: [...OBLIGATIONS_KEY, params?.role ?? "all"],
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: OBLIGATIONS_KEY }),
  });
}

export function useDisburseObligation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (obligationId: string) => disburseObligation(obligationId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: OBLIGATIONS_KEY }),
  });
}
