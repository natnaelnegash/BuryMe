import { Router } from "express";

import { chapaReturnUrl, getChapaClient } from "../config/chapa.js";
import { prisma } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { ApiError } from "../middleware/errors.js";
import { parseBody, repaymentRequestBodySchema } from "../lib/validation.js";
import { assertObligationRepayable, createRepaymentRequest } from "../lib/repayment.js";
import { toObligationResponse } from "../serializers/obligation.js";
import { toPaymentResponse } from "../serializers/payment.js";
import { toRequestResponse } from "../serializers/request.js";

export const obligationsRouter = Router();

obligationsRouter.use(requireAuth);

const WITH_PARTIES = { borrower: true, lender: true } as const;
const WITH_PAYMENT_PARTIES = { payer: true, recipient: true } as const;

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
    assertObligationRepayable(obligation, uid);
    const body = parseBody(repaymentRequestBodySchema, req.body);
    const request = await createRepaymentRequest(obligation, uid, body.note);
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

    if (obligation.lenderId !== uid) {
      throw new ApiError("UNAUTHORIZED", "Only the lender can send the disbursement.", 403);
    }
    if (obligation.status !== "PendingDisbursement") {
      throw new ApiError(
        "STATUS_CONFLICT",
        "This obligation is not waiting for a disbursement.",
        409,
      );
    }

    // Checked up front so the lender doesn't pay in for a transfer that
    // can't be completed; re-checked by the transfer hop itself.
    const borrowerTelebirr = await prisma.telebirrAccount.findUnique({
      where: { userId: obligation.borrowerId },
    });
    if (borrowerTelebirr?.verificationStatus !== "Verified" || !borrowerTelebirr.telebirrNumber) {
      throw new ApiError(
        "RECIPIENT_UNVERIFIED",
        `${obligation.borrower.displayName} hasn't verified their Telebirr yet.`,
        409,
      );
    }

    // One live disbursement at a time; a Failed one may be retried.
    const inFlight = await prisma.payment.findFirst({
      where: {
        obligationId: obligation.id,
        paymentDirection: "Disbursement",
        status: { not: "Failed" },
      },
    });
    if (inFlight) {
      throw new ApiError(
        "DUPLICATE_SUBMISSION",
        "A disbursement for this obligation is already in progress.",
        409,
      );
    }

    const payment = await prisma.payment.create({
      data: {
        obligationId: obligation.id,
        payerId: obligation.lenderId,
        recipientId: obligation.borrowerId,
        amount: obligation.principalAmount,
        paymentDirection: "Disbursement",
        paymentMethod: "Chapa",
        status: "PendingAcknowledgement",
      },
      include: WITH_PAYMENT_PARTIES,
    });

    let checkoutUrl: string;
    try {
      ({ checkoutUrl } = await getChapaClient().initiateCheckout({
        amount: obligation.principalAmount.toNumber(),
        currency: "ETB",
        reference: payment.id,
        payerName: obligation.lender.displayName,
        payerPhone: obligation.lender.identifier,
        returnUrl: chapaReturnUrl(`/obligations/${obligation.id}`),
      }));
    } catch (err) {
      console.error("Chapa checkout failed:", err instanceof Error ? err.message : err);
      await prisma.payment.update({ where: { id: payment.id }, data: { status: "Failed" } });
      throw new ApiError(
        "PAYMENT_GATEWAY_ERROR",
        "The payment couldn't be started right now. Please try again.",
        502,
      );
    }

    const withUrl = await prisma.payment.update({
      where: { id: payment.id },
      data: { checkoutUrl },
      include: WITH_PAYMENT_PARTIES,
    });
    res.status(201).json(toPaymentResponse(withUrl));
  } catch (err) {
    next(err);
  }
});
