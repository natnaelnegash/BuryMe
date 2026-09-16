import { Router, raw, type Request } from "express";

import { getChapaClient } from "../config/chapa.js";
import { prisma } from "../db/client.js";
import { startTransferForPayment } from "../lib/chapaPayments.js";
import { ApiError } from "../middleware/errors.js";

// Chapa server-to-server callbacks (§11.1.1). Two deliberately separate
// endpoints — checkout (collection) and transfer (payout) are distinct
// Chapa events; never collapse them (CLAUDE.md). For a disbursement the
// sequence is: lender pays the checkout → /checkout confirms and starts the
// transfer → /transfer confirms and activates the obligation.
//
// Mounted in app.ts *before* express.json() with a raw-body parser, because
// the signature is an HMAC over the exact bytes Chapa sent. No requireAuth —
// the contract declares `security: []` and the signature is the auth.
export const webhooksRouter = Router();

webhooksRouter.use(raw({ type: "*/*", limit: "64kb" }));

interface ChapaEvent {
  /** Chapa echoes back our reference — the Payment id. Checkout events call
   *  it `tx_ref`; transfer events `reference`. */
  tx_ref?: string;
  reference?: string;
  /** "success" | "failed" (Chapa also uses `event: "charge.success"` /
   *  `"payout.success"`). */
  status?: string;
  event?: string;
}

function isSuccess(event: ChapaEvent): boolean {
  return event.status === "success" || /\.success$/.test(event.event ?? "");
}

// Verifies the signature over the raw body and parses the event. Returns
// null for a signed-but-malformed body, which callers acknowledge with 200
// so Chapa stops retrying something we can never process.
function readEvent(req: Request): ChapaEvent | null {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
  const signature = (req.header("x-chapa-signature") ?? req.header("chapa-signature")) || undefined;
  if (!getChapaClient().verifyWebhookSignature(rawBody, signature)) {
    throw new ApiError("UNAUTHENTICATED", "Invalid webhook signature.", 401);
  }
  try {
    return JSON.parse(rawBody.toString("utf8")) as ChapaEvent;
  } catch {
    return null;
  }
}

// Looks up the still-pending payment an event refers to. Anything else —
// unknown reference, already final — is a no-op: Chapa retries until it
// sees a 200, so replays must be harmless.
async function pendingPaymentFor(event: ChapaEvent | null) {
  const reference = event?.tx_ref ?? event?.reference;
  if (!reference) return null;
  const payment = await prisma.payment.findUnique({
    where: { id: reference },
    include: { obligation: true },
  });
  return payment && payment.status === "PendingAcknowledgement" ? payment : null;
}

// POST /webhooks/chapa/checkout — contract: chapaCheckoutWebhook.
// Collection hop confirmed: the payer's money is in BuryMe's merchant
// balance. Start the transfer to the recipient; the payment stays Pending
// Acknowledgement until /transfer confirms it.
webhooksRouter.post("/checkout", async (req, res, next) => {
  try {
    const event = readEvent(req);
    const payment = await pendingPaymentFor(event);
    if (!payment || payment.chapaTransactionId) {
      // chapaTransactionId set means the transfer was already started by an
      // earlier delivery of this same event.
      res.status(200).json({ received: true });
      return;
    }

    if (isSuccess(event!)) {
      await startTransferForPayment(payment);
    } else {
      // Payer abandoned or the charge failed: nothing moved, retryable.
      await prisma.payment.update({ where: { id: payment.id }, data: { status: "Failed" } });
    }

    res.status(200).json({ received: true });
  } catch (err) {
    next(err);
  }
});

// POST /webhooks/chapa/transfer — contract: chapaTransferWebhook.
// Payout hop confirmed: the recipient has the money. Confirm the payment
// and, for a disbursement, activate the obligation with the full principal.
webhooksRouter.post("/transfer", async (req, res, next) => {
  try {
    const event = readEvent(req);
    const payment = await pendingPaymentFor(event);
    if (!payment) {
      res.status(200).json({ received: true });
      return;
    }

    if (isSuccess(event!)) {
      const now = new Date();
      await prisma.$transaction([
        prisma.payment.update({
          where: { id: payment.id },
          data: { status: "Confirmed", confirmedAt: now },
        }),
        ...(payment.paymentDirection === "Disbursement" &&
        payment.obligation.status === "PendingDisbursement"
          ? [
              prisma.obligation.update({
                where: { id: payment.obligationId },
                data: {
                  status: "Active",
                  outstandingBalance: payment.obligation.principalAmount,
                },
              }),
            ]
          : []),
      ]);
    } else {
      // The money is sitting in BuryMe's balance but couldn't be paid out.
      // Mark Failed so the lender can retry; refunding the collected amount
      // is an operational step outside the API for now.
      await prisma.payment.update({ where: { id: payment.id }, data: { status: "Failed" } });
    }

    res.status(200).json({ received: true });
  } catch (err) {
    next(err);
  }
});
