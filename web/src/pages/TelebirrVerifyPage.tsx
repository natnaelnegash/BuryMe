import { useEffect, useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

import { ApiError } from "../api/client.js";
import { CenteredLayout } from "../components/layout/CenteredLayout.js";
import { Button } from "../components/ui/Button.js";
import { Note } from "../components/ui/Note.js";
import { OtpInput } from "../components/ui/OtpInput.js";
import { useAuth } from "../hooks/useAuth.js";
import { useConfirmTelebirrOtp, useSendTelebirrOtp } from "../hooks/useUsers.js";
import styles from "./TelebirrVerifyPage.module.css";

// Figma: Screen — Telebirr Verification · Code (66:855). Same column as the
// number screen; the card holds the OTP row, the resend countdown, a note,
// and Verify / Cancel. The countdown is driven by the challenge's
// `resend_available_at` (passed via router state from TelebirrPage, or from
// a resend here) so it matches the backend's 60-second gate exactly.

interface LocationState {
  resendAvailableAt?: string;
}

function secondsUntil(iso: string | undefined): number {
  if (!iso) return 0;
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 1000));
}

export function TelebirrVerifyPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { buryMeUser, refetch } = useAuth();
  const [code, setCode] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(() =>
    secondsUntil((location.state as LocationState | null)?.resendAvailableAt),
  );
  const confirm = useConfirmTelebirrOtp();
  const resend = useSendTelebirrOtp();

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = window.setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => window.clearTimeout(id);
  }, [secondsLeft]);

  if (!buryMeUser) return null;
  const telebirr = buryMeUser.telebirr;
  // Nothing to verify without a saved, unverified number.
  if (!telebirr?.telebirr_number) return <Navigate to="/profile/telebirr" replace />;
  if (telebirr.verification_status === "Verified") return <Navigate to="/profile" replace />;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    confirm.mutate(
      { code },
      {
        onSuccess: async () => {
          await refetch();
          navigate("/profile");
        },
      },
    );
  }

  function handleResend() {
    resend.mutate(undefined, {
      onSuccess: (challenge) => {
        setCode("");
        confirm.reset();
        setSecondsLeft(secondsUntil(challenge.resend_available_at));
      },
    });
  }

  const failure = confirm.error ?? resend.error;
  const error = failure
    ? failure instanceof ApiError
      ? failure.message
      : "Something went wrong."
    : null;

  return (
    <CenteredLayout
      title="Verify Telebirr"
      subtitle={`We sent a 6-digit code to ${telebirr.telebirr_number}`}
      width={680}
      back
    >
      <form className={styles.form} onSubmit={handleSubmit}>
        <OtpInput value={code} onChange={setCode} />

        {secondsLeft > 0 ? (
          <p className={styles.resend}>Resend code in 0:{String(secondsLeft).padStart(2, "0")}</p>
        ) : (
          <button
            type="button"
            className={styles.resendButton}
            onClick={handleResend}
            disabled={resend.isPending}
          >
            {resend.isPending ? "Sending…" : "Resend code"}
          </button>
        )}

        <Note color="gray">
          The code expires in 5 minutes. Once verified, lenders can send money straight to this
          Telebirr number.
        </Note>

        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}

        <div className={styles.actions}>
          <Button type="submit" block disabled={confirm.isPending || code.length < 6}>
            {confirm.isPending ? "Verifying…" : "Verify"}
          </Button>
          <Button type="button" kind="ghost" block onClick={() => navigate("/profile")}>
            Cancel
          </Button>
        </div>
      </form>
    </CenteredLayout>
  );
}
