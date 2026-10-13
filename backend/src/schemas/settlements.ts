import { z } from "zod";

// Settlements (§8.14).
//
// The client names only the other party; the server pairs the obligations
// itself, so there is nothing else to validate here.
export const createSettlementSuggestionInputSchema = z.object({
  counterparty_user_id: z.string().min(1),
});
