// Firebase Admin SDK init — server-side token verification only (§11.1.2).
// This is NOT the client SDK; the web app has its own separate init in
// web/src/api/firebase.ts using the `firebase` (client) package.
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

import { env } from "./env.js";

// `globalThis`-cached like backend/src/db/client.ts, so `tsx watch`'s
// module-reload-on-save doesn't try to re-initialize the default app.
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
