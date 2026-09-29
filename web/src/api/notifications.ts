import type { Schemas } from "@buryme/shared";

import { apiClient } from "./client.js";

export interface NotificationPage {
  data: Schemas["Notification"][];
  next_cursor: string | null;
}

export const listNotifications = (params?: { limit?: number; cursor?: string }) => {
  const query = new URLSearchParams();
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.cursor) query.set("cursor", params.cursor);
  const suffix = query.size > 0 ? `?${query}` : "";
  return apiClient.get<NotificationPage>(`/notifications${suffix}`);
};

// Omitting the ids marks the whole feed read, per the contract.
export const markNotificationsRead = (notificationIds?: string[]) =>
  apiClient.post<void>(
    "/notifications/read",
    notificationIds ? { notification_ids: notificationIds } : {},
  );

export const updateNotificationPreferences = (prefs: Schemas["NotificationPreferences"]) =>
  apiClient.patch<Schemas["NotificationPreferences"]>("/notifications/preferences", prefs);
