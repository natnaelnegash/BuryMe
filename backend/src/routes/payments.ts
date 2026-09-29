import { Router } from "express";

import { prisma } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { ApiError } from "../middleware/errors.js";
import { etb, notify, notifySettledIfCleared } from "../lib/notifications.js";
import { confirmedPaymentEffects, WITH_PAYMENT_PARTIES } from "../lib/payments.js";
import { toPaymentResponse } from "../serializers/payment.js";

// Counterparty confirmation of externally-recorded payments (§6.4.3). Only
// the party who did NOT record the payment may acknowledge or dispute it,
// and only while it's Pending Acknowledgement.
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

// POST /payments/:paymentId/acknowledge — contract: acknowledgePayment.
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

    // PAY-04 back to whoever recorded it, then PAY-07 to both parties if
    // that payment was the one that cleared the balance.
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

// POST /payments/:paymentId/dispute — contract: disputePayment. The
// obligation is flagged Disputed alongside the payment — the contract
// defines that status but no resolution endpoint yet, so it stays there
// until one exists.
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
