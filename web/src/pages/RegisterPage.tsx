import {
  EmailAuthProvider,
  linkWithCredential,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  type ConfirmationResult,
} from "firebase/auth";
import { useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { register } from "../api/auth.js";
import { auth, phoneToSyntheticEmail } from "../api/firebase.js";
import { useAuth } from "../hooks/useAuth.js";

type Step = "phone" | "otp" | "profile";

export function RegisterPage() {
  const navigate = useNavigate();
  const { refetch } = useAuth();
  const [step, setStep] = useState<Step>("phone");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otp, setOtp] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const confirmationRef = useRef<ConfirmationResult | null>(null);
  const recaptchaContainerRef = useRef<HTMLDivElement | null>(null);

  async function handleSendOtp(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (!recaptchaContainerRef.current) throw new Error("reCAPTCHA container missing.");
      const verifier = new RecaptchaVerifier(auth, recaptchaContainerRef.current, {
        size: "invisible",
      });
      confirmationRef.current = await signInWithPhoneNumber(auth, phoneNumber, verifier);
      setStep("otp");
    } catch {
      setError("Couldn't send a verification code. Check the phone number and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirmOtp(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (!confirmationRef.current) throw new Error("No pending verification.");
      await confirmationRef.current.confirm(otp);
      setStep("profile");
    } catch {
      setError("That code didn't match. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCompleteProfile(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("Not signed in.");

      // Links a password credential under a synthetic email derived from
      // the (now-verified) phone number, so future logins can use
      // phone + password — see api/firebase.ts's phoneToSyntheticEmail.
      const credential = EmailAuthProvider.credential(phoneToSyntheticEmail(phoneNumber), password);
      await linkWithCredential(currentUser, credential);

      await register({ display_name: displayName });
      await refetch();
      navigate("/");
    } catch {
      setError("Couldn't complete registration. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main>
      <h1>Register</h1>
      <div ref={recaptchaContainerRef} />

      {step === "phone" && (
        <form onSubmit={handleSendOtp}>
          <label>
            Phone number
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="+2519xxxxxxxx"
              required
            />
          </label>
          {error && <p role="alert">{error}</p>}
          <button type="submit" disabled={submitting}>
            {submitting ? "Sending…" : "Send code"}
          </button>
        </form>
      )}

      {step === "otp" && (
        <form onSubmit={handleConfirmOtp}>
          <label>
            Verification code
            <input type="text" value={otp} onChange={(e) => setOtp(e.target.value)} required />
          </label>
          {error && <p role="alert">{error}</p>}
          <button type="submit" disabled={submitting}>
            {submitting ? "Verifying…" : "Verify"}
          </button>
        </form>
      )}

      {step === "profile" && (
        <form onSubmit={handleCompleteProfile}>
          <label>
            Display name
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error && <p role="alert">{error}</p>}
          <button type="submit" disabled={submitting}>
            {submitting ? "Finishing…" : "Finish"}
          </button>
        </form>
      )}
    </main>
  );
}
