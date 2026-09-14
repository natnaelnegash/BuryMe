import { prisma } from "../db/client.js";
import { ApiError } from "../middleware/errors.js";
import type { Obligation } from "../generated/prisma/client.js";

// Shared by POST /requests (request_type: Repayment) and the
// /obligations/{id}/repayment-requests convenience wrapper — same rules,
// same shape, one place to keep them in lockstep.
export function assertObligationRepayable(obligation: Obligation, uid: string): void {
  if (obligation.lenderId !== uid) {
    throw new ApiError(
      "VALIDATION_ERROR",
      "Only the lender on this obligation may request repayment.",
      400,
    );
  }
  if (obligation.repaymentType !== "LumpSum") {
    throw new ApiError(
      "VALIDATION_ERROR",
      "Repayment requests are only supported for Lump Sum obligations right now.",
      400,
    );
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isOverdue =
    obligation.status === "Active" &&
    obligation.dueDate < today &&
    obligation.outstandingBalance.toNumber() > 0;
  if (!isOverdue) {
    throw new ApiError("STATUS_CONFLICT", "Nothing on this obligation is currently overdue.", 409);
  }
}

export function createRepaymentRequest(
  obligation: Obligation,
  uid: string,
  note: string | null | undefined,
) {
  return prisma.request.create({
    data: {
      requestType: "Repayment",
      initiatingUserId: uid,
      receivingUserId: obligation.borrowerId,
      obligationId: obligation.id,
      amount: obligation.outstandingBalance,
      note: note ?? null,
      status: "Pending",
    },
    include: { initiatingUser: true, receivingUser: true },
  });
}
