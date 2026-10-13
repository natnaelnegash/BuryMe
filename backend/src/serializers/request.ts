import type { Schemas } from "@buryme/shared";

import type { Request as RequestModel, User } from "../generated/prisma/client.js";
import { DISBURSEMENT_METHOD, REPAYMENT_TYPE } from "./enums.js";
import { toMoney } from "./money.js";
import { toUserSummaryResponse } from "./user.js";

type RequestWithUsers = RequestModel & { initiatingUser: User; receivingUser: User };

type ProposedSchedule = NonNullable<Schemas["Request"]["proposed_schedule"]> | null;
type CounterProposal = NonNullable<Schemas["Request"]["counter_proposal"]> | null;

export function toRequestResponse(request: RequestWithUsers): Schemas["Request"] {
  return {
    request_id: request.id,
    request_type: request.requestType,
    initiating_user: toUserSummaryResponse(request.initiatingUser),
    receiving_user: toUserSummaryResponse(request.receivingUser),
    obligation_id: request.obligationId,
    amount: toMoney(request.amount),
    purpose: request.purpose,
    proposed_repayment_type: request.proposedRepaymentType
      ? REPAYMENT_TYPE[request.proposedRepaymentType]!
      : null,
    proposed_schedule: request.proposedSchedule as unknown as ProposedSchedule,
    proposed_due_date: request.proposedDueDate?.toISOString().slice(0, 10) ?? null,
    disbursement_method: request.disbursementMethod
      ? DISBURSEMENT_METHOD[request.disbursementMethod]!
      : null,
    counter_proposal: request.counterProposal as unknown as CounterProposal,
    installment_id: request.installmentId,
    note: request.note,
    status: request.status,
    created_at: request.createdAt.toISOString(),
    responded_at: request.respondedAt?.toISOString() ?? null,
  };
}
