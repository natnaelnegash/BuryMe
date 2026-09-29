import { Router } from "express";

import { prisma } from "../db/client.js";
import { etb, notify, notifyBoth } from "../lib/notifications.js";
import { scheduleCreateInput } from "../lib/schedule.js";
import { requireAuth } from "../middleware/auth.js";
import { ApiError } from "../middleware/errors.js";
import {
  acceptRequestInputSchema,
  assertValidProposedTerms,
  counterProposalInputSchema,
  createRequestInputSchema,
  parseBody,
  type ProposedTerms,
} from "../lib/validation.js";
import { toRequestResponse } from "../serializers/request.js";
import { REPAYMENT_TYPE } from "../serializers/enums.js";
import { assertObligationRepayable, createRepaymentRequest } from "../lib/repayment.js";
import type { Request as RequestModel } from "../generated/prisma/client.js";

export const requestsRouter = Router();

requestsRouter.use(requireAuth);

const WITH_USERS = { initiatingUser: true, receivingUser: true } as const;

// Only a party to the request may see or act on it — a non-party gets 404,
// matching the contract's NotFound description ("does not exist or is not
// accessible to this user").
async function findRequestForUser(requestId: string, uid: string) {
  const request = await prisma.request.findFirst({
    where: { id: requestId, OR: [{ initiatingUserId: uid }, { receivingUserId: uid }] },
    include: WITH_USERS,
  });
  if (!request) {
    throw new ApiError("NOT_FOUND", "No request exists with that id.", 404);
  }
  return request;
}

// Merges a request's original proposed terms with an (optional) counter
// proposal — counter fields override, everything else falls back to the
// original. Used both to validate a counter at submission time and to
// determine the final terms an Obligation is created from at acceptance.
// Deliberately looser than CounterProposalInput's full shape — only the
// fields mergeProposedTerms actually reads, so it accepts whatever
// `parseBody`'s generic inference produces without fighting subtle type
// mismatches against a separately-derived `z.infer`.
interface CounterFields {
  amount?: { amount: number } | undefined;
  proposed_repayment_type?: ("Lump Sum" | "Installments") | undefined;
  proposed_schedule?: unknown;
  proposed_due_date?: string | undefined;
}

function mergeProposedTerms(request: RequestModel, counter?: CounterFields | null): ProposedTerms {
  return {
    amount: counter?.amount?.amount ?? request.amount.toNumber(),
    repaymentType: (counter?.proposed_repayment_type ??
      REPAYMENT_TYPE[request.proposedRepaymentType!]!) as ProposedTerms["repaymentType"],
    schedule: (counter?.proposed_schedule ?? request.proposedSchedule) as ProposedTerms["schedule"],
    dueDate:
      counter?.proposed_due_date ??
      (request.proposedDueDate ? request.proposedDueDate.toISOString().slice(0, 10) : ""),
  };
}

// GET /requests — list requests involving the current user.
requestsRouter.get("/", async (req, res, next) => {
  try {
    const uid = req.auth!.uid;
    const { role, status, request_type, limit, cursor } = req.query as Record<
      string,
      string | undefined
    >;

    const where: Record<string, unknown> = {};
    if (role === "initiator") where.initiatingUserId = uid;
    else if (role === "recipient") where.receivingUserId = uid;
    else where.OR = [{ initiatingUserId: uid }, { receivingUserId: uid }];
    if (status) where.status = { in: status.split(",") };
    if (request_type) where.requestType = request_type;

    const take = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const requests = await prisma.request.findMany({
      where,
      include: WITH_USERS,
      orderBy: { createdAt: "desc" },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = requests.length > take;
    const page = hasMore ? requests.slice(0, take) : requests;
    res.status(200).json({
      data: page.map(toRequestResponse),
      next_cursor: hasMore ? page[page.length - 1]!.id : null,
    });
  } catch (err) {
    next(err);
  }
});

// POST /requests — create a Borrow, Lend, or Repayment request.
requestsRouter.post("/", async (req, res, next) => {
  try {
    const body = parseBody(createRequestInputSchema, req.body);
    const uid = req.auth!.uid;

    if (body.request_type === "Repayment") {
      const obligation = await prisma.obligation.findUnique({ where: { id: body.obligation_id } });
      if (!obligation) {
        throw new ApiError(
          "VALIDATION_ERROR",
          "No obligation exists with that id.",
          400,
          "obligation_id",
        );
      }
      const target = await assertObligationRepayable(obligation, uid, body.installment_id);
      const request = await createRepaymentRequest(obligation, uid, target, body.note);
      res.status(201).json(toRequestResponse(request));
      return;
    }

    // Borrow or Lend.
    if (body.recipient_user_id === uid) {
      throw new ApiError(
        "VALIDATION_ERROR",
        "You cannot target yourself.",
        400,
        "recipient_user_id",
      );
    }
    const recipient = await prisma.user.findUnique({ where: { id: body.recipient_user_id } });
    if (!recipient) {
      throw new ApiError(
        "VALIDATION_ERROR",
        "No user exists with that id.",
        400,
        "recipient_user_id",
      );
    }

    const openExisting = await prisma.request.findFirst({
      where: {
        requestType: body.request_type,
        initiatingUserId: uid,
        receivingUserId: body.recipient_user_id,
        status: { in: ["Pending", "Countered"] },
      },
    });
    if (openExisting) {
      throw new ApiError(
        "DUPLICATE_SUBMISSION",
        "An open request already exists between you and this user in this direction.",
        409,
      );
    }

    assertValidProposedTerms({
      amount: body.amount.amount,
      repaymentType: body.proposed_repayment_type,
      schedule: body.proposed_schedule ?? null,
      dueDate: body.proposed_due_date,
    });

    const request = await prisma.request.create({
      data: {
        requestType: body.request_type,
        initiatingUserId: uid,
        receivingUserId: body.recipient_user_id,
        amount: body.amount.amount,
        purpose: body.purpose,
        proposedRepaymentType:
          body.proposed_repayment_type === "Lump Sum" ? "LumpSum" : "Installments",
        ...(body.proposed_schedule ? { proposedSchedule: body.proposed_schedule } : {}),
        proposedDueDate: new Date(body.proposed_due_date),
        ...(body.request_type === "Lend"
          ? {
              disbursementMethod:
                body.disbursement_method === "Already Given" ? "AlreadyGiven" : "ThroughApp",
            }
          : {}),
        status: "Pending",
      },
      include: WITH_USERS,
    });

    // §13.2: BR-01 to the lender, LR-01 to the borrower. Repayment requests
    // returned above and raise RR-01 from lib/repayment.ts, which is the one
    // place both entry points go through.
    void notify({
      userId: request.receivingUserId,
      type: request.requestType === "Lend" ? "LR-01" : "BR-01",
      params: { name: request.initiatingUser.displayName, amount: etb(request.amount) },
      referenceId: request.id,
    });

    res.status(201).json(toRequestResponse(request));
  } catch (err) {
    next(err);
  }
});

// GET /requests/:requestId
requestsRouter.get("/:requestId", async (req, res, next) => {
  try {
    const request = await findRequestForUser(req.params.requestId, req.auth!.uid);
    res.status(200).json(toRequestResponse(request));
  } catch (err) {
    next(err);
  }
});

// POST /requests/:requestId/counter — the single allowed counter-proposal.
requestsRouter.post("/:requestId/counter", async (req, res, next) => {
  try {
    const uid = req.auth!.uid;
    const request = await findRequestForUser(req.params.requestId, uid);
    if (request.status !== "Pending" || request.receivingUserId !== uid) {
      throw new ApiError("STATUS_CONFLICT", "This request cannot be countered right now.", 409);
    }
    const body = parseBody(counterProposalInputSchema, req.body);

    if (request.requestType !== "Repayment") {
      assertValidProposedTerms(mergeProposedTerms(request, body));
    }

    const updated = await prisma.request.update({
      where: { id: request.id },
      data: { counterProposal: body, status: "Countered", respondedAt: new Date() },
      include: WITH_USERS,
    });

    // The counter always travels back to whoever opened the request:
    // BR-04 on a Borrow, LR-02 on a lending record.
    void notify({
      userId: updated.initiatingUserId,
      type: updated.requestType === "Lend" ? "LR-02" : "BR-04",
      params: { name: updated.receivingUser.displayName, amount: etb(updated.amount) },
      referenceId: updated.id,
    });

    res.status(200).json(toRequestResponse(updated));
  } catch (err) {
    next(err);
  }
});

// POST /requests/:requestId/accept
requestsRouter.post("/:requestId/accept", async (req, res, next) => {
  try {
    const uid = req.auth!.uid;
    const request = await findRequestForUser(req.params.requestId, uid);

    const canAct =
      (request.status === "Pending" && request.receivingUserId === uid) ||
      (request.status === "Countered" && request.initiatingUserId === uid);
    if (!canAct) {
      throw new ApiError("STATUS_CONFLICT", "This request cannot be accepted right now.", 409);
    }

    const body = parseBody(acceptRequestInputSchema, req.body ?? {});

    if (request.requestType === "Repayment") {
      const updated = await prisma.request.update({
        where: { id: request.id },
        data: { status: "Accepted", respondedAt: new Date() },
        include: WITH_USERS,
      });
      res.status(200).json(toRequestResponse(updated));
      return;
    }

    const counter = request.counterProposal as Parameters<typeof mergeProposedTerms>[1];
    const terms = mergeProposedTerms(request, counter ?? undefined);

    let disbursementMethod: "AlreadyGiven" | "ThroughApp";
    if (request.requestType === "Borrow") {
      if (!body.disbursement_method) {
        throw new ApiError(
          "VALIDATION_ERROR",
          "disbursement_method is required when accepting a Borrow request.",
          400,
          "disbursement_method",
        );
      }
      disbursementMethod =
        body.disbursement_method === "Already Given" ? "AlreadyGiven" : "ThroughApp";
    } else {
      disbursementMethod = request.disbursementMethod!;
    }

    // Borrow: initiator is the borrower. Lend: initiator is the lender.
    const borrowerId =
      request.requestType === "Borrow" ? request.initiatingUserId : request.receivingUserId;
    const lenderId =
      request.requestType === "Borrow" ? request.receivingUserId : request.initiatingUserId;
    const isActive = disbursementMethod === "AlreadyGiven";

    const wasCountered = request.status === "Countered";

    const [updatedRequest, obligation] = await prisma.$transaction([
      prisma.request.update({
        where: { id: request.id },
        data: { status: "Accepted", respondedAt: new Date() },
        include: WITH_USERS,
      }),
      prisma.obligation.create({
        data: {
          borrowerId,
          lenderId,
          originatingRequestId: request.id,
          principalAmount: terms.amount,
          outstandingBalance: isActive ? terms.amount : 0,
          purpose: request.purpose ?? "",
          repaymentType: terms.repaymentType === "Lump Sum" ? "LumpSum" : "Installments",
          disbursementMethod,
          dueDate: new Date(terms.dueDate),
          status: isActive ? "Active" : "PendingDisbursement",
          // Installments: materialise the agreed schedule in the same
          // transaction — fixed from here on (§6.3.2).
          ...(terms.repaymentType === "Installments" && terms.schedule
            ? { schedule: scheduleCreateInput(terms.schedule) }
            : {}),
        },
      }),
    ]);

    // §13.2 on acceptance. A Borrow closes with BR-02 (or BR-05 when it was
    // the counter-proposal being accepted). A lending record is LR-03 to
    // both parties when the money already changed hands, or LR-04 nudging
    // the lender to disburse when it hasn't.
    // The agreed figure, not a field read back off the created row — the
    // obligation write returns only what the caller selected.
    const amount = etb(terms.amount);
    if (updatedRequest.requestType === "Borrow") {
      void notify({
        userId: wasCountered ? updatedRequest.receivingUserId : updatedRequest.initiatingUserId,
        type: wasCountered ? "BR-05" : "BR-02",
        params: {
          name: wasCountered
            ? updatedRequest.initiatingUser.displayName
            : updatedRequest.receivingUser.displayName,
          amount,
        },
        referenceId: obligation.id,
      });
    } else if (isActive) {
      void notifyBoth(
        [borrowerId, lenderId],
        "LR-03",
        (userId) => ({
          name:
            userId === borrowerId
              ? updatedRequest.initiatingUser.displayName
              : updatedRequest.receivingUser.displayName,
          amount,
        }),
        obligation.id,
      );
    } else {
      void notify({
        userId: lenderId,
        type: "LR-04",
        params: { name: updatedRequest.receivingUser.displayName, amount },
        referenceId: obligation.id,
      });
    }

    res.status(200).json(toRequestResponse(updatedRequest));
  } catch (err) {
    next(err);
  }
});

// POST /requests/:requestId/decline — same actor-gating as accept (the
// contract doesn't restate it explicitly here, but decline/accept are the
// two responses to whoever currently holds the proposal).
requestsRouter.post("/:requestId/decline", async (req, res, next) => {
  try {
    const uid = req.auth!.uid;
    const request = await findRequestForUser(req.params.requestId, uid);
    const canAct =
      (request.status === "Pending" && request.receivingUserId === uid) ||
      (request.status === "Countered" && request.initiatingUserId === uid);
    if (!canAct) {
      throw new ApiError("STATUS_CONFLICT", "This request cannot be declined right now.", 409);
    }
    const wasCountered = request.status === "Countered";
    const updated = await prisma.request.update({
      where: { id: request.id },
      data: { status: "Declined", respondedAt: new Date() },
      include: WITH_USERS,
    });

    // Declining a counter-proposal (BR-06) is a different event from
    // declining the original request (BR-03 / LR-06), and travels the other
    // way. LR-06 has no reference — the catalog sends it to the Dashboard.
    const declinedByInitiator = wasCountered;
    void notify({
      userId: declinedByInitiator ? updated.receivingUserId : updated.initiatingUserId,
      type: updated.requestType === "Lend" ? "LR-06" : declinedByInitiator ? "BR-06" : "BR-03",
      params: {
        name: declinedByInitiator
          ? updated.initiatingUser.displayName
          : updated.receivingUser.displayName,
        amount: etb(updated.amount),
      },
      referenceId: updated.id,
    });

    res.status(200).json(toRequestResponse(updated));
  } catch (err) {
    next(err);
  }
});

// POST /requests/:requestId/cancel — initiator only, while Pending.
requestsRouter.post("/:requestId/cancel", async (req, res, next) => {
  try {
    const uid = req.auth!.uid;
    const request = await findRequestForUser(req.params.requestId, uid);
    if (request.initiatingUserId !== uid) {
      throw new ApiError("UNAUTHORIZED", "Only the initiator may cancel this request.", 403);
    }
    if (request.status !== "Pending") {
      throw new ApiError("STATUS_CONFLICT", "This request can no longer be cancelled.", 409);
    }
    const updated = await prisma.request.update({
      where: { id: request.id },
      data: { status: "Cancelled", respondedAt: new Date() },
      include: WITH_USERS,
    });
    res.status(200).json(toRequestResponse(updated));
  } catch (err) {
    next(err);
  }
});
