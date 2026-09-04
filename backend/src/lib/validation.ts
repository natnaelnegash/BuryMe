import { z, type ZodType } from "zod";

import { ApiError } from "../middleware/errors.js";

// Mirrors contract/openapi.yaml's RegisterRequest and FcmTokenRequest
// schemas exactly (§12.2.1). Keep these in lockstep with the contract —
// if the contract changes, update here too.
export const registerRequestSchema = z
  .object({
    display_name: z
      .string()
      .min(2)
      .max(50)
      .regex(/^[A-Za-z0-9 _-]+$/),
  })
  .strict();

export const fcmTokenRequestSchema = z
  .object({
    fcm_token: z.string().min(1),
    platform: z.enum(["android", "ios", "web"]),
  })
  .strict();

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
