import { getMessaging } from "firebase-admin/messaging";

import { prisma } from "../db/client.js";
import { wantsPush } from "../domain/notificationPrefs.js";
import type { NotificationType } from "../domain/notificationCatalog.js";

export interface PushMessage {
  title: string;
  body: string;
}

// Never throws — a failed push must not roll back the action behind it.
export async function sendPush(
  userId: string,
  type: NotificationType,
  message: PushMessage,
): Promise<boolean> {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !wantsPush(user, type)) return false;

    const tokens = await prisma.fcmToken.findMany({ where: { userId } });
    if (tokens.length === 0) return false;

    const response = await getMessaging().sendEachForMulticast({
      tokens: tokens.map((t) => t.token),
      notification: { title: message.title, body: message.body },
    });

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
