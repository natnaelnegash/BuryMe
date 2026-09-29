import { Link, useLocation } from "react-router-dom";

import { useAuth } from "../../hooks/useAuth.js";
import { useUnreadCount } from "../../hooks/useNotifications.js";
import styles from "./TopNav.module.css";

// Mirrors the Figma component set's `Active` variant axis
// (Home / Requests / Obligations / Profile / None).
const NAV_ITEMS = [
  { label: "Home", to: "/" },
  { label: "Requests", to: "/requests" },
  { label: "Obligations", to: "/obligations" },
  { label: "Profile", to: "/profile" },
] as const;

function isActive(pathname: string, to: string): boolean {
  return to === "/" ? pathname === "/" : pathname.startsWith(to);
}

export function TopNav() {
  const { pathname } = useLocation();
  const unreadCount = useUnreadCount();
  const { buryMeUser } = useAuth();
  const initial = buryMeUser?.display_name?.trim().charAt(0).toUpperCase() ?? "?";

  return (
    <nav className={styles.nav}>
      <div className={styles.left}>
        <Link className={styles.brand} to="/">
          <span className={styles.brandDot} aria-hidden="true" />
          <span className={styles.brandName}>BuryMe</span>
        </Link>

        <div className={styles.items}>
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={[styles.item, active ? styles.active : ""].filter(Boolean).join(" ")}
                aria-current={active ? "page" : undefined}
              >
                {item.label}
                {active && <span className={styles.underline} aria-hidden="true" />}
              </Link>
            );
          })}
        </div>
      </div>

      <div className={styles.right}>
        <Link className={styles.newButton} to="/requests/new">
          + &nbsp;New
        </Link>

        {/* The bell opens the feed (37:1443) and carries an unread count. */}
        <Link className={styles.bell} to="/notifications" aria-label="Notifications">
          <span aria-hidden="true">🔔</span>
          {unreadCount > 0 && (
            <span className={styles.badge}>{unreadCount > 9 ? "9+" : unreadCount}</span>
          )}
        </Link>

        <Link className={styles.avatar} to="/profile" aria-label="Profile">
          {initial}
        </Link>
      </div>
    </nav>
  );
}
