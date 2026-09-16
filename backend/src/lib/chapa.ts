import { createHmac, timingSafeEqual } from "node:crypto";

// Chapa (§11.1.1). Every Chapa payment is two hops through BuryMe's merchant
// balance: a *checkout* the payer pays into, then a *transfer* out to the
// recipient's verified Telebirr. Slice 4 uses both for disbursement (lender
// pays in → borrower paid out); Slice 5 reuses them with the roles swapped.
//
// `ChapaClient` is the seam: routes only see this interface, so tests and
// keyless local dev use `FakeChapaClient` (see config/chapa.ts).

export interface TransferInput {
  amount: number;
  currency: "ETB";
  /** Recipient's Telebirr number, as verified via Slice 4a. */
  accountNumber: string;
  /** Our idempotency key — the Payment id. Echoed back by the webhook. */
  reference: string;
  beneficiaryName: string;
}

export interface CheckoutInput {
  amount: number;
  currency: "ETB";
  /** Our idempotency key — the Payment id. Echoed back by the webhook as `tx_ref`. */
  reference: string;
  /** Payer details Chapa shows on the hosted checkout page. */
  payerName: string;
  payerPhone: string;
  /** Where Chapa sends the payer after checkout (not the webhook). */
  returnUrl: string;
}

export interface ChapaClient {
  /** Collection hop: opens a hosted checkout the payer pays into. */
  initiateCheckout(input: CheckoutInput): Promise<{ checkoutUrl: string }>;
  /** Transfer hop: pushes funds from BuryMe's merchant balance to a Telebirr number. */
  initiateTransfer(input: TransferInput): Promise<{ transferId: string }>;
  verifyWebhookSignature(rawBody: Buffer, signature: string | undefined): boolean;
}

export class ChapaGatewayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChapaGatewayError";
  }
}

// Chapa's bank code for Telebirr on the transfers API. Their bank list is
// dynamic (`GET /v1/banks`); this is the documented id at time of writing —
// confirm against that list when going live.
const TELEBIRR_BANK_CODE = 855;

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
          "customization[title]": "BuryMe",
        }),
      });
    } catch {
      throw new ChapaGatewayError("Chapa unreachable");
    }
    let payload: { status?: unknown; data?: { checkout_url?: unknown } } = {};
    try {
      payload = (await response.json()) as typeof payload;
    } catch {
      /* non-JSON body: treated as failure below */
    }
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
          account_number: input.accountNumber,
          amount: input.amount.toFixed(2),
          currency: input.currency,
          reference: input.reference,
          bank_code: TELEBIRR_BANK_CODE,
        }),
      });
    } catch {
      throw new ChapaGatewayError("Chapa unreachable");
    }
    // Response bodies are never logged — they can carry account details.
    let payload: { status?: unknown; data?: unknown } = {};
    try {
      payload = (await response.json()) as typeof payload;
    } catch {
      /* non-JSON body: treated as failure below */
    }
    if (!response.ok || payload.status !== "success") {
      throw new ChapaGatewayError(`Chapa rejected the transfer (HTTP ${response.status})`);
    }
    // Chapa returns the transfer reference in `data` (a string id).
    const transferId = typeof payload.data === "string" ? payload.data : input.reference;
    return { transferId };
  }

  // Chapa signs webhooks with HMAC-SHA256 of the raw body using the
  // account's webhook secret, sent as the `x-chapa-signature` header
  // (some accounts also receive `Chapa-Signature`; both carry the same
  // digest). Compared in constant time.
  verifyWebhookSignature(rawBody: Buffer, signature: string | undefined): boolean {
    if (!signature) return false;
    const expected = createHmac("sha256", this.webhookSecret).update(rawBody).digest("hex");
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(signature.trim().toLowerCase(), "utf8");
    return a.length === b.length && timingSafeEqual(a, b);
  }
}

// Keyless dev/test double: every transfer "succeeds" instantly with a
// synthetic id and every webhook signature is accepted, so the whole
// Pending Disbursement → Active flow can be exercised locally by posting
// a fake transfer event to the webhook route.
export class FakeChapaClient implements ChapaClient {
  async initiateCheckout(input: CheckoutInput): Promise<{ checkoutUrl: string }> {
    // Points at the app's own return URL so a dev can "complete" checkout
    // by posting a fake event to the checkout webhook, then landing back.
    return { checkoutUrl: `${input.returnUrl}?fake_checkout=${input.reference}` };
  }

  async initiateTransfer(input: TransferInput): Promise<{ transferId: string }> {
    return { transferId: `fake-transfer-${input.reference}` };
  }

  verifyWebhookSignature(): boolean {
    return true;
  }
}
