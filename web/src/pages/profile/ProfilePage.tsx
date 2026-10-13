import { signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";

import { auth } from "../../api/firebase.js";
import { CenteredLayout } from "../../components/layout/CenteredLayout.js";
import { Avatar } from "../../components/ui/Avatar.js";
import { Button } from "../../components/ui/Button.js";
import { SummaryRow } from "../../components/ui/SummaryRow.js";
import { useAuth } from "../../hooks/useAuth.js";
import styles from "./ProfilePage.module.css";

function memberSince(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function ProfilePage() {
  const navigate = useNavigate();
  const { buryMeUser } = useAuth();

  if (!buryMeUser) return null;

  const telebirr = buryMeUser.telebirr;
  const telebirrVerified = telebirr?.verification_status === "Verified";

  return (
    <CenteredLayout
      title="Profile"
      subtitle="Your account and how other people see you."
      width={680}
    >
      <div className={styles.avatarRow}>
        <Avatar name={buryMeUser.display_name} size={56} />
        <Button kind="secondary" size="small" disabled reason="Photo upload is coming soon">
          Change photo
        </Button>
      </div>

      <div className={styles.summary}>
        <SummaryRow label="Full name" value={buryMeUser.display_name} />
        <SummaryRow label="Phone number" value={buryMeUser.identifier} />
        <SummaryRow
          label="Telebirr"
          value={
            telebirrVerified
              ? "Verified"
              : telebirr?.telebirr_number
                ? "Not verified"
                : "Not linked"
          }
          tone={telebirrVerified ? "teal" : "gray"}
          action={
            <Button kind="secondary" size="small" onClick={() => navigate("/profile/telebirr")}>
              {!telebirr?.telebirr_number
                ? "Link number"
                : telebirrVerified
                  ? "Change number"
                  : "Verify now"}
            </Button>
          }
        />
        <SummaryRow
          label="Notifications"
          value="Push preferences"
          action={
            <Button
              kind="secondary"
              size="small"
              onClick={() => navigate("/notifications/preferences")}
            >
              Manage
            </Button>
          }
        />
        <SummaryRow
          label="Member since"
          value={memberSince(buryMeUser.created_at)}
          divider={false}
        />
      </div>

      <div className={styles.actions}>
        <Button block onClick={() => navigate("/profile/edit")}>
          Edit profile
        </Button>
        <Button kind="ghost" block onClick={() => void signOut(auth)}>
          Log out
        </Button>
      </div>
    </CenteredLayout>
  );
}
