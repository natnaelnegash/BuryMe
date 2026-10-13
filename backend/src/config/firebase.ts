import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

import { env } from "./env.js";

const globalForFirebase = globalThis as unknown as {
  firebaseApp?: ReturnType<typeof initializeApp>;
};

const app =
  globalForFirebase.firebaseApp ??
  getApps()[0] ??
  initializeApp({
    credential: cert({
      projectId: env.firebaseProjectId,
      clientEmail: env.firebaseClientEmail,
      privateKey: env.firebasePrivateKey,
    }),
  });

if (process.env.NODE_ENV !== "production") {
  globalForFirebase.firebaseApp = app;
}

export const auth = getAuth(app);
