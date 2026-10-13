import type { Schemas } from "@buryme/shared";
import { Router } from "express";

import { prisma } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { ApiError } from "../middleware/errors.js";
import { notify } from "../domain/notifications.js";
import { confirmChallenge, issueChallenge } from "../domain/telebirrOtp.js";
import { parseBody } from "../schemas/parse.js";
import {
  confirmTelebirrOtpRequestSchema,
  searchUsersQuerySchema,
  updateProfileRequestSchema,
  verifyTelebirrRequestSchema,
} from "../schemas/users.js";
import {
  toTelebirrAccountResponse,
  toUserResponse,
  toUserSummaryResponse,
} from "../serializers/user.js";

export const usersRouter = Router();

usersRouter.use(requireAuth);

usersRouter.get("/search", async (req, res, next) => {
  try {
    const { q, limit } = parseBody(searchUsersQuerySchema, req.query);
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { displayName: { contains: q, mode: "insensitive" } },
          { identifier: { contains: q, mode: "insensitive" } },
        ],
      },
      take: limit ?? 20,
    });
    res.status(200).json(users.map(toUserSummaryResponse));
  } catch (err) {
    next(err);
  }
});

usersRouter.patch("/me", async (req, res, next) => {
  try {
    const body = parseBody(updateProfileRequestSchema, req.body);
    const user = await prisma.user.update({
      where: { id: req.auth!.uid },
      data: {
        ...(body.display_name !== undefined ? { displayName: body.display_name } : {}),
        ...(body.profile_photo_url !== undefined
          ? { profilePhotoUrl: body.profile_photo_url }
          : {}),
      },
      include: { telebirrAccount: true },
    });
    res.status(200).json(toUserResponse(user));
  } catch (err) {
    next(err);
  }
});

usersRouter.get("/me/telebirr", async (req, res, next) => {
  try {
    const account = await prisma.telebirrAccount.upsert({
      where: { userId: req.auth!.uid },
      create: { userId: req.auth!.uid },
      update: {},
    });
    res.status(200).json(toTelebirrAccountResponse(account));
  } catch (err) {
    next(err);
  }
});

usersRouter.post("/me/telebirr", async (req, res, next) => {
  try {
    const body = parseBody(verifyTelebirrRequestSchema, req.body);
    const account = await prisma.telebirrAccount.upsert({
      where: { userId: req.auth!.uid },
      create: { userId: req.auth!.uid, telebirrNumber: body.telebirr_number },
      update: {
        telebirrNumber: body.telebirr_number,
        verificationStatus: "Unverified",
        verifiedAt: null,
        otpHash: null,
        otpExpiresAt: null,
        otpSentAt: null,
        otpAttempts: 0,
      },
    });
    res.status(200).json(toTelebirrAccountResponse(account));
  } catch (err) {
    next(err);
  }
});

async function findOwnTelebirrAccount(uid: string) {
  const account = await prisma.telebirrAccount.findUnique({ where: { userId: uid } });
  if (!account) {
    throw new ApiError("STATUS_CONFLICT", "Save a Telebirr number before verifying it.", 409);
  }
  return account;
}

usersRouter.post("/me/telebirr/otp", async (req, res, next) => {
  try {
    const account = await findOwnTelebirrAccount(req.auth!.uid);
    const challenge = await issueChallenge(account);
    res.status(200).json({
      expires_at: challenge.expiresAt.toISOString(),
      resend_available_at: challenge.resendAvailableAt.toISOString(),
    } satisfies Schemas["TelebirrOtpChallenge"]);
  } catch (err) {
    next(err);
  }
});

usersRouter.post("/me/telebirr/verify", async (req, res, next) => {
  try {
    const body = parseBody(confirmTelebirrOtpRequestSchema, req.body);
    const account = await findOwnTelebirrAccount(req.auth!.uid);
    const verified = await confirmChallenge(account, body.code);

    void notify({
      userId: req.auth!.uid,
      type: "TB-02",
      params: {},
      referenceId: verified.accountId,
    });

    res.status(200).json(toTelebirrAccountResponse(verified));
  } catch (err) {
    next(err);
  }
});

// Single-segment catch-all — must stay below the more specific routes.
usersRouter.get("/:userId", async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.userId } });
    if (!user) {
      throw new ApiError("NOT_FOUND", "No user exists with that id.", 404);
    }
    res.status(200).json(toUserSummaryResponse(user));
  } catch (err) {
    next(err);
  }
});
