import type { Schemas } from "@buryme/shared";

import type { ObligationHistoryEvent, ObligationHistoryPayload } from "../domain/history.js";
import { DISBURSEMENT_METHOD, REPAYMENT_TYPE } from "./enums.js";
import { toMoney } from "./money.js";
import { toUserSummaryResponse } from "./user.js";

function toEventDetail(payload: ObligationHistoryPayload): Record<string, unknown> {
  switch (payload.kind) {
    case "created":
      return {
        amount: toMoney(payload.principalAmount),
        purpose: payload.purpose,
        repayment_type: REPAYMENT_TYPE[payload.repaymentType]!,
        disbursement_method: DISBURSEMENT_METHOD[payload.disbursementMethod]!,
        due_date: payload.dueDate.toISOString().slice(0, 10),
        from_request_id: payload.fromRequestId,
        from_expense_id: payload.fromExpenseId,
      };
    case "termsChanged":
      return {
        // The counter is stored as the CounterProposalInput the client sent,
        // so it is already in contract shape.
        proposed: {
          amount: toMoney(payload.proposedAmount),
          repayment_type: payload.proposedRepaymentType
            ? REPAYMENT_TYPE[payload.proposedRepaymentType]!
            : null,
          due_date: payload.proposedDueDate?.toISOString().slice(0, 10) ?? null,
        },
        agreed: payload.counterProposal,
      };
    case "payment":
      return {
        payment_id: payload.payment.id,
        amount: toMoney(payload.payment.amount),
        payment_direction: payload.payment.paymentDirection,
        payment_method: payload.payment.paymentMethod,
        installment_id: payload.payment.installmentId,
      };
    case "dispute":
      return {
        payment_id: payload.payment.id,
        amount: toMoney(payload.payment.amount),
        payment_direction: payload.payment.paymentDirection,
        recorded_at: payload.payment.recordedAt.toISOString(),
      };
    case "settled":
      return {
        cleared_by_payment_id: payload.clearedBy?.id ?? null,
      };
  }
}

export function toObligationHistoryResponse(
  event: ObligationHistoryEvent,
  obligationId: string,
): Schemas["ObligationHistoryEntry"] {
  return {
    history_id: event.id,
    obligation_id: obligationId,
    event_type: event.eventType,
    initiated_by: toUserSummaryResponse(event.initiatedBy),
    event_detail: toEventDetail(event.payload),
    occurred_at: event.occurredAt.toISOString(),
  };
}
