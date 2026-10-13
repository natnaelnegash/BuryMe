import { useState } from "react";
import { Link } from "react-router-dom";

import { ErrorState } from "../components/domain/ErrorState.js";
import { NotificationRow } from "../components/domain/NotificationRow.js";
import { PageHeader } from "../components/layout/PageHeader.js";
import { Button } from "../components/ui/Button.js";
import { FilterChip } from "../components/ui/FilterChip.js";
import { Spinner } from "../components/ui/Spinner.js";
import { StateCard } from "../components/ui/StateCard.js";
import { useMarkNotificationsRead, useNotificationsQuery } from "../hooks/useNotifications.js";
import styles from "./NotificationsPage.module.css";

// Figma: Screen — Notification Feed (37:1443). Back control, head, All /
// Unread chips, then the rows.
//
// Deviation from the frame: it reuses the "Request Row" component, whose
// avatar, person name, status pill and per-row action button have no
// backing on a Notification — it carries a title, a body, a reference and
// a read flag, but no actor and no domain status. Those columns are left
// out rather than faked; unread is shown as a teal rail instead.

type Tab = "all" | "unread";

export function NotificationsPage() {
  const [tab, setTab] = useState<Tab>("all");
  const { data, isLoading, error, refetch } = useNotificationsQuery();
  const markRead = useMarkNotificationsRead();

  const all = data?.data ?? [];
  const notifications = tab === "unread" ? all.filter((n) => !n.is_read) : all;
  const unreadCount = all.filter((n) => !n.is_read).length;

  return (
    <div className={styles.page}>
      <Link to="/" className={styles.back}>
        ← &nbsp;Back
      </Link>

      <div className={styles.headRow}>
        <PageHeader title="Notifications" subtitle="Everything that needs your attention." />
        {unreadCount > 0 && (
          <Button
            kind="ghost"
            size="small"
            disabled={markRead.isPending}
            onClick={() => markRead.mutate(undefined)}
          >
            {markRead.isPending ? "Marking…" : "Mark all read"}
          </Button>
        )}
      </div>

      <div className={styles.filters}>
        <FilterChip active={tab === "all"} onClick={() => setTab("all")}>
          All
        </FilterChip>
        <FilterChip active={tab === "unread"} onClick={() => setTab("unread")}>
          Unread
        </FilterChip>
      </div>

      {error && <ErrorState error={error} onRetry={() => void refetch()} />}

      {isLoading ? (
        <Spinner block label="Loading notifications" />
      ) : error ? null : notifications.length === 0 ? (
        /* The design's one block (39:1841) reads correctly for both tabs. */
        <StateCard
          glyph="🔔"
          accent="gray"
          title="You’re all caught up"
          body="New activity will show up here."
        />
      ) : (
        <div className={styles.list}>
          {notifications.map((n) => (
            <NotificationRow
              key={n.notification_id}
              notification={n}
              onOpen={(id) => markRead.mutate([id])}
            />
          ))}
        </div>
      )}
    </div>
  );
}
