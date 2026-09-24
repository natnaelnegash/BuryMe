import { Router } from "express";

import { prisma } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { ApiError } from "../middleware/errors.js";
import {
  initiateChapaPaymentInputSchema,
  parseBody,
  recordExternalPaymentInputSchema,
  repaymentRequestBodySchema,
} from "../lib/validation.js";
import {
  assertPayable,
  assertRecipientVerified,
  createChapaPayment,
  partiesFor,
  resolveTarget,
  systemAmount,
  WITH_PAYMENT_PARTIES,
} from "../lib/payments.js";
import { assertObligationRepayable, createRepaymentRequest } from "../lib/repayment.js";
import { loadSchedule } from "../lib/schedule.js";
import { toObligationResponse } from "../serializers/obligation.js";
import { toPaymentResponse } from "../serializers/payment.js";
import { toRequestResponse } from "../serializers/request.js";
import { toScheduleResponse } from "../serializers/schedule.js";

export const obligationsRouter = Router();

obligationsRouter.use(requireAuth);

const WITH_PARTIES = {
  borrower: true,
  lender: true,
  // Only the expense id is needed — the serializer reads through this row
  // so `originating_expense_id` names the expense, not the share row.
  originatingExpense: { select: { expenseId: true } },
} as const;

// Only a party to the obligation may see or act on it.
async function findObligationForUser(obligationId: string, uid: string) {
  const obligation = await prisma.obligation.findFirst({
    where: { id: obligationId, OR: [{ borrowerId: uid }, { lenderId: uid }] },
    include: WITH_PARTIES,
  });
  if (!obligation) {
    throw new ApiError("NOT_FOUND", "No obligation exists with that id.", 404);
  }
  return obligation;
}

// GET /obligations
obligationsRouter.get("/", async (req, res, next) => {
  try {
    const uid = req.auth!.uid;
    const { role, status, limit, cursor } = req.query as Record<string, string | undefined>;

    const where: Record<string, unknown> = {};
    if (role === "borrower") where.borrowerId = uid;
    else if (role === "lender") where.lenderId = uid;
    else where.OR = [{ borrowerId: uid }, { lenderId: uid }];
    if (status) where.status = { in: status.split(",") };

    const take = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const obligations = await prisma.obligation.findMany({
      where,
      include: WITH_PARTIES,
      orderBy: { createdAt: "desc" },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = obligations.length > take;
    const page = hasMore ? obligations.slice(0, take) : obligations;
    res.status(200).json({
      data: page.map(toObligationResponse),
      next_cursor: hasMore ? page[page.length - 1]!.id : null,
    });
  } catch (err) {
    next(err);
  }
});

// GET /obligations/:obligationId
obligationsRouter.get("/:obligationId", async (req, res, next) => {
  try {
    const obligation = await findObligationForUser(req.params.obligationId, req.auth!.uid);
    res.status(200).json(toObligationResponse(obligation));
  } catch (err) {
    next(err);
  }
});

// POST /obligations/:obligationId/repayment-requests — convenience wrapper,
// equivalent to POST /requests with request_type: Repayment and
// obligation_id pre-filled. Same Lump-Sum-only, overdue-only rules as the
// main endpoint (see routes/requests.ts).
obligationsRouter.post("/:obligationId/repayment-requests", async (req, res, next) => {
  try {
    const uid = req.auth!.uid;
    const obligation = await findObligationForUser(req.params.obligationId, uid);
    const body = parseBody(repaymentRequestBodySchema, req.body);
    const target = await assertObligationRepayable(obligation, uid, body.installment_id);
    const request = await createRepaymentRequest(obligation, uid, target, body.note);
    res.status(201).json(toRequestResponse(request));
  } catch (err) {
    next(err);
  }
});

// POST /obligations/:obligationId/disburse — contract: disburseObligation.
// First hop of a Through-App disbursement: the *lender* pays the principal
// into BuryMe's merchant balance via a Chapa checkout. The checkout webhook
// then starts the transfer to the borrower (lib/chapaPayments.ts), and the
// transfer webhook flips the obligation to Active. BuryMe never fronts the
// money — the obligation stays Pending Disbursement until both hops land.
obligationsRouter.post("/:obligationId/disburse", async (req, res, next) => {
  try {
    const uid = req.auth!.uid;
    const obligation = await findObligationForUser(req.params.obligationId, uid);
    const target = await resolveTarget(obligation, "Disbursement", null);
    await assertPayable(obligation, target, uid);
    // Checked up front so the lender doesn't pay in for a transfer that
    // can't complete; re-checked by the transfer hop itself.
    await assertRecipientVerified(obligation.borrower);
    const payment = await createChapaPayment(obligation, target);
    res.status(201).json(toPaymentResponse(payment));
  } catch (err) {
    next(err);
  }
});

// GET /obligations/:obligationId/payments — contract: listPayments.
obligationsRouter.get("/:obligationId/payments", async (req, res, next) => {
  try {
    const obligation = await findObligationForUser(req.params.obligationId, req.auth!.uid);
    const payments = await prisma.payment.findMany({
      where: { obligationId: obligation.id },
      include: WITH_PAYMENT_PARTIES,
      orderBy: { recordedAt: "desc" },
    });
    res.status(200).json(payments.map(toPaymentResponse));
  } catch (err) {
    next(err);
  }
});

// POST /obligations/:obligationId/payments/chapa — contract:
// initiateChapaPayment. A Repayment: the borrower pays the outstanding
// balance into a Chapa checkout; the webhooks transfer it to the lender and
// settle the obligation. (A Disbursement here is the same as /disburse.)
obligationsRouter.post("/:obligationId/payments/chapa", async (req, res, next) => {
  try {
    const uid = req.auth!.uid;
    const obligation = await findObligationForUser(req.params.obligationId, uid);
    const body = parseBody(initiateChapaPaymentInputSchema, req.body ?? {});
    const direction = obligation.status === "PendingDisbursement" ? "Disbursement" : "Repayment";
    const target = await resolveTarget(obligation, direction, body.installment_id);
    await assertPayable(obligation, target, uid);
    const recipient = direction === "Disbursement" ? obligation.borrower : obligation.lender;
    await assertRecipientVerified(recipient);
    const payment = await createChapaPayment(obligation, target);
    res.status(201).json(toPaymentResponse(payment));
  } catch (err) {
    next(err);
  }
});

// POST /obligations/:obligationId/payments/external — contract:
// recordExternalPayment. Either party records money that moved outside the
// platform; it sits Pending Acknowledgement until the counterparty confirms
// or disputes it (routes/payments.ts). Amount is system-set (§12.2.4).
obligationsRouter.post("/:obligationId/payments/external", async (req, res, next) => {
  try {
    const uid = req.auth!.uid;
    const obligation = await findObligationForUser(req.params.obligationId, uid);
    const body = parseBody(recordExternalPaymentInputSchema, req.body);

    const direction = body.payment_direction;
    const { payerId, recipientId } = partiesFor(obligation, direction);
    // Either side may record, but the payment is always from payer to
    // recipient as the direction dictates — so the rules are checked against
    // the payer, not the caller.
    const target = await resolveTarget(obligation, direction, body.installment_id);
    await assertPayable(obligation, target, payerId);

    const paymentDate = new Date(`${body.payment_date}T00:00:00.000Z`);
    if (paymentDate.getTime() > Date.now()) {
      throw new ApiError(
        "VALIDATION_ERROR",
        "Payment date can't be in the future.",
        400,
        "payment_date",
      );
    }
    if (
      paymentDate.getTime() < new Date(obligation.createdAt.toISOString().slice(0, 10)).getTime()
    ) {
      throw new ApiError(
        "VALIDATION_ERROR",
        "Payment date can't be before the obligation was created.",
        400,
        "payment_date",
      );
    }

    const payment = await prisma.payment.create({
      data: {
        obligationId: obligation.id,
        payerId,
        recipientId,
        amount: systemAmount(obligation, target),
        paymentDirection: direction,
        paymentMethod: "External",
        installmentId: target.installment?.id ?? null,
        status: "PendingAcknowledgement",
        recordedByUserId: uid,
        externalMethodNote: body.external_method_note,
        recordedAt: paymentDate,
      },
      include: WITH_PAYMENT_PARTIES,
    });
    res.status(201).json(toPaymentResponse(payment));
  } catch (err) {
    next(err);
  }
});

// GET /obligations/:obligationId/schedule — contract: getSchedule. 404 for
// Lump Sum; backfills pre-Slice-6 Installments obligations on first read.
obligationsRouter.get("/:obligationId/schedule", async (req, res, next) => {
  try {
    const obligation = await findObligationForUser(req.params.obligationId, req.auth!.uid);
    const schedule = await loadSchedule(obligation);
    res.status(200).json(toScheduleResponse(schedule));
  } catch (err) {
    next(err);
  }
});
