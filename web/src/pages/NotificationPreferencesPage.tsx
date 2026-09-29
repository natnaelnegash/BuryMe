import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Schemas } from "@buryme/shared";

import { ApiError } from "../api/client.js";
import { CenteredLayout } from "../components/layout/CenteredLayout.js";
import { Button } from "../components/ui/Button.js";
import { Note } from "../components/ui/Note.js";
import { Toggle } from "../components/ui/Toggle.js";
import { useAuth } from "../hooks/useAuth.js";
import { useUpdateNotificationPreferences } from "../hooks/useNotifications.js";
import styles from "./NotificationPreferencesPage.module.css";

// Figma: Screen — Notification Preferences (66:744 / host 66:774). Seven
// switches, one per §13.2 event family, then the gray note and Save.

type Prefs = Schemas["NotificationPreferences"];
type PrefKey = keyof Prefs;

// Copy taken verbatim from the frame's Pref Rows (66:808 onward).
const ROWS: { key: PrefKey; name: string; desc: string }[] = [
  {
    key: "requests",
    name: "Requests and lending records",
    desc: "New borrow requests, counter-proposals, and lending records sent to you.",
  },
  {
    key: "group_expenses",
    name: "Group expenses",
    desc: "Shares assigned to you, acknowledgements, and consolidated expense updates.",
  },
  {
    key: "payments",
    name: "Payments and disbursements",
    desc: "Chapa payments, external records waiting on your confirmation, and confirmed payments.",
  },
  {
    key: "schedules",
    name: "Repayment schedules",
    desc: "Schedules proposed to you, accepted schedules, and installment changes.",
  },
  {
    key: "settlements",
    name: "Settlement",
    desc: "Settlement suggestions, responses needed, and completed settlements.",
  },
  {
    key: "reminders",
    name: "Reminders",
    desc: "Upcoming and overdue installments, and payments still waiting on a response.",
  },
  {
    key: "telebirr",
    name: "Telebirr account",
    desc: "Prompts to verify Telebirr, and when someone you owe verifies theirs.",
  },
];

export function NotificationPreferencesPage() {
  const navigate = useNavigate();
  const { buryMeUser } = useAuth();
  const update = useUpdateNotificationPreferences();

  // The contract has no GET for preferences, so the current values come off
  // the signed-in user's profile.
  const saved = buryMeUser?.notification_preferences;
  const [prefs, setPrefs] = useState<Prefs | null>(saved ?? null);
  useEffect(() => {
    if (saved && !prefs) setPrefs(saved);
  }, [saved, prefs]);

  if (!prefs) {
    return (
      <CenteredLayout
        title="Notification preferences"
        subtitle="Choose what gets pushed to your device."
        width={680}
        back={() => navigate("/profile")}
      >
        <p className={styles.desc}>Loading…</p>
      </CenteredLayout>
    );
  }

  return (
    <CenteredLayout
      title="Notification preferences"
      subtitle="Choose what gets pushed to your device."
      width={680}
      back={() => navigate("/profile")}
    >
      <div className={styles.stack}>
        {ROWS.map((row) => (
          <div key={row.key} className={styles.row}>
            <span className={styles.text}>
              <span className={styles.name}>{row.name}</span>
              <span className={styles.desc}>{row.desc}</span>
            </span>
            <Toggle
              checked={prefs[row.key] === true}
              onChange={(next) => setPrefs({ ...prefs, [row.key]: next })}
              label={row.name}
            />
          </div>
        ))}

        <Note color="gray">
          These switches control push notifications only. Every notification is still recorded in
          your in-app feed, whatever you choose here.
        </Note>

        {update.error && (
          <p role="alert" className={styles.error}>
            {update.error instanceof ApiError ? update.error.message : "Something went wrong."}
          </p>
        )}
        {update.isSuccess && !update.isPending && (
          <p className={styles.saved}>Preferences saved.</p>
        )}

        <Button block disabled={update.isPending} onClick={() => update.mutate(prefs)}>
          {update.isPending ? "Saving…" : "Save preferences"}
        </Button>
      </div>
    </CenteredLayout>
  );
}
