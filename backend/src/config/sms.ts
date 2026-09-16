// Picks the SMS transport on first use: AfroMessage when credentials are
// present, otherwise the console fallback so local dev works without an
// account. Read lazily from process.env (not via config/env.ts) for the same
// reason as config/otp.ts — route tests load this module with a mocked DB
// and no full env. Routes call `getSmsSender()` rather than constructing a
// sender, so tests can `vi.mock("../config/sms.js")`.
import { AfroMessageSender, ConsoleSmsSender, type SmsSender } from "../lib/sms.js";

let instance: SmsSender | undefined;

export function getSmsSender(): SmsSender {
  if (instance) return instance;
  const apiKey = process.env.AFROMESSAGE_API_KEY;
  const from = process.env.AFROMESSAGE_FROM;
  if (apiKey && from) {
    instance = new AfroMessageSender(apiKey, from);
  } else {
    if (process.env.NODE_ENV === "production") {
      console.warn(
        "AFROMESSAGE_API_KEY / AFROMESSAGE_FROM not set — OTP codes will only be logged.",
      );
    }
    instance = new ConsoleSmsSender();
  }
  return instance;
}
