import { z, type ZodType } from "zod";

import { ApiError } from "../middleware/errors.js";

// Constraints here come from the contract and PRD §12.2 and are normative —
// do not relax one without changing the contract first.
export function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    throw new ApiError(
      "VALIDATION_ERROR",
      firstIssue?.message ?? "Invalid request body.",
      400,
      firstIssue?.path.join(".") || undefined,
    );
  }
  return result.data;
}

export const moneySchema = z
  .object({
    amount: z.number().min(0.01).max(1_000_000).multipleOf(0.01),
    currency: z.literal("ETB").default("ETB"),
  })
  .strict();
