// Outbound SMS, used for Telebirr OTP delivery. The interface is the seam:
// routes and lib/telebirrOtp.ts only ever see `SmsSender`, so the provider
// can change without touching them. AfroMessage is the first (and, for the
// Ethiopian market, obvious) implementation.

export interface SmsSender {
  send(to: string, message: string): Promise<void>;
}

// AfroMessage — https://afromessage.com. Free-tier accounts have no sender
// name, so the body carries only the identifier id (`from`); `sender` is
// optional in their API and deliberately omitted.
export class AfroMessageSender implements SmsSender {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(to: string, message: string): Promise<void> {
    let response: Response;

    try {
      response = await this.fetchImpl("https://api.afromessage.com/api/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ from: this.from, to: to, message: message }),
      });
    } catch {
      throw new Error("SMS provider unreachable");
    }
    // AfroMessage answers 200 with `{ acknowledge: "success" | "error" }`;
    // treat anything else as a failed send. The body is never logged —
    // it can echo the message (and so the code) back.
    let acknowledge: unknown;
    try {
      acknowledge = ((await response.json()) as { acknowledge?: unknown }).acknowledge;
    } catch {
      acknowledge = undefined;
    }
    if (!response.ok || acknowledge !== "success") {
      throw new Error(`SMS provider rejected the message (HTTP ${response.status})`);
    }
  }
}

// Development / test fallback when no AfroMessage key is configured: the
// code shows up in the backend console instead of on a phone.
export class ConsoleSmsSender implements SmsSender {
  async send(to: string, message: string): Promise<void> {
    // eslint-disable-next-line no-console -- the whole point of this sender
    console.info(`[sms → ${to}] ${message}`);
  }
}
