import { AfroMessageSender, ConsoleSmsSender, type SmsSender } from "../integrations/sms.js";

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
