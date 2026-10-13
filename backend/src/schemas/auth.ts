import { z } from "zod";

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
