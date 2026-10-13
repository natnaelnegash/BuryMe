import { z } from "zod";

// Mirrors contract/openapi.yaml's UpdateProfileRequest and
// VerifyTelebirrRequest schemas (Users tag) exactly.
export const updateProfileRequestSchema = z
  .object({
    display_name: z
      .string()
      .min(2)
      .max(50)
      .regex(/^[A-Za-z0-9 _-]+$/)
      .optional(),
    profile_photo_url: z.string().nullable().optional(),
  })
  .strict();

export const verifyTelebirrRequestSchema = z
  .object({
    telebirr_number: z.string().regex(/^(\+2519\d{8}|09\d{8})$/),
  })
  .strict();

// GET /users/search's query params (q, limit) — not a request body, but
// `parseBody` is a generic Zod-parse helper despite its name and works
// equally well here.
export const searchUsersQuerySchema = z.object({
  q: z.string().min(2).max(100),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// POST /users/me/telebirr/verify body — contract ConfirmTelebirrOtpRequest.
export const confirmTelebirrOtpRequestSchema = z
  .object({
    code: z.string().regex(/^\d{6}$/),
  })
  .strict();
