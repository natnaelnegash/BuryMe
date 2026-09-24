// Picks the Chapa client on first use: the real HTTP client when both
// secrets are present, otherwise the keyless fake. Lazy and read straight
// from process.env (like config/sms.ts) so route tests can import routes
// with a mocked DB and no full env, and `vi.mock("../config/chapa.js")`.
import { FakeChapaClient, HttpChapaClient, type ChapaClient } from "../lib/chapa.js";

let instance: ChapaClient | undefined;

export function getChapaClient(): ChapaClient {
  if (instance) return instance;
  const secretKey = process.env.CHAPA_SECRET_KEY;
  const webhookSecret = process.env.CHAPA_WEBHOOK_SECRET;
  if (secretKey && webhookSecret) {
    instance = new HttpChapaClient(secretKey, webhookSecret);
  } else {
    if (process.env.NODE_ENV === "production") {
      console.warn(
        "CHAPA_SECRET_KEY / CHAPA_WEBHOOK_SECRET not set — using the fake Chapa client.",
      );
    }
    instance = new FakeChapaClient();
  }
  return instance;
}

// Where Chapa's hosted checkout sends the payer afterwards — a web route,
// not the webhook. Defaults to the Vite dev origin.
export function chapaReturnUrl(path: string): string {
  const origin = (process.env.WEB_ORIGIN || "http://localhost:5173").replace(/\/$/, "");
  return `${origin}${path}`;
}

// Public origin of this API, for Chapa's per-transaction `callback_url`.
// Unset locally (Chapa can't reach localhost anyway — use a tunnel and set
// it to the tunnel origin); the dashboard-level webhook URL still delivers
// events regardless.
export function chapaCallbackUrl(): string | undefined {
  const origin = process.env.API_PUBLIC_ORIGIN?.replace(/\/$/, "");
  return origin ? `${origin}/api/v1/webhooks/chapa` : undefined;
}
