import { Prisma } from "../generated/prisma/client.js";

import { prisma } from "../db/client.js";
import { ApiError } from "../middleware/errors.js";
import type { createGroupExpenseInputSchema } from "./validation.js";
import type { z } from "zod";

// parseBody infers the schema's *input* type (currency has a default), so
// match that rather than the parsed output.
export type GroupExpenseInput = z.input<typeof createGroupExpenseInputSchema>;

// Cross-field validation for a group expense (§12.2.2), plus the lookups
// that make it meaningful: participants must be real users, distinct, and
// not the payer. Kept out of the zod schema because it needs the caller's
// identity and the database.
export async function assertValidGroupExpense(
  body: GroupExpenseInput,
  payerId: string,
): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expenseDate = new Date(body.expense_date);
  const dueDate = new Date(body.due_date);

  if (expenseDate.getTime() > today.getTime()) {
    throw new ApiError("VALIDATION_ERROR", "The expense date can't be in the future.", 400, "expense_date");
  }
  if (dueDate.getTime() < expenseDate.getTime()) {
    throw new ApiError(
      "VALIDATION_ERROR",
      "The due date can't be before the expense date.",
      400,
      "due_date",
    );
  }
  const maxDue = new Date(today);
  maxDue.setFullYear(maxDue.getFullYear() + 3);
  if (dueDate.getTime() > maxDue.getTime()) {
    throw new ApiError("VALIDATION_ERROR", "The due date can't be more than 3 years away.", 400, "due_date");
  }

  if (body.payer_share_included && !body.payer_share_amount) {
    throw new ApiError(
      "VALIDATION_ERROR",
      "Enter your own share, or turn off including yourself.",
      400,
      "payer_share_amount",
    );
  }
  if (!body.payer_share_included && body.payer_share_amount) {
    throw new ApiError(
      "VALIDATION_ERROR",
      "Your share is only recorded when you're included in the split.",
      400,
      "payer_share_amount",
    );
  }

  const ids = body.participants.map((p) => p.participant_user_id);
  if (new Set(ids).size !== ids.length) {
    throw new ApiError("VALIDATION_ERROR", "Each participant can only appear once.", 400, "participants");
  }
  if (ids.includes(payerId)) {
    throw new ApiError(
      "VALIDATION_ERROR",
      "You're the payer — use “include me in this split” rather than adding yourself.",
      400,
      "participants",
    );
  }

  // Shares (plus the payer's own, when included) must reconstruct the
  // total within 0.01 ETB.
  const assigned = body.participants.reduce(
    (sum, p) => sum.plus(new Prisma.Decimal(p.assigned_amount.amount)),
    new Prisma.Decimal(body.payer_share_amount?.amount ?? 0),
  );
  if (assigned.minus(new Prisma.Decimal(body.total_amount.amount)).abs().greaterThan(0.01)) {
    throw new ApiError(
      "VALIDATION_ERROR",
      "The shares have to add up to the total amount.",
      400,
      "participants",
    );
  }

  const found = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true } });
  if (found.length !== ids.length) {
    throw new ApiError(
      "VALIDATION_ERROR",
      "One of those participants no longer exists.",
      400,
      "participants",
    );
  }
}
