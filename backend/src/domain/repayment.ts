import { prisma } from "../db/client.js";
import type { Installment, Obligation } from "../generated/prisma/client.js";
import { ApiError } from "../middleware/errors.js";
import { etb, notify } from "./notifications.js";
import { loadSchedule } from "./schedule.js";

export interface RepaymentTarget {
  installment: Installment | null;
}

export async function assertObligationRepayable(
  obligation: Obligation,
  uid: string,
  installmentId: string | null | undefined,
): Promise<RepaymentTarget> {
  if (obligation.lenderId !== uid) {
    throw new ApiError(
      "VALIDATION_ERROR",
      "Only the lender on this obligation may request repayment.",
      400,
    );
  }

  if (obligation.repaymentType === "Installments") {
    if (!installmentId) {
      throw new ApiError(
        "VALIDATION_ERROR",
        "Choose which overdue installment to request.",
        400,
        "installment_id",
      );
    }
    const schedule = await loadSchedule(obligation);
    const installment = schedule.installments.find((i) => i.id === installmentId);
    if (!installment) {
      throw new ApiError("NOT_FOUND", "No such installment on this obligation.", 404);
    }
    if (installment.status !== "Overdue") {
      throw new ApiError("STATUS_CONFLICT", "That installment isn't overdue.", 409);
    }
    return { installment };
  }

  if (installmentId) {
    throw new ApiError(
      "VALIDATION_ERROR",
      "This obligation is repaid as a lump sum — no installment to target.",
      400,
      "installment_id",
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
  return { installment: null };
}

export async function createRepaymentRequest(
  obligation: Obligation,
  uid: string,
  target: RepaymentTarget,
  note: string | null | undefined,
) {
  const request = await prisma.request.create({
    data: {
      requestType: "Repayment",
      initiatingUserId: uid,
      receivingUserId: obligation.borrowerId,
      obligationId: obligation.id,
      amount: target.installment ? target.installment.amount : obligation.outstandingBalance,
      installmentId: target.installment?.id ?? null,
      note: note ?? null,
      status: "Pending",
    },
    include: { initiatingUser: true, receivingUser: true },
  });

  void notify({
    userId: request.receivingUserId,
    type: "RR-01",
    params: { name: request.initiatingUser.displayName, amount: etb(request.amount) },
    referenceId: obligation.id,
  });

  return request;
}
