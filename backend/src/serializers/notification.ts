import type { Schemas } from "@buryme/shared";

import type { Notification } from "../generated/prisma/client.js";

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
