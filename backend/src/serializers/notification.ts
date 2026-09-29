import type { Schemas } from "@buryme/shared";

import type { Notification } from "../generated/prisma/client.js";

// `notificationType` and `referenceType` are stored as plain strings — the
// catalog ids contain hyphens, which Prisma enums can't express — so the
// contract's enums are the authority and this is where the two meet.
export function toNotificationResponse(notification: Notification): Schemas["Notification"] {
  return {
    notification_id: notification.id,
    notification_type: notification.notificationType as Schemas["NotificationType"],
    title: notification.title,
    body: notification.body,
    reference_id: notification.referenceId,
    reference_type: notification.referenceType as Schemas["NotificationReferenceType"] | null,
    is_read: notification.isRead,
    delivered_at: notification.deliveredAt?.toISOString() ?? null,
    created_at: notification.createdAt.toISOString(),
  };
}
