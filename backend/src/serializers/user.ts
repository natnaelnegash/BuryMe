import type { Schemas } from "@buryme/shared";

import type { TelebirrAccount, User } from "../generated/prisma/client.js";

type UserWithTelebirr = User & { telebirrAccount: TelebirrAccount | null };

export function toTelebirrAccountResponse(account: TelebirrAccount): Schemas["TelebirrAccount"] {
  return {
    account_id: account.accountId,
    telebirr_number: account.telebirrNumber,
    verification_status: account.verificationStatus,
    verified_at: account.verifiedAt?.toISOString() ?? null,
    created_at: account.createdAt.toISOString(),
  };
}

export function toUserSummaryResponse(user: User): Schemas["UserSummary"] {
  return {
    user_id: user.id,
    display_name: user.displayName,
    profile_photo_url: user.profilePhotoUrl,
  };
}

export function toUserResponse(user: UserWithTelebirr): Schemas["User"] {
  return {
    user_id: user.id,
    display_name: user.displayName,
    profile_photo_url: user.profilePhotoUrl,
    identifier: user.identifier,
    // Contract fixes this to the single value "Verified" (§8.5) — no
    // unverified BuryMe profile exists.
    verification_status: "Verified",
    telebirr: user.telebirrAccount ? toTelebirrAccountResponse(user.telebirrAccount) : null,
    created_at: user.createdAt.toISOString(),
  };
}
