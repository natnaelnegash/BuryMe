import { z, type ZodType } from "zod";

import { ApiError } from "../middleware/errors.js";

// Inbound contract mapping, the mirror of serializers/: these schemas parse
// what clients send, serializers render what the API returns. One file per
// resource, matching routes/ and the contract's tags.
//
// Everything here is taken from contract/openapi.yaml and PRD §12.2, which
// are normative — do not relax a constraint without changing the contract
// first (CLAUDE.md).

// Parses `body` against `schema`; throws a 400 VALIDATION_ERROR ApiError
// (with the first failing field, per the contract's Error.field convention)
// instead of returning a Zod result, so route handlers can call this and
// trust the return type without an extra branch.
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

// The contract's Money schema: always ETB, at most 2 decimal places.
// Shared by requests and group expenses.
export const moneySchema = z
  .object({
    amount: z.number().min(0.01).max(1_000_000).multipleOf(0.01),
    currency: z.literal("ETB").default("ETB"),
  })
  .strict();
