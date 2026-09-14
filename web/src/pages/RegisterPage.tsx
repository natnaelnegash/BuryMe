import {
  EmailAuthProvider,
  linkWithCredential,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  type ConfirmationResult,
} from "firebase/auth";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import { register } from "../api/auth.js";
import { auth, phoneToSyntheticEmail } from "../api/firebase.js";
import { AuthLayout } from "../components/auth/AuthLayout.js";
import { Button } from "../components/ui/Button.js";
import { Field } from "../components/ui/Field.js";
import { OtpInput } from "../components/ui/OtpInput.js";
import { useAuth } from "../hooks/useAuth.js";
import styles from "./RegisterPage.module.css";

const RESEND_SECONDS = 60;

// Two visible steps, matching the Figma flow: the "Auth — Register" frame
// collects name/phone/password together, then "Auth — OTP Verification"
// confirms the number. Firebase dictates the order underneath — the phone
// sign-in must complete before a password credential can be linked to it —
// so the password is held until the code is confirmed.
type Step = "details" | "otp";

export function RegisterPage() {
  const navigate = useNavigate();
  const { refetch } = useAuth();
  const [step, setStep] = useState<Step>("details");
  const [displayName, setDisplayName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);
  const confirmationRef = useRef<ConfirmationResult | null>(null);
  const recaptchaContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (step !== "otp" || secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [step, secondsLeft]);

  async function sendCode() {
    if (!recaptchaContainerRef.current) throw new Error("reCAPTCHA container missing.");
    const verifier = new RecaptchaVerifier(auth, recaptchaContainerRef.current, {
      size: "invisible",
    });
    confirmationRef.current = await signInWithPhoneNumber(auth, phoneNumber, verifier);
  }

  async function handleSendOtp(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await sendCode();
      setSecondsLeft(RESEND_SECONDS);
      setStep("otp");
    } catch {
      setError("Couldn't send a verification code. Check the phone number and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    setError(null);
    try {
      await sendCode();
      setSecondsLeft(RESEND_SECONDS);
    } catch {
      setError("Couldn't resend the code. Try again in a moment.");
    }
  }

  async function handleVerify(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (!confirmationRef.current) throw new Error("No pending verification.");
      await confirmationRef.current.confirm(otp);

      // The phone is verified and the user is signed in — now link a password
      // credential under the synthetic email derived from that number, so
      // future logins can use phone + password (see api/firebase.ts).
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("Not signed in.");
      const credential = EmailAuthProvider.credential(phoneToSyntheticEmail(phoneNumber), password);
      await linkWithCredential(currentUser, credential);

      await register({ display_name: displayName });
      await refetch();
      navigate("/");
    } catch {
      setError("That code didn't match. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (step === "otp") {
    return (
      <AuthLayout
        title="Verify your phone"
        subtitle={`We sent a 6-digit code to ${phoneNumber}`}
        onBack={() => setStep("details")}
        footer={
          <>
            Wrong number? &nbsp;
            <button type="button" className={styles.linkButton} onClick={() => setStep("details")}>
              Change it
            </button>
          </>
        }
      >
        <form className={styles.form} onSubmit={handleVerify}>
          <div ref={recaptchaContainerRef} />
          <OtpInput value={otp} onChange={setOtp} />

          {secondsLeft > 0 ? (
            <p className={styles.resend}>
              Resend code in 0:{String(secondsLeft).padStart(2, "0")}
            </p>
          ) : (
            <button type="button" className={styles.resendButton} onClick={() => void handleResend()}>
              Resend code
            </button>
          )}

          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}

          <Button type="submit" block disabled={submitting || otp.length < 6}>
            {submitting ? "Verifying…" : "Verify"}
          </Button>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Track what you owe and what you're owed."
      footer={
        <>
          Already have an account? &nbsp;<Link to="/login">Log in</Link>
        </>
      }
    >
      <form className={styles.form} onSubmit={handleSendOtp}>
        <div ref={recaptchaContainerRef} />
        <Field
          label="Full name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Abebe Kebede"
          minLength={2}
          maxLength={50}
          required
        />
        <Field
          label="Phone number"
          type="tel"
          value={phoneNumber}
          onChange={(e) => setPhoneNumber(e.target.value)}
          placeholder="+251 91 234 5678"
          required
        />
        <Field
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          minLength={6}
          required
        />

        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}

        <Button type="submit" block disabled={submitting}>
          {submitting ? "Sending…" : "Create account"}
        </Button>
      </form>
    </AuthLayout>
  );
}
