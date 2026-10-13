import { z } from "zod";

import { ApiError } from "../middleware/errors.js";
import { moneySchema } from "./parse.js";

// Requests (§8.5, §12.2.2).

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

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
