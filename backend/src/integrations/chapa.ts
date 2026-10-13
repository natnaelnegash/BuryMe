import { createHmac, timingSafeEqual } from "node:crypto";

export interface TransferInput {
  amount: number;
  currency: "ETB";
  accountNumber: string;
  reference: string;
  beneficiaryName: string;
}

export interface CheckoutInput {
  amount: number;
  currency: "ETB";
  reference: string;
  payerName: string;
  payerPhone: string;
  returnUrl: string;
  callbackUrl?: string;
}

export interface ChapaClient {
  initiateCheckout(input: CheckoutInput): Promise<{ checkoutUrl: string }>;
  initiateTransfer(input: TransferInput): Promise<{ transferId: string }>;
  verifyWebhookSignature(rawBody: Buffer, signature: string | undefined): boolean;
}

export class ChapaGatewayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChapaGatewayError";
  }
}

const TELEBIRR_BANK_CODE = 855;

// Response bodies are never logged — they can carry account details.
export class HttpChapaClient implements ChapaClient {
  constructor(
    private readonly secretKey: string,
    private readonly webhookSecret: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async initiateCheckout(input: CheckoutInput): Promise<{ checkoutUrl: string }> {
    let response: Response;
    try {
      response = await this.fetchImpl("https://api.chapa.co/v1/transaction/initialize", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: input.amount.toFixed(2),
          currency: input.currency,
          tx_ref: input.reference,
          phone_number: input.payerPhone,
          first_name: input.payerName,
          return_url: input.returnUrl,
          ...(input.callbackUrl ? { callback_url: input.callbackUrl } : {}),
          "customization[title]": "BuryMe",
        }),
      });
    } catch {
      throw new ChapaGatewayError("Chapa unreachable");
    }
    let payload: { status?: unknown; data?: { checkout_url?: unknown } } = {};
    try {
      payload = (await response.json()) as typeof payload;
    } catch {}
    const checkoutUrl = payload.data?.checkout_url;
    if (!response.ok || payload.status !== "success" || typeof checkoutUrl !== "string") {
      throw new ChapaGatewayError(`Chapa rejected the checkout (HTTP ${response.status})`);
    }
    return { checkoutUrl };
  }

  async initiateTransfer(input: TransferInput): Promise<{ transferId: string }> {
    let response: Response;
    try {
      response = await this.fetchImpl("https://api.chapa.co/v1/transfers", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          account_name: input.beneficiaryName,
          account_number: "0" + input.accountNumber.slice(4),
          amount: input.amount.toFixed(2),
          currency: input.currency,
          reference: input.reference,
          bank_code: TELEBIRR_BANK_CODE,
        }),
      });
    } catch {
      throw new ChapaGatewayError("Chapa unreachable");
    }
    let payload: { status?: unknown; data?: unknown } = {};
    try {
      payload = (await response.json()) as typeof payload;
    } catch {}
    if (!response.ok || payload.status !== "success") {
      throw new ChapaGatewayError(`Chapa rejected the transfer (HTTP ${response.status})`);
    }
    const transferId = typeof payload.data === "string" ? payload.data : input.reference;
    return { transferId };
  }

  verifyWebhookSignature(rawBody: Buffer, signature: string | undefined): boolean {
    if (!signature) return false;
    const expected = createHmac("sha256", this.webhookSecret).update(rawBody).digest("hex");
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(signature.trim().toLowerCase(), "utf8");
    return a.length === b.length && timingSafeEqual(a, b);
  }
}

export class FakeChapaClient implements ChapaClient {
  async initiateCheckout(input: CheckoutInput): Promise<{ checkoutUrl: string }> {
    return { checkoutUrl: `${input.returnUrl}?fake_checkout=${input.reference}` };
  }

  async initiateTransfer(input: TransferInput): Promise<{ transferId: string }> {
    return { transferId: `fake-transfer-${input.reference}` };
  }

  verifyWebhookSignature(): boolean {
    return true;
  }
}
