import { z } from "zod";

import { moneySchema } from "./parse.js";

export const createGroupExpenseInputSchema = z
  .object({
    total_amount: moneySchema,
    description: z.string().min(3).max(200),
    expense_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    payer_share_included: z.boolean(),
    payer_share_amount: moneySchema.nullable().optional(),
    participants: z
      .array(
        z.object({
          participant_user_id: z.string().min(1),
          assigned_amount: moneySchema,
        }),
      )
      .min(1)
      .max(50),
  })
  .strict();
