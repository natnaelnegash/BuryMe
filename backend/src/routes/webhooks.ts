import { Router, raw, type Request, type RequestHandler, type Response } from "express";

import { getChapaClient } from "../config/chapa.js";
import { prisma } from "../db/client.js";
import { startTransferForPayment } from "../domain/chapaPayments.js";
import { notifyChapaConfirmed } from "../domain/notifications.js";
import { confirmedPaymentEffects } from "../domain/payments.js";
import { ApiError } from "../middleware/errors.js";

// Two deliberately separate endpoints for Chapa's two hops — never collapse
// them (CLAUDE.md). Chapa retries until it sees a 200, so replays must be
// harmless, and an event we can never process is answered 200 to stop them.
export const webhooksRouter = Router();

webhooksRouter.use(raw({ type: "*/*", limit: "64kb" }));

interface ChapaEvent {
  tx_ref?: string;
  reference?: string;
  status?: string;
  event?: string;
  type?: string;
}

function eventKind(event: ChapaEvent): "checkout" | "transfer" | null {
  const tag = `${event.event ?? ""} ${event.type ?? ""}`.toLowerCase();
  if (/payout|transfer/.test(tag)) return "transfer";
  if (/charge|checkout|payment/.test(tag)) return "checkout";
  if (event.tx_ref && !event.reference) return "checkout";
  if (event.reference && !event.tx_ref) return "transfer";
  return null;
}

function isSuccess(event: ChapaEvent): boolean {
  return event.status === "success" || /\.success$/.test(event.event ?? "");
}

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

async function pendingPaymentFor(event: ChapaEvent | null) {
  const reference = event?.tx_ref ?? event?.reference;
  if (!reference) return null;
  const payment = await prisma.payment.findUnique({
    where: { id: reference },
    include: { obligation: true },
  });
  return payment && payment.status === "PendingAcknowledgement" ? payment : null;
}

async function handleCheckout(event: ChapaEvent | null, res: Response): Promise<void> {
  {
    const payment = await pendingPaymentFor(event);
    if (!payment || payment.chapaTransactionId) {
      res.status(200).json({ received: true });
      return;
    }

    if (isSuccess(event!)) {
      await startTransferForPayment(payment);
    } else {
      await prisma.payment.update({ where: { id: payment.id }, data: { status: "Failed" } });
    }

    res.status(200).json({ received: true });
  }
}

async function handleTransfer(event: ChapaEvent | null, res: Response): Promise<void> {
  {
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
        ...(await confirmedPaymentEffects(payment, payment.obligation)),
      ]);
      await notifyChapaConfirmed(payment.id);
    } else {
      await prisma.payment.update({ where: { id: payment.id }, data: { status: "Failed" } });
    }

    res.status(200).json({ received: true });
  }
}

function route(
  handler: (event: ChapaEvent | null, res: Response) => Promise<void>,
): RequestHandler {
  return async (req, res, next) => {
    try {
      await handler(readEvent(req), res);
    } catch (err) {
      next(err);
    }
  };
}

webhooksRouter.post("/checkout", route(handleCheckout));
webhooksRouter.post("/transfer", route(handleTransfer));

webhooksRouter.post(
  "/",
  route(async (event, res) => {
    const kind = event ? eventKind(event) : null;
    if (kind === "checkout") return handleCheckout(event, res);
    if (kind === "transfer") return handleTransfer(event, res);
    res.status(200).json({ received: true });
  }),
);
