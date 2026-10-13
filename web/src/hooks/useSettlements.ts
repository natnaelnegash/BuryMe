import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  acceptSettlementSuggestion,
  createSettlementSuggestion,
  declineSettlementSuggestion,
  getSettlementSuggestion,
  listSettlementSuggestions,
} from "../api/settlements.js";

const SETTLEMENTS_KEY = ["settlements"] as const;

export function useSettlementSuggestionsQuery() {
  return useQuery({
    queryKey: SETTLEMENTS_KEY,
    queryFn: listSettlementSuggestions,
  });
}

export function useSettlementSuggestionQuery(suggestionId: string | undefined) {
  return useQuery({
    queryKey: [...SETTLEMENTS_KEY, "detail", suggestionId],
    queryFn: () => getSettlementSuggestion(suggestionId as string),
    enabled: suggestionId !== undefined,
  });
}

function useInvalidateSettlements() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: SETTLEMENTS_KEY }),
      queryClient.invalidateQueries({ queryKey: ["obligations"] }),
    ]);
}

export function useCreateSettlementSuggestion() {
  const invalidate = useInvalidateSettlements();
  return useMutation({
    mutationFn: (counterpartyUserId: string) => createSettlementSuggestion(counterpartyUserId),
    onSuccess: invalidate,
  });
}

export function useAcceptSettlement() {
  const invalidate = useInvalidateSettlements();
  return useMutation({
    mutationFn: (suggestionId: string) => acceptSettlementSuggestion(suggestionId),
    onSuccess: invalidate,
  });
}

export function useDeclineSettlement() {
  const invalidate = useInvalidateSettlements();
  return useMutation({
    mutationFn: (suggestionId: string) => declineSettlementSuggestion(suggestionId),
    onSuccess: invalidate,
  });
}
