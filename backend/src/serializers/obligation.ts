import type { Schemas } from "@buryme/shared";

import type { Obligation as ObligationModel, User } from "../generated/prisma/client.js";
import { DISBURSEMENT_METHOD, OBLIGATION_STATUS, REPAYMENT_TYPE } from "./enums.js";
import { toMoney } from "./money.js";
import { toUserSummaryResponse } from "./user.js";

type ObligationWithUsers = ObligationModel & { borrower: User; lender: User };

export function toObligationResponse(obligation: ObligationWithUsers): Schemas["Obligation"] {
  return {
    obligation_id: obligation.id,
    borrower: toUserSummaryResponse(obligation.borrower),
    lender: toUserSummaryResponse(obligation.lender),
    originating_request_id: obligation.originatingRequestId,
    // No group-expense support yet (Slice 7) — always null until then.
    originating_expense_id: null,
    principal_amount: toMoney(obligation.principalAmount),
    outstanding_balance: toMoney(obligation.outstandingBalance),
    purpose: obligation.purpose,
    repayment_type: REPAYMENT_TYPE[obligation.repaymentType]!,
    disbursement_method: DISBURSEMENT_METHOD[obligation.disbursementMethod]!,
    due_date: obligation.dueDate.toISOString().slice(0, 10),
    status: OBLIGATION_STATUS[obligation.status]!,
    created_at: obligation.createdAt.toISOString(),
    settled_at: obligation.settledAt?.toISOString() ?? null,
  };
}
