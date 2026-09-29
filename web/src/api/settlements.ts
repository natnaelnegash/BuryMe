import type { Schemas } from "@buryme/shared";

import { apiClient } from "./client.js";

export const listSettlementSuggestions = () =>
  apiClient.get<Schemas["SettlementSuggestion"][]>("/settlements/suggestions");

export const getSettlementSuggestion = (suggestionId: string) =>
  apiClient.get<Schemas["SettlementSuggestion"]>(
    `/settlements/suggestions/${encodeURIComponent(suggestionId)}`,
  );

export const createSettlementSuggestion = (counterpartyUserId: string) =>
  apiClient.post<Schemas["SettlementSuggestion"]>("/settlements/suggestions", {
    counterparty_user_id: counterpartyUserId,
  });

export const acceptSettlementSuggestion = (suggestionId: string) =>
  apiClient.post<Schemas["SettlementSuggestion"]>(
    `/settlements/suggestions/${encodeURIComponent(suggestionId)}/accept`,
  );

export const declineSettlementSuggestion = (suggestionId: string) =>
  apiClient.post<Schemas["SettlementSuggestion"]>(
    `/settlements/suggestions/${encodeURIComponent(suggestionId)}/decline`,
  );
