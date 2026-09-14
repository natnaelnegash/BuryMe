import { signInWithEmailAndPassword } from "firebase/auth";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import { auth, phoneToSyntheticEmail } from "../api/firebase.js";
import { AuthLayout } from "../components/auth/AuthLayout.js";
import { Button } from "../components/ui/Button.js";
import { Field } from "../components/ui/Field.js";
import styles from "./LoginPage.module.css";

export function LoginPage() {
  const navigate = useNavigate();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signInWithEmailAndPassword(auth, phoneToSyntheticEmail(phoneNumber), password);
      navigate("/");
    } catch {
      setError("Phone number or password is incorrect.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Log in to pick up where you left off."
      footer={
        <>
          New to BuryMe? &nbsp;<Link to="/register">Create an account</Link>
        </>
      }
    >
      <form className={styles.form} onSubmit={handleSubmit}>
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
          required
        />

        {/* The design has a password-reset flow (Figma 66:920 / 66:935), but it
            can't be wired up yet: logins are keyed to a synthetic email derived
            from the phone number, which is not a real inbox, so Firebase's
            email-based reset could never deliver. Left inert pending a decision
            on how reset should actually work (likely phone OTP re-verification). */}
        <span className={styles.forgot}>Forgot password?</span>

        {error && <p role="alert" className={styles.error}>{error}</p>}

        <Button type="submit" block disabled={submitting}>
          {submitting ? "Logging in…" : "Log in"}
        </Button>
      </form>
    </AuthLayout>
  );
}
