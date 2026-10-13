import { z } from "zod";

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
