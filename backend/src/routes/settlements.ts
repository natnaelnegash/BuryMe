import { Router } from "express";

import { prisma } from "../db/client.js";
import { etb, notify } from "../lib/notifications.js";
import {
  assertStillSettleable,
  findEligiblePair,
  netOf,
  settleEffects,
} from "../lib/settlement.js";
import { createSettlementSuggestionInputSchema, parseBody } from "../lib/validation.js";
import { requireAuth } from "../middleware/auth.js";
import { ApiError } from "../middleware/errors.js";
import {
  toSettlementSuggestionResponse,
  WITH_SETTLEMENT_PARTIES,
} from "../serializers/settlement.js";

// Two-party net settlement (§6.5.2, §8.14). Either party may propose once
// both owe each other; the proposer's own response is recorded as Accepted
// straight away, and neither obligation moves until the other party also
// accepts.
export const settlementsRouter = Router();

settlementsRouter.use(requireAuth);

// Only the two parties may see or act on a suggestion; anyone else gets a
// 404 rather than a 403, so the existence of a suggestion between two
// other people isn't observable.
async function findSuggestionForUser(suggestionId: string, uid: string) {
  const suggestion = await prisma.settlementSuggestion.findFirst({
    where: { id: suggestionId, OR: [{ userAId: uid }, { userBId: uid }] },
    include: WITH_SETTLEMENT_PARTIES,
  });
  if (!suggestion) {
    throw new ApiError("NOT_FOUND", "No settlement suggestion exists with that id.", 404);
  }
  return suggestion;
}

// POST /settlements/suggestions — contract: createSettlementSuggestion.
settlementsRouter.post("/suggestions", async (req, res, next) => {
  try {
    const uid = req.auth!.uid;
    const body = parseBody(createSettlementSuggestionInputSchema, req.body);
    const counterpartyId = body.counterparty_user_id;

    const counterparty = await prisma.user.findUnique({ where: { id: counterpartyId } });
    if (!counterparty) {
      throw new ApiError(
        "VALIDATION_ERROR",
        "That user doesn't exist.",
        400,
        "counterparty_user_id",
      );
    }

    // One live proposal per pair — otherwise both sides could propose at
    // once and settle the same obligations twice.
    const existing = await prisma.settlementSuggestion.findFirst({
      where: {
        status: "Pending",
        OR: [
          { userAId: uid, userBId: counterpartyId },
          { userAId: counterpartyId, userBId: uid },
        ],
      },
    });
    if (existing) {
      throw new ApiError(
        "DUPLICATE_SUBMISSION",
        "A settlement suggestion is already awaiting a response between you.",
        409,
      );
    }

    const pair = await findEligiblePair(uid, counterpartyId);
    const net = netOf(pair);

    // userA is always the initiator, so obligationA is the one they borrow
    // on — which is what the contract says obligation_id_a means.
    const suggestion = await prisma.settlementSuggestion.create({
      data: {
        userAId: uid,
        userBId: counterpartyId,
        obligationAId: pair.obligationA.id,
        obligationBId: pair.obligationB.id,
        netAmount: net.netAmount,
        netPayerId: net.netPayerId,
        netRecipientId: net.netRecipientId,
        userAResponse: "Accepted",
        userBResponse: "Pending",
        status: "Pending",
      },
      include: WITH_SETTLEMENT_PARTIES,
    });

    // BSS-02: the proposer has effectively already accepted, so the other
    // party's response is what's outstanding.
    void notify({
      userId: counterpartyId,
      type: "BSS-02",
      params: { name: suggestion.userA.displayName, amount: etb(suggestion.netAmount) },
      referenceId: suggestion.id,
    });

    res.status(201).json(toSettlementSuggestionResponse(suggestion));
  } catch (err) {
    next(err);
  }
});

// GET /settlements/suggestions — contract: listSettlementSuggestions.
// Returns a bare array; this endpoint has no page envelope in the contract.
settlementsRouter.get("/suggestions", async (req, res, next) => {
  try {
    const uid = req.auth!.uid;
    const suggestions = await prisma.settlementSuggestion.findMany({
      where: { OR: [{ userAId: uid }, { userBId: uid }] },
      include: WITH_SETTLEMENT_PARTIES,
      orderBy: { createdAt: "desc" },
    });
    res.status(200).json(suggestions.map(toSettlementSuggestionResponse));
  } catch (err) {
    next(err);
  }
});

// GET /settlements/suggestions/:suggestionId — contract: getSettlementSuggestion.
settlementsRouter.get("/suggestions/:suggestionId", async (req, res, next) => {
  try {
    const suggestion = await findSuggestionForUser(req.params.suggestionId!, req.auth!.uid);
    res.status(200).json(toSettlementSuggestionResponse(suggestion));
  } catch (err) {
    next(err);
  }
});

// POST /settlements/suggestions/:suggestionId/accept — contract:
// acceptSettlementSuggestion. Records this user's response; both
// obligations settle only once both parties have accepted.
settlementsRouter.post("/suggestions/:suggestionId/accept", async (req, res, next) => {
  try {
    const uid = req.auth!.uid;
    const suggestion = await findSuggestionForUser(req.params.suggestionId!, uid);
    if (suggestion.status !== "Pending") {
      throw new ApiError(
        "STATUS_CONFLICT",
        "This settlement suggestion has already been resolved.",
        409,
      );
    }

    const isUserA = suggestion.userAId === uid;
    const bothAccept = isUserA
      ? suggestion.userBResponse === "Accepted"
      : suggestion.userAResponse === "Accepted";
    const now = new Date();

    if (!bothAccept) {
      // Still waiting on the other side — record the response and nothing else.
      const updated = await prisma.settlementSuggestion.update({
        where: { id: suggestion.id },
        data: isUserA ? { userAResponse: "Accepted" } : { userBResponse: "Accepted" },
        include: WITH_SETTLEMENT_PARTIES,
      });
      res.status(200).json(toSettlementSuggestionResponse(updated));
      return;
    }

    // Second acceptance: the obligations may have been settled by other
    // means since the suggestion was made.
    const obligationIds = [suggestion.obligationAId, suggestion.obligationBId];
    await assertStillSettleable(obligationIds);

    const [updated] = await prisma.$transaction([
      prisma.settlementSuggestion.update({
        where: { id: suggestion.id },
        data: {
          ...(isUserA ? { userAResponse: "Accepted" } : { userBResponse: "Accepted" }),
          status: "Accepted",
          resolvedAt: now,
        },
        include: WITH_SETTLEMENT_PARTIES,
      }),
      ...settleEffects(obligationIds),
    ]);

    // BSS-03 to both. Each party opens their own obligation, so this is two
    // calls rather than notifyBoth. The obligations are settled by
    // agreement here, so PAY-07 deliberately doesn't also fire.
    const net = etb(suggestion.netAmount);
    void notify({
      userId: suggestion.userAId,
      type: "BSS-03",
      params: { name: suggestion.userB.displayName, amount: net },
      referenceId: suggestion.obligationAId,
    });
    void notify({
      userId: suggestion.userBId,
      type: "BSS-03",
      params: { name: suggestion.userA.displayName, amount: net },
      referenceId: suggestion.obligationBId,
    });

    res.status(200).json(toSettlementSuggestionResponse(updated));
  } catch (err) {
    next(err);
  }
});

// POST /settlements/suggestions/:suggestionId/decline — contract:
// declineSettlementSuggestion. Either party declining ends it; the
// obligations are left exactly as they were.
settlementsRouter.post("/suggestions/:suggestionId/decline", async (req, res, next) => {
  try {
    const uid = req.auth!.uid;
    const suggestion = await findSuggestionForUser(req.params.suggestionId!, uid);
    if (suggestion.status !== "Pending") {
      throw new ApiError(
        "STATUS_CONFLICT",
        "This settlement suggestion has already been resolved.",
        409,
      );
    }

    const isUserA = suggestion.userAId === uid;
    const updated = await prisma.settlementSuggestion.update({
      where: { id: suggestion.id },
      data: {
        ...(isUserA ? { userAResponse: "Declined" } : { userBResponse: "Declined" }),
        status: "Declined",
        resolvedAt: new Date(),
      },
      include: WITH_SETTLEMENT_PARTIES,
    });

    // BSS-04 to both parties — the catalog tells each of them their own
    // obligation is unchanged.
    void notify({
      userId: suggestion.userAId,
      type: "BSS-04",
      params: { name: suggestion.userB.displayName },
      referenceId: suggestion.obligationAId,
    });
    void notify({
      userId: suggestion.userBId,
      type: "BSS-04",
      params: { name: suggestion.userA.displayName },
      referenceId: suggestion.obligationBId,
    });

    res.status(200).json(toSettlementSuggestionResponse(updated));
  } catch (err) {
    next(err);
  }
});
