import { Router } from "express";

import { prisma } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { ApiError } from "../middleware/errors.js";
import { parseBody } from "../schemas/parse.js";
import {
  initiateChapaPaymentInputSchema,
  recordExternalPaymentInputSchema,
} from "../schemas/payments.js";
import { repaymentRequestBodySchema } from "../schemas/requests.js";
import {
  assertPayable,
  assertRecipientVerified,
  createChapaPayment,
  partiesFor,
  resolveTarget,
  systemAmount,
  WITH_PAYMENT_PARTIES,
} from "../domain/payments.js";
import { etb, notify } from "../domain/notifications.js";
import { loadObligationHistory } from "../domain/history.js";
import { assertObligationRepayable, createRepaymentRequest } from "../domain/repayment.js";
import { loadSchedule } from "../domain/schedule.js";
import { toObligationHistoryResponse } from "../serializers/history.js";
import { toObligationResponse } from "../serializers/obligation.js";
import { toPaymentResponse } from "../serializers/payment.js";
import { toRequestResponse } from "../serializers/request.js";
import { toScheduleResponse } from "../serializers/schedule.js";

export const obligationsRouter = Router();

obligationsRouter.use(requireAuth);

const WITH_PARTIES = {
  borrower: true,
  lender: true,
  originatingExpense: { select: { expenseId: true } },
} as const;

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

obligationsRouter.get("/", async (req, res, next) => {
  try {
    const uid = req.auth!.uid;
    const { role, status, origin, limit, cursor } = req.query as Record<string, string | undefined>;

    const where: Record<string, unknown> = {};
    if (role === "borrower") where.borrowerId = uid;
    else if (role === "lender") where.lenderId = uid;
    else where.OR = [{ borrowerId: uid }, { lenderId: uid }];
    if (status) where.status = { in: status.split(",") };
    if (origin === "personal") where.originatingExpenseId = null;
    else if (origin === "group") where.originatingExpenseId = { not: null };

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

obligationsRouter.get("/:obligationId", async (req, res, next) => {
  try {
    const obligation = await findObligationForUser(req.params.obligationId, req.auth!.uid);
    res.status(200).json(toObligationResponse(obligation));
  } catch (err) {
    next(err);
  }
});

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

obligationsRouter.post("/:obligationId/disburse", async (req, res, next) => {
  try {
    const uid = req.auth!.uid;
    const obligation = await findObligationForUser(req.params.obligationId, uid);
    const target = await resolveTarget(obligation, "Disbursement", null);
    await assertPayable(obligation, target, uid);
    await assertRecipientVerified(obligation.borrower);
    const payment = await createChapaPayment(obligation, target);
    res.status(201).json(toPaymentResponse(payment));
  } catch (err) {
    next(err);
  }
});

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

obligationsRouter.post("/:obligationId/payments/external", async (req, res, next) => {
  try {
    const uid = req.auth!.uid;
    const obligation = await findObligationForUser(req.params.obligationId, uid);
    const body = parseBody(recordExternalPaymentInputSchema, req.body);

    const direction = body.payment_direction;
    const { payerId, recipientId } = partiesFor(obligation, direction);
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

    const otherPartyId = payment.payerId === uid ? payment.recipientId : payment.payerId;
    const recorder = payment.payerId === uid ? payment.payer : payment.recipient;
    void notify({
      userId: otherPartyId,
      type: "PAY-03",
      params: {
        name: recorder.displayName,
        amount: etb(payment.amount),
        direction: payment.paymentDirection === "Disbursement" ? "Disbursement" : "Repayment",
      },
      referenceId: payment.id,
    });

    res.status(201).json(toPaymentResponse(payment));
  } catch (err) {
    next(err);
  }
});

obligationsRouter.get("/:obligationId/schedule", async (req, res, next) => {
  try {
    const obligation = await findObligationForUser(req.params.obligationId, req.auth!.uid);
    const schedule = await loadSchedule(obligation);
    res.status(200).json(toScheduleResponse(schedule));
  } catch (err) {
    next(err);
  }
});

obligationsRouter.get("/:obligationId/history", async (req, res, next) => {
  try {
    const obligation = await findObligationForUser(req.params.obligationId, req.auth!.uid);
    const events = await loadObligationHistory(obligation);
    res.status(200).json(events.map((event) => toObligationHistoryResponse(event, obligation.id)));
  } catch (err) {
    next(err);
  }
});
