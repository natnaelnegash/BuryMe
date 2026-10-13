export interface SmsSender {
  send(to: string, message: string): Promise<void>;
}

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

export class ConsoleSmsSender implements SmsSender {
  async send(to: string, message: string): Promise<void> {
    // eslint-disable-next-line no-console -- the whole point of this sender
    console.info(`[sms → ${to}] ${message}`);
  }
}
