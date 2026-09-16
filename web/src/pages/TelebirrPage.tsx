import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { ApiError } from "../api/client.js";
import { CenteredLayout } from "../components/layout/CenteredLayout.js";
import { Button } from "../components/ui/Button.js";
import { Field } from "../components/ui/Field.js";
import { Note } from "../components/ui/Note.js";
import { SummaryRow } from "../components/ui/SummaryRow.js";
import { useAuth } from "../hooks/useAuth.js";
import { useSendTelebirrOtp, useVerifyTelebirr } from "../hooks/useUsers.js";
import styles from "./TelebirrPage.module.css";

// Figma: Screen — Telebirr Verification (38:1694). Saves the number
// (POST /users/me/telebirr), asks the backend to SMS a code
// (POST /users/me/telebirr/otp), then hands off to the code-entry screen.
export function TelebirrPage() {
  const navigate = useNavigate();
  const { buryMeUser, refetch } = useAuth();
  const [telebirrNumber, setTelebirrNumber] = useState(buryMeUser?.telebirr?.telebirr_number ?? "");
  const save = useVerifyTelebirr();
  const sendOtp = useSendTelebirrOtp();

  if (!buryMeUser) return null;

  const current = buryMeUser.telebirr;
  const status = current?.verification_status === "Verified" ? "Verified" : "Not verified";
  const pending = save.isPending || sendOtp.isPending;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    save.mutate(
      { telebirr_number: telebirrNumber },
      {
        onSuccess: () => {
          sendOtp.mutate(undefined, {
            onSuccess: async (challenge) => {
              await refetch();
              navigate("/profile/telebirr/verify", {
                state: { resendAvailableAt: challenge.resend_available_at },
              });
            },
          });
        },
      },
    );
  }

  const failure = save.error ?? sendOtp.error;
  const error = failure
    ? failure instanceof ApiError
      ? failure.message
      : "Something went wrong."
    : null;

  return (
    <CenteredLayout
      title="Verify Telebirr"
      subtitle="Link your Telebirr number so people can pay you in-app."
      width={680}
      back
    >
      <form className={styles.form} onSubmit={handleSubmit}>
        <Field
          label="Telebirr phone number"
          type="tel"
          value={telebirrNumber}
          onChange={(e) => setTelebirrNumber(e.target.value)}
          placeholder="09XXXXXXXX or +2519XXXXXXXX"
          required
          error={error}
        />

        <div className={styles.summary}>
          <SummaryRow
            label="Current status"
            value={status}
            tone={status === "Verified" ? "teal" : "gray"}
          />
          <SummaryRow label="Account name" value={buryMeUser.display_name} divider={false} />
        </div>

        <Note color="indigo">
          We&rsquo;ll text a 6-digit code to this number to confirm it&rsquo;s yours. Changing a
          verified number means verifying it again.
        </Note>

        <div className={styles.actions}>
          <Button type="submit" block disabled={pending}>
            {save.isPending
              ? "Saving…"
              : sendOtp.isPending
                ? "Sending code…"
                : "Send verification code"}
          </Button>
          <Button type="button" kind="ghost" block onClick={() => navigate("/profile")}>
            Cancel
          </Button>
        </div>
      </form>
    </CenteredLayout>
  );
}
