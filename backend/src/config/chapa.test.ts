import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const CHAPA_KEYS = [
  "CHAPA_FAKE",
  "CHAPA_SECRET_KEY",
  "CHAPA_WEBHOOK_SECRET",
  "WEB_ORIGIN",
  "API_PUBLIC_ORIGIN",
] as const;

let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  vi.resetModules();
  saved = Object.fromEntries(CHAPA_KEYS.map((k) => [k, process.env[k]]));
  for (const k of CHAPA_KEYS) delete process.env[k];
});

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("getChapaClient", () => {
  it("throws rather than falling back to the fake when both secrets are missing", async () => {
    const { getChapaClient } = await import("./chapa.js");
    expect(() => getChapaClient()).toThrow(
      /CHAPA_SECRET_KEY and CHAPA_WEBHOOK_SECRET are required/,
    );
  });

  it("throws when only one of the two secrets is set", async () => {
    process.env.CHAPA_SECRET_KEY = "sk_test_123";
    const { getChapaClient } = await import("./chapa.js");
    expect(() => getChapaClient()).toThrow(/required/);
  });

  it("does not consult NODE_ENV — a missing secret fails in dev too", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const { getChapaClient } = await import("./chapa.js");
    expect(() => getChapaClient()).toThrow(/required/);
    vi.unstubAllEnvs();
  });

  it("selects the fake only on explicit CHAPA_FAKE=1", async () => {
    process.env.CHAPA_FAKE = "1";
    const { getChapaClient } = await import("./chapa.js");
    const { FakeChapaClient } = await import("../integrations/chapa.js");
    expect(getChapaClient()).toBeInstanceOf(FakeChapaClient);
  });

  it("selects the real HTTP client when both secrets are present", async () => {
    process.env.CHAPA_SECRET_KEY = "sk_test_123";
    process.env.CHAPA_WEBHOOK_SECRET = "whsec_123";
    const { getChapaClient } = await import("./chapa.js");
    const { HttpChapaClient } = await import("../integrations/chapa.js");
    expect(getChapaClient()).toBeInstanceOf(HttpChapaClient);
  });
});

describe("assertRuntimeConfig", () => {
  function stubRequiredEnv(): void {
    vi.stubEnv("DATABASE_URL", "postgresql://localhost/x");
    vi.stubEnv("FIREBASE_PROJECT_ID", "x");
    vi.stubEnv("FIREBASE_CLIENT_EMAIL", "x");
    vi.stubEnv("FIREBASE_PRIVATE_KEY", "x");
  }

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("names every missing deployment variable at once", async () => {
    stubRequiredEnv();
    const { assertRuntimeConfig } = await import("./env.js");
    expect(() => assertRuntimeConfig()).toThrow(
      /CHAPA_SECRET_KEY, CHAPA_WEBHOOK_SECRET, WEB_ORIGIN, API_PUBLIC_ORIGIN/,
    );
  });

  it("requires a reachable callback origin when the real gateway is in use", async () => {
    stubRequiredEnv();
    process.env.CHAPA_SECRET_KEY = "sk_test_123";
    process.env.CHAPA_WEBHOOK_SECRET = "whsec_123";
    process.env.WEB_ORIGIN = "https://app.example.com";
    const { assertRuntimeConfig } = await import("./env.js");
    expect(() => assertRuntimeConfig()).toThrow(/API_PUBLIC_ORIGIN/);
  });

  it("passes with the full set", async () => {
    stubRequiredEnv();
    process.env.CHAPA_SECRET_KEY = "sk_test_123";
    process.env.CHAPA_WEBHOOK_SECRET = "whsec_123";
    process.env.WEB_ORIGIN = "https://app.example.com";
    process.env.API_PUBLIC_ORIGIN = "https://api.example.com";
    const { assertRuntimeConfig } = await import("./env.js");
    expect(() => assertRuntimeConfig()).not.toThrow();
  });

  it("skips the gateway checks under the keyless dev opt-in", async () => {
    stubRequiredEnv();
    process.env.CHAPA_FAKE = "1";
    const { assertRuntimeConfig } = await import("./env.js");
    expect(() => assertRuntimeConfig()).not.toThrow();
  });
});
