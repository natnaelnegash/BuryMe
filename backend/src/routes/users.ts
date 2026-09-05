import { Router } from "express";

import { prisma } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { ApiError } from "../middleware/errors.js";
import {
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

// POST /users/me/telebirr — contract: verifyTelebirr. Updating the number
// always resets status to Unverified until re-verified (§7.1.6) — this
// slice has no separate verification-confirmation mechanism, matching the
// contract's documented behavior exactly.
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
      },
    });
    res.status(200).json(toTelebirrAccountResponse(account));
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
