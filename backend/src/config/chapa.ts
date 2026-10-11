// Picks the Chapa client on first use. Lazy and read straight from
// process.env (like config/sms.ts) so route tests can import routes with a
// mocked DB and no full env, and `vi.mock("../config/chapa.js")`.
//
// The fake client is an explicit opt-in (`CHAPA_FAKE=1`), never a fallback.
// It accepts every webhook signature unconditionally
// (lib/chapa.ts FakeChapaClient), so selecting it because a secret happened
// to be blank would mean a deployed server confirming payments and
// activating obligations from any unsigned body posted to the webhook URL.
// Missing secrets therefore fail loudly instead.
//
// This deliberately does not consult NODE_ENV: nothing in the repo sets it,
// so a guard conditioned on it is inert exactly where it matters.
import { FakeChapaClient, HttpChapaClient, type ChapaClient } from "../lib/chapa.js";
import { webOrigin } from "./origins.js";

let instance: ChapaClient | undefined;

export function getChapaClient(): ChapaClient {
  if (instance) return instance;

  if (process.env.CHAPA_FAKE === "1") {
    instance = new FakeChapaClient();
    return instance;
  }

  const secretKey = process.env.CHAPA_SECRET_KEY;
  const webhookSecret = process.env.CHAPA_WEBHOOK_SECRET;
  if (!secretKey || !webhookSecret) {
    throw new Error(
      "CHAPA_SECRET_KEY and CHAPA_WEBHOOK_SECRET are required. " +
        "Set both, or set CHAPA_FAKE=1 to use the keyless dev double " +
        "(which accepts ALL webhook signatures — never in a deployed environment).",
    );
  }

  instance = new HttpChapaClient(secretKey, webhookSecret);
  return instance;
}

// Where Chapa's hosted checkout sends the payer afterwards — a web route,
// not the webhook.
export function chapaReturnUrl(path: string): string {
  return `${webOrigin()}${path}`;
}

// Public origin of this API, for Chapa's per-transaction `callback_url`.
// Unset locally (Chapa can't reach localhost anyway — use a tunnel and set
// it to the tunnel origin); the dashboard-level webhook URL still delivers
// events regardless.
export function chapaCallbackUrl(): string | undefined {
  const origin = process.env.API_PUBLIC_ORIGIN?.replace(/\/$/, "");
  return origin ? `${origin}/api/v1/webhooks/chapa` : undefined;
}
