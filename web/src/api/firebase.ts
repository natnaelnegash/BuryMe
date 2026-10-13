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

export function phoneToSyntheticEmail(phoneNumber: string): string {
  const digits = phoneNumber.replace(/[^0-9]/g, "");
  return `${digits}@phone.buryme.app`;
}
