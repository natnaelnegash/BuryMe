import { Router } from "express";

import { prisma } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { ApiError } from "../middleware/errors.js";
import { fcmTokenRequestSchema, registerRequestSchema } from "../schemas/auth.js";
import { parseBody } from "../schemas/parse.js";
import { toUserResponse } from "../serializers/user.js";

export const authRouter = Router();

authRouter.use(requireAuth);

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
        identifier: req.auth!.phoneNumber ?? uid,
        displayName: body.display_name,
      },
    });

    res.status(201).json(toUserResponse({ ...user, telebirrAccount: null }));
  } catch (err) {
    next(err);
  }
});

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
