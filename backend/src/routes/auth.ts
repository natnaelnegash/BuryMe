import { Router } from "express";

import { prisma } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { ApiError } from "../middleware/errors.js";
import { fcmTokenRequestSchema, parseBody, registerRequestSchema } from "../lib/validation.js";
import { toUserResponse } from "../serializers/user.js";

export const authRouter = Router();

authRouter.use(requireAuth);

// GET /auth/me — bootstrap call on app launch (contract: getCurrentUser).
authRouter.get("/me", async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.auth!.uid },
      include: { telebirrAccount: true },
    });
    if (!user) {
      throw new ApiError("NOT_FOUND", "No BuryMe profile exists for this identity yet.", 404);
    }
    res.status(200).json(toUserResponse(user));
  } catch (err) {
    next(err);
  }
});

// POST /auth/register — first-login provisioning (contract: registerUser).
authRouter.post("/register", async (req, res, next) => {
  try {
    const body = parseBody(registerRequestSchema, req.body);
    const uid = req.auth!.uid;

    const existing = await prisma.user.findUnique({ where: { id: uid } });
    if (existing) {
      throw new ApiError(
        "DUPLICATE_SUBMISSION",
        "A profile already exists for this identity.",
        409,
      );
    }

    const user = await prisma.user.create({
      data: {
        id: uid,
        // Sourced from the verified Firebase identity, per contract — not
        // from the request body. Distinct from any TelebirrAccount number
        // linked later (Slice 2).
        identifier: req.auth!.phoneNumber ?? uid,
        displayName: body.display_name,
      },
    });

    res.status(201).json(toUserResponse({ ...user, telebirrAccount: null }));
  } catch (err) {
    next(err);
  }
});

// POST /auth/fcm-token — device push token registration (contract: registerFcmToken).
// Assumes it's only called after a successful /auth/register — the contract
// defines no 404 response for this endpoint (400/401 only).
authRouter.post("/fcm-token", async (req, res, next) => {
  try {
    const body = parseBody(fcmTokenRequestSchema, req.body);
    await prisma.fcmToken.upsert({
      where: { token: body.fcm_token },
      create: { token: body.fcm_token, platform: body.platform, userId: req.auth!.uid },
      update: { platform: body.platform, userId: req.auth!.uid },
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// DELETE /auth/fcm-token — contract: deleteFcmToken. Contract documents only
// 204/401 for this endpoint (no 400), so a missing/malformed query param is
// treated as "nothing to remove" rather than a validation error.
authRouter.delete("/fcm-token", async (req, res, next) => {
  try {
    const token = req.query.fcm_token;
    if (typeof token === "string" && token.length > 0) {
      await prisma.fcmToken.deleteMany({ where: { token, userId: req.auth!.uid } });
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
