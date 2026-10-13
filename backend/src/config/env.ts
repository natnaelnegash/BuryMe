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
  firebasePrivateKey: required("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n"),
};

// Called at boot from index.ts, not at import: route tests mock the DB and
// never load a real environment.
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
