import type { Schemas } from "@buryme/shared";
import { Router } from "express";

import { prisma } from "../db/client.js";
import { assertValidGroupExpense } from "../lib/groupExpense.js";
import { etb, notify } from "../lib/notifications.js";
import { createGroupExpenseInputSchema, parseBody } from "../lib/validation.js";
import { requireAuth } from "../middleware/auth.js";
import { ApiError } from "../middleware/errors.js";
import { toGroupExpenseResponse, WITH_EXPENSE_PARTIES } from "../serializers/groupExpense.js";

// Group expenses (§6.2.3, §8.12, §8.13): one payer records a shared bill and
// the platform spawns one bilateral Obligation per participant — payer as
// lender, participant as borrower, for that participant's share. The payer's
// own share is recorded for completeness but never becomes an obligation.
export const groupExpensesRouter = Router();

groupExpensesRouter.use(requireAuth);

// POST /group-expenses — contract: createGroupExpense.
groupExpensesRouter.post("/", async (req, res, next) => {
  try {
    const uid = req.auth!.uid;
    const body = parseBody(createGroupExpenseInputSchema, req.body);
    await assertValidGroupExpense(body, uid);

    // Everything in one transaction: a half-created expense would leave
    // participants owing money on a bill that doesn't exist.
    const expense = await prisma.$transaction(async (tx) => {
      const created = await tx.groupExpense.create({
        data: {
          payerId: uid,
          totalAmount: body.total_amount.amount,
          description: body.description,
          expenseDate: new Date(body.expense_date),
          dueDate: new Date(body.due_date),
          payerShareIncluded: body.payer_share_included,
          payerShareAmount: body.payer_share_amount?.amount ?? null,
          participants: {
            create: body.participants.map((p) => ({
              participantId: p.participant_user_id,
              assignedAmount: p.assigned_amount.amount,
            })),
          },
        },
        include: { participants: true },
      });

      // The payer already settled the bill outside the platform, so each
      // obligation is Already Given and Active from the start.
      for (const entry of created.participants) {
        await tx.obligation.create({
          data: {
            borrowerId: entry.participantId,
            lenderId: uid,
            originatingExpenseId: entry.id,
            principalAmount: entry.assignedAmount,
            outstandingBalance: entry.assignedAmount,
            purpose: body.description,
            repaymentType: "LumpSum",
            disbursementMethod: "AlreadyGiven",
            dueDate: new Date(body.due_date),
            status: "Active",
          },
        });
      }

      return tx.groupExpense.findUniqueOrThrow({
        where: { id: created.id },
        include: WITH_EXPENSE_PARTIES,
      });
    });

    // GE-01 to each participant — never to the payer, who has no obligation
    // of their own (§8.12).
    for (const entry of expense.participants) {
      void notify({
        userId: entry.participantId,
        type: "GE-01",
        params: {
          name: expense.payer.displayName,
          amount: etb(entry.assignedAmount),
        },
        referenceId: entry.obligation?.id ?? null,
      });
    }

    res.status(201).json(toGroupExpenseResponse(expense, uid));
  } catch (err) {
    next(err);
  }
});

// GET /group-expenses — contract: listGroupExpenses.
groupExpensesRouter.get("/", async (req, res, next) => {
  try {
    const uid = req.auth!.uid;
    const { role, limit, cursor } = req.query as Record<string, string | undefined>;

    const where =
      role === "payer"
        ? { payerId: uid }
        : role === "participant"
          ? { participants: { some: { participantId: uid } } }
          : { OR: [{ payerId: uid }, { participants: { some: { participantId: uid } } }] };

    const take = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const expenses = await prisma.groupExpense.findMany({
      where,
      include: WITH_EXPENSE_PARTIES,
      orderBy: { createdAt: "desc" },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = expenses.length > take;
    const page = hasMore ? expenses.slice(0, take) : expenses;
    res.status(200).json({
      data: page.map((e) => toGroupExpenseResponse(e, uid)),
      next_cursor: hasMore ? page[page.length - 1]!.id : null,
    } satisfies { data: Schemas["GroupExpense"][]; next_cursor: string | null });
  } catch (err) {
    next(err);
  }
});

// GET /group-expenses/:groupExpenseId — contract: getGroupExpense. Visible
// to the payer and to anyone who owes a share of it.
groupExpensesRouter.get("/:groupExpenseId", async (req, res, next) => {
  try {
    const uid = req.auth!.uid;
    const expense = await prisma.groupExpense.findFirst({
      where: {
        id: req.params.groupExpenseId,
        OR: [{ payerId: uid }, { participants: { some: { participantId: uid } } }],
      },
      include: WITH_EXPENSE_PARTIES,
    });
    if (!expense) {
      throw new ApiError("NOT_FOUND", "No group expense exists with that id.", 404);
    }
    res.status(200).json(toGroupExpenseResponse(expense, uid));
  } catch (err) {
    next(err);
  }
});
