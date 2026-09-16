import { signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";

import { auth } from "../api/firebase.js";
import { CenteredLayout } from "../components/layout/CenteredLayout.js";
import { Avatar } from "../components/ui/Avatar.js";
import { Button } from "../components/ui/Button.js";
import { SummaryRow } from "../components/ui/SummaryRow.js";
import { useAuth } from "../hooks/useAuth.js";
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
        {/* Photo upload is a separate flow the contract defers to a later
            slice (multer/S3, §11.1.6) — surfaced as unavailable rather than
            hidden, using the design's own "reason" affordance. */}
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
            // A saved-but-unverified number's useful action is finishing
            // verification — the number screen re-sends a code on submit.
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
