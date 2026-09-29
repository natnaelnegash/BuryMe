import { getMessaging } from "firebase-admin/messaging";

import { prisma } from "../db/client.js";
import { wantsPush } from "../lib/notificationPrefs.js";
import type { NotificationType } from "../lib/notificationCatalog.js";

// FCM push (§13). Tokens arrive via POST /auth/fcm-token (Slice 1); this is
// the send side. Deliberately lazy — `getMessaging()` is resolved on first
// send rather than at import, so route tests that mock the DB and Firebase
// don't need a full Firebase env just to load a module.

export interface PushMessage {
  title: string;
  body: string;
}

// Returns whether at least one device accepted the message. Never throws:
// push is best-effort on top of the durable feed row.
export async function sendPush(
  userId: string,
  type: NotificationType,
  message: PushMessage,
): Promise<boolean> {
  try {
    // The feed row is still written when a category is off — the user opted
    // out of being interrupted, not out of being told (§7.1.5).
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !wantsPush(user, type)) return false;

    const tokens = await prisma.fcmToken.findMany({ where: { userId } });
    if (tokens.length === 0) return false;

    const response = await getMessaging().sendEachForMulticast({
      tokens: tokens.map((t) => t.token),
      notification: { title: message.title, body: message.body },
    });

    // A token the device has revoked stays in our table forever otherwise,
    // and every later send retries it.
    const dead = response.responses
      .map((r, i) => (!r.success && isUnregistered(r.error?.code) ? tokens[i]!.token : null))
      .filter((t): t is string => t !== null);
    if (dead.length > 0) {
      await prisma.fcmToken.deleteMany({ where: { token: { in: dead } } });
    }

    return response.successCount > 0;
  } catch (err) {
    console.error("Push send failed:", err);
    return false;
  }
}

function isUnregistered(code: string | undefined): boolean {
  return (
    code === "messaging/registration-token-not-registered" ||
    code === "messaging/invalid-registration-token"
  );
}
