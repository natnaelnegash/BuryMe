import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Schemas } from "@buryme/shared";

import {
  listNotifications,
  markNotificationsRead,
  updateNotificationPreferences,
} from "../api/notifications.js";

const NOTIFICATIONS_KEY = ["notifications"] as const;

export function useNotificationsQuery(params?: { limit?: number }) {
  return useQuery({
    queryKey: [...NOTIFICATIONS_KEY, params?.limit ?? "default"],
    queryFn: () => listNotifications(params),
  });
}

// The bell's badge. Derived from the same page the feed renders rather than
// a separate count endpoint — the contract has none, and the feed is
// already the thing being polled.
export function useUnreadCount(): number {
  const { data } = useNotificationsQuery();
  return (data?.data ?? []).filter((n) => !n.is_read).length;
}

export function useMarkNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (notificationIds?: string[]) => markNotificationsRead(notificationIds),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY }),
  });
}

export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (prefs: Schemas["NotificationPreferences"]) => updateNotificationPreferences(prefs),
    // Preferences live on the user, so the profile screens read stale
    // otherwise.
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY }),
        queryClient.invalidateQueries({ queryKey: ["auth", "me"] }),
      ]),
  });
}

// Where a notification should navigate, per the §13.2 catalog's Navigation
// Target column. A null reference means the Dashboard.
export function notificationHref(n: Schemas["Notification"]): string {
  if (!n.reference_id || !n.reference_type) return "/";
  switch (n.reference_type) {
    case "Request":
      return `/requests/${n.reference_id}`;
    case "Obligation":
      return `/obligations/${n.reference_id}`;
    case "Payment":
      // Payments have no screen of their own — the catalog's "Payment
      // record" lives inside the obligation's detail.
      return `/obligations`;
    case "GroupExpense":
      return `/expenses/${n.reference_id}`;
    case "SettlementSuggestion":
      return `/settlements/${n.reference_id}`;
    case "TelebirrAccount":
      return "/profile/telebirr";
    default:
      return "/";
  }
}
