import type { Schemas } from "@buryme/shared";

import type { Payment as PaymentModel, User } from "../generated/prisma/client.js";
import { PAYMENT_STATUS } from "./enums.js";
import { toMoney } from "./money.js";
import { toUserSummaryResponse } from "./user.js";

export type PaymentWithUsers = PaymentModel & { payer: User; recipient: User };

export function toPaymentResponse(payment: PaymentWithUsers): Schemas["Payment"] {
  return {
    payment_id: payment.id,
    obligation_id: payment.obligationId,
    installment_id: payment.installmentId,
    payer: toUserSummaryResponse(payment.payer),
    recipient: toUserSummaryResponse(payment.recipient),
    amount: toMoney(payment.amount),
    // Direction and method have no spaces, so Prisma's identifiers already
    // equal the contract strings — no map needed.
    payment_direction: payment.paymentDirection,
    payment_method: payment.paymentMethod,
    recorded_by_user_id: payment.recordedByUserId,
    // Stored as a plain string (Slice 5 validates it against the contract
    // enum on input), so narrow it back here.
    external_method_note:
      (payment.externalMethodNote as Schemas["ExternalPaymentMethodNote"] | null) ?? null,
    chapa_transaction_id: payment.chapaTransactionId,
    checkout_url: payment.checkoutUrl,
    status: PAYMENT_STATUS[payment.status]!,
    recorded_at: payment.recordedAt.toISOString(),
    confirmed_at: payment.confirmedAt?.toISOString() ?? null,
  };
}
