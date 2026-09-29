import type { Schemas } from "@buryme/shared";

import type { Prisma } from "../generated/prisma/client.js";
import { toMoney } from "./money.js";
import { toUserSummaryResponse } from "./user.js";

export type SettlementWithParties = Prisma.SettlementSuggestionGetPayload<{
  include: { userA: true; userB: true; netPayer: true; netRecipient: true };
}>;

export const WITH_SETTLEMENT_PARTIES = {
  userA: true,
  userB: true,
  netPayer: true,
  netRecipient: true,
} as const;

// `SettlementResponse` needs no enum map: every member (Pending / Accepted
// / Declined) is already identical to the contract string, so it passes
// through the same way RequestStatus does.
export function toSettlementSuggestionResponse(
  suggestion: SettlementWithParties,
): Schemas["SettlementSuggestion"] {
  return {
    suggestion_id: suggestion.id,
    user_a: toUserSummaryResponse(suggestion.userA),
    user_b: toUserSummaryResponse(suggestion.userB),
    obligation_id_a: suggestion.obligationAId,
    obligation_id_b: suggestion.obligationBId,
    net_amount: toMoney(suggestion.netAmount),
    net_payer: toUserSummaryResponse(suggestion.netPayer),
    net_recipient: toUserSummaryResponse(suggestion.netRecipient),
    user_a_response: suggestion.userAResponse,
    user_b_response: suggestion.userBResponse,
    status: suggestion.status,
    created_at: suggestion.createdAt.toISOString(),
    resolved_at: suggestion.resolvedAt?.toISOString() ?? null,
  };
}
