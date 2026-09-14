import { Router } from "express";

import { prisma } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { ApiError } from "../middleware/errors.js";
import { parseBody, repaymentRequestBodySchema } from "../lib/validation.js";
import { assertObligationRepayable, createRepaymentRequest } from "../lib/repayment.js";
import { toObligationResponse } from "../serializers/obligation.js";
import { toRequestResponse } from "../serializers/request.js";

export const obligationsRouter = Router();

obligationsRouter.use(requireAuth);

const WITH_PARTIES = { borrower: true, lender: true } as const;

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
