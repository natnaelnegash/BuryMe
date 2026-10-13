import { z } from "zod";

export const createSettlementSuggestionInputSchema = z.object({
  counterparty_user_id: z.string().min(1),
});
