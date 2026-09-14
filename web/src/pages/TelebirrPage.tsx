import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { ApiError } from "../api/client.js";
import { CenteredLayout } from "../components/layout/CenteredLayout.js";
import { Button } from "../components/ui/Button.js";
import { Field } from "../components/ui/Field.js";
import { Note } from "../components/ui/Note.js";
import { SummaryRow } from "../components/ui/SummaryRow.js";
import { useAuth } from "../hooks/useAuth.js";
import { useVerifyTelebirr } from "../hooks/useUsers.js";
import styles from "./TelebirrPage.module.css";

// Figma: Screen — Telebirr Verification (38:1694).
//
// The design's primary action reads "Send verification code" and leads to a
// code-entry screen (66:855). That OTP step has no backend yet — the API's
// POST /users/me/telebirr only records the number and resets its status to
// Unverified — so the button is labelled for what it actually does today.
// The full OTP flow is tracked as future work.
export function TelebirrPage() {
  const navigate = useNavigate();
  const { buryMeUser, refetch } = useAuth();
  const [telebirrNumber, setTelebirrNumber] = useState(buryMeUser?.telebirr?.telebirr_number ?? "");
  const verify = useVerifyTelebirr();

  if (!buryMeUser) return null;

  const current = verify.data ?? buryMeUser.telebirr;
  const status = current?.verification_status === "Verified" ? "Verified" : "Not verified";

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    verify.mutate(
      { telebirr_number: telebirrNumber },
      {
        onSuccess: async () => {
          await refetch();
          navigate("/profile");
        },
      },
    );
  }

  const error = verify.isError
    ? verify.error instanceof ApiError
      ? verify.error.message
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
          Verification by SMS code is not available yet — saving links the number to your
          account so it is ready once it is.
        </Note>

        <div className={styles.actions}>
          <Button type="submit" block disabled={verify.isPending}>
            {verify.isPending ? "Saving…" : "Save Telebirr number"}
          </Button>
          <Button type="button" kind="ghost" block onClick={() => navigate("/profile")}>
            Cancel
          </Button>
        </div>
      </form>
    </CenteredLayout>
  );
}
