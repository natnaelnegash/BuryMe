// Centralized, typed access to process.env. Values are loaded into
// process.env before this module runs — the "dev"/"start" scripts pass
// `--env-file=../.env` to Node (see backend/package.json) rather than any
// module here doing the loading itself.
//
// Fail fast on a missing required var instead of letting `undefined` leak
// into a query string, Firebase Admin init, etc. and surface as a confusing
// downstream error.
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required("DATABASE_URL"),
  firebaseProjectId: required("FIREBASE_PROJECT_ID"),
  firebaseClientEmail: required("FIREBASE_CLIENT_EMAIL"),
  // .env stores the PEM key with literal "\n" sequences (real newlines
  // aren't valid in a single-line env var) — unescape them back to actual
  // newlines for the Admin SDK's cert() call.
  firebasePrivateKey: required("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n"),
  // AfroMessage + OTP pepper live in config/sms.ts and config/otp.ts — read
  // lazily there so route tests (which mock the DB and Firebase) don't need
  // the full env to import them.
};

/**
 * Checked once at server boot (index.ts), not at import — route tests mock
 * the DB and never load a real environment, and `app.ts` is imported
 * directly by supertest.
 *
 * Only reached when the real Chapa client is in use: talking to the live
 * gateway implies a reachable callback origin and a real return origin, and
 * the alternative to checking here is three separate silent failures — an
 * unsigned-webhook-accepting fake client, hosted-checkout payers redirected
 * to localhost, and no per-transaction callback_url at all.
 */
export function assertRuntimeConfig(): void {
  if (process.env.CHAPA_FAKE === "1") return;

  const missing = [
    "CHAPA_SECRET_KEY",
    "CHAPA_WEBHOOK_SECRET",
    "WEB_ORIGIN",
    "API_PUBLIC_ORIGIN",
  ].filter((name) => !process.env[name]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(", ")}. ` +
        "Set them, or set CHAPA_FAKE=1 for keyless local development.",
    );
  }
}
