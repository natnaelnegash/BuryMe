import { Router } from "express";

import { prisma } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { ApiError } from "../middleware/errors.js";
import { etb, notify, notifySettledIfCleared } from "../domain/notifications.js";
import { confirmedPaymentEffects, WITH_PAYMENT_PARTIES } from "../domain/payments.js";
import { toPaymentResponse } from "../serializers/payment.js";

export const paymentsRouter = Router();

paymentsRouter.use(requireAuth);

async function findPendingExternalForCounterparty(paymentId: string, uid: string) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { ...WITH_PAYMENT_PARTIES, obligation: true },
  });
  if (!payment || (payment.payerId !== uid && payment.recipientId !== uid)) {
    throw new ApiError("NOT_FOUND", "No payment exists with that id.", 404);
  }
  if (payment.paymentMethod !== "External") {
    throw new ApiError(
      "STATUS_CONFLICT",
      "Chapa payments are confirmed automatically and can't be acknowledged by hand.",
      409,
    );
  }
  if (payment.status !== "PendingAcknowledgement") {
    throw new ApiError("STATUS_CONFLICT", "This payment is no longer awaiting a response.", 409);
  }
  if (payment.recordedByUserId === uid) {
    throw new ApiError(
      "UNAUTHORIZED",
      "The other party has to confirm a payment you recorded.",
      403,
    );
  }
  return payment;
}

paymentsRouter.post("/:paymentId/acknowledge", async (req, res, next) => {
  try {
    const payment = await findPendingExternalForCounterparty(req.params.paymentId, req.auth!.uid);
    const [confirmed] = await prisma.$transaction([
      prisma.payment.update({
        where: { id: payment.id },
        data: { status: "Confirmed", confirmedAt: new Date() },
        include: WITH_PAYMENT_PARTIES,
      }),
      ...(await confirmedPaymentEffects(payment, payment.obligation)),
    ]);

    const acknowledger = payment.payerId === req.auth!.uid ? payment.payer : payment.recipient;
    if (payment.recordedByUserId) {
      void notify({
        userId: payment.recordedByUserId,
        type: "PAY-04",
        params: { name: acknowledger.displayName, amount: etb(payment.amount) },
        referenceId: payment.obligationId,
      });
    }
    await notifySettledIfCleared(payment.obligationId);

    res.status(200).json(toPaymentResponse(confirmed));
  } catch (err) {
    next(err);
  }
});

paymentsRouter.post("/:paymentId/dispute", async (req, res, next) => {
  try {
    const payment = await findPendingExternalForCounterparty(req.params.paymentId, req.auth!.uid);
    const [disputed] = await prisma.$transaction([
      prisma.payment.update({
        where: { id: payment.id },
        data: { status: "Disputed" },
        include: WITH_PAYMENT_PARTIES,
      }),
      prisma.obligation.update({
        where: { id: payment.obligationId },
        data: { status: "Disputed" },
      }),
    ]);

    const disputer = payment.payerId === req.auth!.uid ? payment.payer : payment.recipient;
    if (payment.recordedByUserId) {
      void notify({
        userId: payment.recordedByUserId,
        type: "PAY-05",
        params: { name: disputer.displayName, amount: etb(payment.amount) },
        referenceId: payment.id,
      });
    }

    res.status(200).json(toPaymentResponse(disputed));
  } catch (err) {
    next(err);
  }
});
