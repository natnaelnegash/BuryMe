import type { Schemas } from "@buryme/shared";
import { Router } from "express";

import { prisma } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { ApiError } from "../middleware/errors.js";
import { confirmChallenge, issueChallenge } from "../lib/telebirrOtp.js";
import {
  confirmTelebirrOtpRequestSchema,
  parseBody,
  searchUsersQuerySchema,
  updateProfileRequestSchema,
  verifyTelebirrRequestSchema,
} from "../lib/validation.js";
import {
  toTelebirrAccountResponse,
  toUserResponse,
  toUserSummaryResponse,
} from "../serializers/user.js";

export const usersRouter = Router();

usersRouter.use(requireAuth);

// GET /users/search — contract: searchUsers. Every persisted User is
// already "Verified" by construction (§8.5 — no unverified BuryMe profile
// exists), so no extra status filter is needed beyond matching the query.
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

// PATCH /users/me — contract: updateProfile.
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

// GET /users/me/telebirr — contract: getTelebirr. The contract always
// returns a TelebirrAccount object; a user who has never gone through
// verification has no row yet, so one is lazily created (Unverified, no
// number) on first access rather than requiring a contract change.
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

// POST /users/me/telebirr — contract: verifyTelebirr. Saves the number and
// resets status to Unverified (§7.1.6); any in-flight OTP challenge is
// dropped since it was issued for the old number. Verification proper is
// the /otp + /verify pair below.
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

// POST /users/me/telebirr/otp — contract: sendTelebirrOtp.
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

// POST /users/me/telebirr/verify — contract: confirmTelebirrOtp.
usersRouter.post("/me/telebirr/verify", async (req, res, next) => {
  try {
    const body = parseBody(confirmTelebirrOtpRequestSchema, req.body);
    const account = await findOwnTelebirrAccount(req.auth!.uid);
    const verified = await confirmChallenge(account, body.code);
    res.status(200).json(toTelebirrAccountResponse(verified));
  } catch (err) {
    next(err);
  }
});

// GET /users/{userId} — contract: getUser. Registered last: it's a
// single-segment catch-all and must not shadow the more specific routes
// above (even though none of them actually collide, since /me/telebirr
// has two segments).
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
