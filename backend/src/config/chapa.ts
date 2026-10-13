import { FakeChapaClient, HttpChapaClient, type ChapaClient } from "../integrations/chapa.js";
import { webOrigin } from "./origins.js";

let instance: ChapaClient | undefined;

export function getChapaClient(): ChapaClient {
  if (instance) return instance;

  // The fake accepts every webhook signature, so it is an explicit opt-in and
  // never a fallback: a deployed server that picked it up because a secret was
  // blank would activate obligations from any unsigned body. Not gated on
  // NODE_ENV, which nothing in the repo sets.
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

export function chapaReturnUrl(path: string): string {
  return `${webOrigin()}${path}`;
}

export function chapaCallbackUrl(): string | undefined {
  const origin = process.env.API_PUBLIC_ORIGIN?.replace(/\/$/, "");
  return origin ? `${origin}/api/v1/webhooks/chapa` : undefined;
}
