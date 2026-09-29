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
// `parseBody` below is a generic Zod-parse helper despite its name and
// works equally well here.
export const searchUsersQuerySchema = z.object({
  q: z.string().min(2).max(100),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ── Requests (§8.5, §12.2.2) ─────────────────────────────────────────

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export const moneySchema = z
  .object({
    amount: z.number().min(0.01).max(1_000_000).multipleOf(0.01),
    currency: z.literal("ETB").default("ETB"),
  })
  .strict();

export const proposedScheduleInputSchema = z
  .object({
    installments: z
      .array(z.object({ amount: moneySchema, due_date: z.string().regex(DATE_ONLY) }).strict())
      .min(2)
      .max(60),
  })
  .strict();

const dueDateSchema = z.string().regex(DATE_ONLY);

export const borrowRequestInputSchema = z
  .object({
    request_type: z.literal("Borrow"),
    recipient_user_id: z.string().min(1),
    amount: moneySchema,
    purpose: z.string().min(3).max(200),
    proposed_repayment_type: z.enum(["Lump Sum", "Installments"]),
    proposed_schedule: proposedScheduleInputSchema.optional(),
    proposed_due_date: dueDateSchema,
  })
  .strict();

export const lendRequestInputSchema = z
  .object({
    request_type: z.literal("Lend"),
    recipient_user_id: z.string().min(1),
    amount: moneySchema,
    purpose: z.string().min(3).max(200),
    proposed_repayment_type: z.enum(["Lump Sum", "Installments"]),
    proposed_schedule: proposedScheduleInputSchema.optional(),
    proposed_due_date: dueDateSchema,
    disbursement_method: z.enum(["Already Given", "Through App"]),
  })
  .strict();

// Repayment is scoped to Lump Sum obligations only for now (Slice 3) —
// `installment_id` is required iff the obligation is Installments — the
// route checks that against the schedule.
export const repaymentRequestBodySchema = z
  .object({
    installment_id: z.string().min(1).nullable().optional(),
    note: z.string().max(300).nullable().optional(),
  })
  .strict();

export const repaymentRequestInputSchema = z
  .object({
    request_type: z.literal("Repayment"),
    obligation_id: z.string().min(1),
  })
  .merge(repaymentRequestBodySchema);

export const createRequestInputSchema = z.discriminatedUnion("request_type", [
  borrowRequestInputSchema,
  lendRequestInputSchema,
  repaymentRequestInputSchema,
]);

// All fields optional (a counter may adjust only some terms), but at least
// one must be present — an empty counter is meaningless regardless of
// request type. Note these fields don't meaningfully fit Repayment's shape
// (installment_id/note) — permitted by the schema, but no web UI exercises
// countering a Repayment request.
export const counterProposalInputSchema = z
  .object({
    amount: moneySchema.optional(),
    proposed_repayment_type: z.enum(["Lump Sum", "Installments"]).optional(),
    proposed_schedule: proposedScheduleInputSchema.optional(),
    proposed_due_date: dueDateSchema.optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, { message: "Counter body must not be empty." });

export const acceptRequestInputSchema = z
  .object({
    disbursement_method: z.enum(["Already Given", "Through App"]).optional(),
  })
  .strict();

export interface ProposedTerms {
  amount: number;
  repaymentType: "Lump Sum" | "Installments";
  schedule: { installments: { amount: { amount: number }; due_date: string }[] } | null;
  dueDate: string;
}

// Cross-field validation shared by request creation and counter submission
// (§12.2.2/§12.2.3): schedule required iff Installments; 2-60 entries;
// entries sum to the amount (0.01 tolerance); dates strictly ascending,
// each in the future, none past the overall due date; due_date itself
// 1 day to 3 years out.
export function assertValidProposedTerms(terms: ProposedTerms): void {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(terms.dueDate);
  const minDue = new Date(today);
  minDue.setDate(minDue.getDate() + 1);
  const maxDue = new Date(today);
  maxDue.setFullYear(maxDue.getFullYear() + 3);

  if (dueDate < minDue || dueDate > maxDue) {
    throw new ApiError(
      "VALIDATION_ERROR",
      "The due date must be 1 day to 3 years from today.",
      400,
      "proposed_due_date",
    );
  }

  if (terms.repaymentType === "Installments") {
    if (!terms.schedule) {
      throw new ApiError(
        "VALIDATION_ERROR",
        "A schedule is required when proposed_repayment_type is Installments.",
        400,
        "proposed_schedule",
      );
    }
    const { installments } = terms.schedule;
    const sum = installments.reduce((total, i) => total + i.amount.amount, 0);
    if (Math.abs(sum - terms.amount) > 0.01) {
      throw new ApiError(
        "VALIDATION_ERROR",
        "The schedule's installment amounts must sum to the requested amount.",
        400,
        "proposed_schedule",
      );
    }
    let previous = today;
    for (const installment of installments) {
      const d = new Date(installment.due_date);
      if (d <= previous || d <= today) {
        throw new ApiError(
          "VALIDATION_ERROR",
          "Installment due dates must be strictly ascending and in the future.",
          400,
          "proposed_schedule",
        );
      }
      if (d > dueDate) {
        throw new ApiError(
          "VALIDATION_ERROR",
          "No installment may be due after the overall due date.",
          400,
          "proposed_schedule",
        );
      }
      previous = d;
    }
  } else if (terms.schedule) {
    throw new ApiError(
      "VALIDATION_ERROR",
      "proposed_schedule must be omitted when proposed_repayment_type is Lump Sum.",
      400,
      "proposed_schedule",
    );
  }
}

// Parses `body` against `schema`; throws a 400 VALIDATION_ERROR ApiError
// (with the first failing field, per the contract's Error.field convention)
// instead of returning a Zod result, so route handlers can call this and
// trust the return type without an extra branch.
// ── Settlements (§8.14) ──────────────────────────────────────────────

// The client names only the other party; the server pairs the obligations
// itself, so there is nothing else to validate here.
export const createSettlementSuggestionInputSchema = z.object({
  counterparty_user_id: z.string().min(1),
});

// ── Notifications (§8.11) ────────────────────────────────────────────

// Omitting `notification_ids` marks the whole feed read, per the contract.
export const markNotificationsReadSchema = z.object({
  notification_ids: z.array(z.string().min(1)).optional(),
});

// Every switch is optional: PATCH leaves omitted categories alone.
export const notificationPreferencesSchema = z.object({
  requests: z.boolean().optional(),
  group_expenses: z.boolean().optional(),
  payments: z.boolean().optional(),
  schedules: z.boolean().optional(),
  settlements: z.boolean().optional(),
  reminders: z.boolean().optional(),
  telebirr: z.boolean().optional(),
});

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

// POST /users/me/telebirr/verify body — contract ConfirmTelebirrOtpRequest.
export const confirmTelebirrOtpRequestSchema = z
  .object({
    code: z.string().regex(/^\d{6}$/),
  })
  .strict();

// POST /obligations/{id}/payments/chapa body — contract
// InitiateChapaPaymentInput. `installment_id` required iff Installments.
export const initiateChapaPaymentInputSchema = z
  .object({
    installment_id: z.string().min(1).nullable().optional(),
  })
  .strict();

// POST /obligations/{id}/payments/external body — contract
// RecordExternalPaymentInput (§12.2.4). Date bounds are checked in the route
// against the obligation; the enum is the contract's ExternalPaymentMethodNote.
export const recordExternalPaymentInputSchema = z
  .object({
    payment_direction: z.enum(["Disbursement", "Repayment"]),
    installment_id: z.string().min(1).nullable().optional(),
    payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    external_method_note: z.enum(["Cash", "Bank Transfer", "Mobile Money", "Other"]),
    note: z.string().max(300).nullable().optional(),
  })
  .strict();

// POST /group-expenses body — contract CreateGroupExpenseInput (§12.2.2).
// Cross-field rules (sum tolerance, payer not a participant, date bounds)
// live in assertValidGroupExpense below, next to the shape they check.
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
