// Client-side Firebase init. This is the ONLY place the `firebase` (client)
// package is used — the backend uses firebase-admin exclusively, never
// this. See CLAUDE.md: credential handling is entirely client-side.
import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
};

const app = getApps()[0] ?? initializeApp(firebaseConfig);
export { app };

export const auth = getAuth(app);
export const getFirebaseApp = () => getApp();

// Firebase has no native "phone number + password" sign-in provider.
// Registration verifies the phone number via real Phone Auth (OTP), then
// links a Password credential under this deterministic synthetic email so
// later logins can use phone + password (via signInWithEmailAndPassword)
// without ever sending a password to the backend. This is a purely
// client-side Firebase implementation detail — never sent to or stored by
// the backend, which only ever sees the token's real `phone_number` claim.
export function phoneToSyntheticEmail(phoneNumber: string): string {
  const digits = phoneNumber.replace(/[^0-9]/g, "");
  return `${digits}@phone.buryme.app`;
}
