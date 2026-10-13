import { Link } from "react-router-dom";
import type { Schemas } from "@buryme/shared";

import { formatRelative } from "../../lib/dates.js";
import { notificationHref } from "../../hooks/useNotifications.js";
import styles from "./NotificationRow.module.css";

export function NotificationRow({
  notification,
  onOpen,
}: {
  notification: Schemas["Notification"];
  onOpen: (id: string) => void;
}) {
  return (
    <Link
      to={notificationHref(notification)}
      className={[styles.row, notification.is_read ? "" : styles.unread].filter(Boolean).join(" ")}
      onClick={() => {
        if (!notification.is_read) onOpen(notification.notification_id);
      }}
    >
      <span className={styles.textCol}>
        <span className={styles.title}>{notification.title}</span>
        <span className={styles.body}>{notification.body}</span>
      </span>
      <span className={styles.time}>{formatRelative(notification.created_at)}</span>
    </Link>
  );
}
