import { createHash, randomInt, timingSafeEqual } from "node:crypto";

import { otpPepper } from "../config/otp.js";
import { getSmsSender } from "../config/sms.js";
import { prisma } from "../db/client.js";
import type { TelebirrAccount } from "../generated/prisma/client.js";
import { ApiError } from "../middleware/errors.js";

export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_RESEND_MS = 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;

function hashCode(code: string): string {
  return createHash("sha256").update(`${code}:${otpPepper()}`).digest("hex");
}

export interface OtpChallenge {
  expiresAt: Date;
  resendAvailableAt: Date;
}

export async function issueChallenge(
  account: TelebirrAccount,
  now = new Date(),
): Promise<OtpChallenge> {
  if (!account.telebirrNumber) {
    throw new ApiError("STATUS_CONFLICT", "Save a Telebirr number before verifying it.", 409);
  }
  if (account.verificationStatus === "Verified") {
    throw new ApiError("STATUS_CONFLICT", "This Telebirr number is already verified.", 409);
  }
  if (account.otpSentAt && now.getTime() - account.otpSentAt.getTime() < OTP_RESEND_MS) {
    throw new ApiError(
      "DUPLICATE_SUBMISSION",
      "A code was sent a moment ago. Wait a minute before requesting another.",
      429,
    );
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const expiresAt = new Date(now.getTime() + OTP_TTL_MS);

  try {
    await getSmsSender().send(
      account.telebirrNumber,
      `Your BuryMe Telebirr verification code is ${code}. It expires in 5 minutes.`,
    );
  } catch (err) {
    console.error("OTP send failed:", err instanceof Error ? err.message : err);
    throw new ApiError(
      "INTERNAL_ERROR",
      "We couldn't send the verification code right now. Please try again.",
      500,
    );
  }

  await prisma.telebirrAccount.update({
    where: { accountId: account.accountId },
    data: { otpHash: hashCode(code), otpExpiresAt: expiresAt, otpSentAt: now, otpAttempts: 0 },
  });

  return { expiresAt, resendAvailableAt: new Date(now.getTime() + OTP_RESEND_MS) };
}

export async function confirmChallenge(
  account: TelebirrAccount,
  code: string,
  now = new Date(),
): Promise<TelebirrAccount> {
  if (account.verificationStatus === "Verified") {
    throw new ApiError("STATUS_CONFLICT", "This Telebirr number is already verified.", 409);
  }
  if (!account.otpHash || !account.otpExpiresAt) {
    throw new ApiError(
      "STATUS_CONFLICT",
      "No verification is in progress. Request a code first.",
      409,
    );
  }
  if (account.otpAttempts >= OTP_MAX_ATTEMPTS) {
    throw new ApiError(
      "STATUS_CONFLICT",
      "Too many incorrect attempts. Request a new code to try again.",
      409,
    );
  }
  if (account.otpExpiresAt.getTime() <= now.getTime()) {
    throw new ApiError(
      "VALIDATION_ERROR",
      "That code has expired. Request a new one.",
      400,
      "code",
    );
  }

  const expected = Buffer.from(account.otpHash, "hex");
  const actual = Buffer.from(hashCode(code), "hex");
  const matches = expected.length === actual.length && timingSafeEqual(expected, actual);

  if (!matches) {
    await prisma.telebirrAccount.update({
      where: { accountId: account.accountId },
      data: { otpAttempts: { increment: 1 } },
    });
    const left = OTP_MAX_ATTEMPTS - account.otpAttempts - 1;
    throw new ApiError(
      "VALIDATION_ERROR",
      left > 0
        ? `That code isn't right. ${left} attempt${left === 1 ? "" : "s"} left.`
        : "That code isn't right. Request a new code to try again.",
      400,
      "code",
    );
  }

  return prisma.telebirrAccount.update({
    where: { accountId: account.accountId },
    data: {
      verificationStatus: "Verified",
      verifiedAt: now,
      otpHash: null,
      otpExpiresAt: null,
      otpSentAt: null,
      otpAttempts: 0,
    },
  });
}
