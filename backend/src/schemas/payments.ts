import { z } from "zod";

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
