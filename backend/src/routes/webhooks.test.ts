import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config/firebase.js", () => ({
  auth: { verifyIdToken: vi.fn() },
}));
vi.mock("../db/client.js", () => ({
  prisma: {
    payment: { findUnique: vi.fn(), update: vi.fn() },
    // Notifications are raised as a side effect of most of these routes.
    // Mocked with a resolved row so the emit path runs to completion
    // instead of failing silently inside notify()'s catch.
    notification: {
      create: vi.fn().mockResolvedValue({
        id: "ntf-1",
        notificationType: "",
        title: "",
        body: "",
        isRead: false,
        createdAt: new Date("2026-09-28T00:00:00.000Z"),
        referenceId: null,
        referenceType: null,
      }),
      update: vi.fn(),
    },
    obligation: { update: vi.fn(), findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    telebirrAccount: { findUnique: vi.fn() },
    $transaction: vi.fn(async (ops: unknown[]) => ops),
  },
}));
const chapa = {
  initiateCheckout: vi.fn(),
  initiateTransfer: vi.fn(),
  verifyWebhookSignature: vi.fn(),
};
vi.mock("../config/chapa.js", () => ({
  getChapaClient: () => chapa,
  chapaReturnUrl: (path: string) => `http://web${path}`,
  chapaCallbackUrl: () => undefined,
}));

const { app } = await import("../app.js");
const { prisma } = await import("../db/client.js");

const CHECKOUT = "/api/v1/webhooks/chapa/checkout";
const TRANSFER = "/api/v1/webhooks/chapa/transfer";

const borrower = { id: "borrower-1", displayName: "Borrower" };
const lender = { id: "lender-1", displayName: "Lender" };

function pendingPayment(overrides: Record<string, unknown> = {}) {
  return {
    id: "pay-1",
    obligationId: "obl-1",
    payerId: lender.id,
    recipientId: borrower.id,
    amount: { toNumber: () => 1000 },
    paymentDirection: "Disbursement",
    status: "PendingAcknowledgement",
    chapaTransactionId: null,
    // Both parties are included on the notification path's re-read
    // (lib/notifications.ts), which quotes names and the post-payment
    // balance.
    payer: lender,
    recipient: borrower,
    obligation: {
      id: "obl-1",
      status: "PendingDisbursement",
      principalAmount: { toNumber: () => 1000 },
      outstandingBalance: { toNumber: () => 0 },
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  chapa.verifyWebhookSignature.mockReturnValue(true);
});

describe("POST /webhooks/chapa/checkout", () => {
  beforeEach(() => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(borrower as never);
    vi.mocked(prisma.telebirrAccount.findUnique).mockResolvedValue({
      userId: borrower.id,
      telebirrNumber: "0911111111",
      verificationStatus: "Verified",
    } as never);
  });

  it("returns 401 on a bad signature", async () => {
    chapa.verifyWebhookSignature.mockReturnValue(false);
    const res = await request(app).post(CHECKOUT).send({ tx_ref: "pay-1", status: "success" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("starts the transfer to the borrower once the lender's money lands", async () => {
    vi.mocked(prisma.payment.findUnique).mockResolvedValue(pendingPayment() as never);
    chapa.initiateTransfer.mockResolvedValueOnce({ transferId: "tx-1" });

    const res = await request(app).post(CHECKOUT).send({ tx_ref: "pay-1", status: "success" });
    expect(res.status).toBe(200);
    expect(chapa.initiateTransfer).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 1000,
        accountNumber: "0911111111",
        reference: "pay-1",
        beneficiaryName: "Borrower",
      }),
    );
    expect(prisma.payment.update).toHaveBeenCalledWith({
      where: { id: "pay-1" },
      data: { chapaTransactionId: "tx-1" },
    });
    // Still pending — only the transfer webhook confirms.
    expect(prisma.obligation.update).not.toHaveBeenCalled();
  });

  it("accepts Chapa's charge.success event shape", async () => {
    vi.mocked(prisma.payment.findUnique).mockResolvedValue(pendingPayment() as never);
    chapa.initiateTransfer.mockResolvedValueOnce({ transferId: "tx-1" });
    await request(app).post(CHECKOUT).send({ tx_ref: "pay-1", event: "charge.success" });
    expect(chapa.initiateTransfer).toHaveBeenCalled();
  });

  it("does not start a second transfer on a replayed event", async () => {
    vi.mocked(prisma.payment.findUnique).mockResolvedValue(
      pendingPayment({ chapaTransactionId: "tx-1" }) as never,
    );
    const res = await request(app).post(CHECKOUT).send({ tx_ref: "pay-1", status: "success" });
    expect(res.status).toBe(200);
    expect(chapa.initiateTransfer).not.toHaveBeenCalled();
  });

  it("marks the payment Failed when the checkout fails", async () => {
    vi.mocked(prisma.payment.findUnique).mockResolvedValue(pendingPayment() as never);
    await request(app).post(CHECKOUT).send({ tx_ref: "pay-1", status: "failed" });
    expect(prisma.payment.update).toHaveBeenCalledWith({
      where: { id: "pay-1" },
      data: { status: "Failed" },
    });
    expect(chapa.initiateTransfer).not.toHaveBeenCalled();
  });

  it("fails the payment instead of paying an unverified number", async () => {
    vi.mocked(prisma.payment.findUnique).mockResolvedValue(pendingPayment() as never);
    vi.mocked(prisma.telebirrAccount.findUnique).mockResolvedValue({
      userId: borrower.id,
      telebirrNumber: "0911111111",
      verificationStatus: "Unverified",
    } as never);
    await request(app).post(CHECKOUT).send({ tx_ref: "pay-1", status: "success" });
    expect(chapa.initiateTransfer).not.toHaveBeenCalled();
    expect(prisma.payment.update).toHaveBeenCalledWith({
      where: { id: "pay-1" },
      data: { status: "Failed" },
    });
  });

  it("marks the payment Failed when Chapa rejects the transfer", async () => {
    vi.mocked(prisma.payment.findUnique).mockResolvedValue(pendingPayment() as never);
    chapa.initiateTransfer.mockRejectedValueOnce(new Error("down"));
    const res = await request(app).post(CHECKOUT).send({ tx_ref: "pay-1", status: "success" });
    expect(res.status).toBe(200);
    expect(prisma.payment.update).toHaveBeenCalledWith({
      where: { id: "pay-1" },
      data: { status: "Failed" },
    });
  });
});

describe("POST /webhooks/chapa/transfer", () => {
  it("returns 401 on a bad signature and touches nothing", async () => {
    chapa.verifyWebhookSignature.mockReturnValue(false);
    const res = await request(app)
      .post(TRANSFER)
      .set("x-chapa-signature", "nope")
      .send({ reference: "pay-1", status: "success" });
    expect(res.status).toBe(401);
    expect(prisma.payment.findUnique).not.toHaveBeenCalled();
  });

  it("verifies the signature over the raw body", async () => {
    vi.mocked(prisma.payment.findUnique).mockResolvedValue(null);
    const body = '{"reference":"pay-1","status":"success"}';
    await request(app)
      .post(TRANSFER)
      .set("Content-Type", "application/json")
      .set("x-chapa-signature", "sig")
      .send(body);
    const [raw, sig] = chapa.verifyWebhookSignature.mock.calls[0]!;
    expect(Buffer.isBuffer(raw)).toBe(true);
    expect((raw as Buffer).toString()).toBe(body);
    expect(sig).toBe("sig");
  });

  it("acknowledges an unknown reference without changes", async () => {
    vi.mocked(prisma.payment.findUnique).mockResolvedValue(null);
    const res = await request(app).post(TRANSFER).send({ reference: "ghost", status: "success" });
    expect(res.status).toBe(200);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("is idempotent for an already-confirmed payment", async () => {
    vi.mocked(prisma.payment.findUnique).mockResolvedValue(
      pendingPayment({ status: "Confirmed" }) as never,
    );
    const res = await request(app).post(TRANSFER).send({ reference: "pay-1", status: "success" });
    expect(res.status).toBe(200);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("confirms the payment and activates the obligation with the full principal", async () => {
    vi.mocked(prisma.payment.findUnique).mockResolvedValue(pendingPayment() as never);
    const res = await request(app).post(TRANSFER).send({ reference: "pay-1", status: "success" });
    expect(res.status).toBe(200);
    expect(prisma.payment.update).toHaveBeenCalledWith({
      where: { id: "pay-1" },
      data: expect.objectContaining({ status: "Confirmed" }),
    });
    expect(prisma.obligation.update).toHaveBeenCalledWith({
      where: { id: "obl-1" },
      data: { status: "Active", outstandingBalance: expect.anything() },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);

    // LR-05 to both parties, each naming the lender who sent the funds.
    await vi.waitFor(() =>
      expect(vi.mocked(prisma.notification.create).mock.calls.length).toBeGreaterThanOrEqual(2),
    );
    const sent = vi
      .mocked(prisma.notification.create)
      .mock.calls.map((c) => (c[0] as { data: Record<string, unknown> }).data);
    expect(sent.map((d) => d.userId).sort()).toEqual([borrower.id, lender.id].sort());
    expect(sent[0]).toMatchObject({
      notificationType: "LR-05",
      title: "Funds sent — obligation active",
      body: "Lender sent 1,000 ETB. The obligation is now active.",
      referenceType: "Obligation",
      referenceId: "obl-1",
    });
  });

  it("accepts Chapa's payout.success event shape", async () => {
    vi.mocked(prisma.payment.findUnique).mockResolvedValue(pendingPayment() as never);
    await request(app).post(TRANSFER).send({ reference: "pay-1", event: "payout.success" });
    expect(prisma.obligation.update).toHaveBeenCalled();
  });

  it("marks a failed transfer Failed and leaves the obligation pending", async () => {
    vi.mocked(prisma.payment.findUnique).mockResolvedValue(pendingPayment() as never);
    await request(app).post(TRANSFER).send({ reference: "pay-1", status: "failed" });
    expect(prisma.payment.update).toHaveBeenCalledWith({
      where: { id: "pay-1" },
      data: { status: "Failed" },
    });
    expect(prisma.obligation.update).not.toHaveBeenCalled();
  });

  it("acknowledges a signed but malformed body", async () => {
    const res = await request(app)
      .post(TRANSFER)
      .set("Content-Type", "application/json")
      .send("not json");
    expect(res.status).toBe(200);
  });
});

describe("POST /webhooks/chapa/transfer — repayments", () => {
  it("reduces the balance and settles a Lump Sum obligation paid in full", async () => {
    const { Prisma } = await import("../generated/prisma/client.js");
    const repayment = pendingPayment({
      paymentDirection: "Repayment",
      amount: new Prisma.Decimal(1000),
      obligation: {
        id: "obl-1",
        status: "Active",
        repaymentType: "LumpSum",
        principalAmount: new Prisma.Decimal(1000),
        outstandingBalance: new Prisma.Decimal(1000),
      },
    });
    // The handler looks the payment up first, then the notification path
    // re-reads it after the transaction has committed — so the second read
    // must show the post-payment balance, which is what PAY-01/PAY-02
    // quote.
    vi.mocked(prisma.payment.findUnique)
      .mockResolvedValueOnce(repayment as never)
      .mockResolvedValue({
        ...repayment,
        obligation: { ...repayment.obligation, outstandingBalance: new Prisma.Decimal(0) },
      } as never);
    const res = await request(app).post(TRANSFER).send({ reference: "pay-1", status: "success" });
    expect(res.status).toBe(200);
    const { data } = vi.mocked(prisma.obligation.update).mock.calls[0]![0] as {
      data: { outstandingBalance: { toNumber(): number }; status?: string };
    };
    expect(data.outstandingBalance.toNumber()).toBe(0);
    expect(data.status).toBe("Settled");

    // A repayment splits: PAY-01 to the payer, PAY-02 to the recipient,
    // both quoting the balance AFTER the payment.
    await vi.waitFor(() =>
      expect(vi.mocked(prisma.notification.create).mock.calls.length).toBeGreaterThanOrEqual(2),
    );
    const sent = vi
      .mocked(prisma.notification.create)
      .mock.calls.map((c) => (c[0] as { data: Record<string, unknown> }).data);

    expect(sent.find((d) => d.notificationType === "PAY-01")).toMatchObject({
      userId: lender.id,
      title: "Payment Sent",
    });
    expect(sent.find((d) => d.notificationType === "PAY-02")).toMatchObject({
      userId: borrower.id,
      title: "Payment Received",
      body: "Lender made a payment of 1,000 ETB. 0 ETB remaining.",
    });
  });
});

describe("POST /webhooks/chapa — single dashboard URL", () => {
  const INGRESS = "/api/v1/webhooks/chapa";

  beforeEach(() => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(borrower as never);
    vi.mocked(prisma.telebirrAccount.findUnique).mockResolvedValue({
      userId: borrower.id,
      telebirrNumber: "0911111111",
      verificationStatus: "Verified",
    } as never);
  });

  it("rejects a bad signature", async () => {
    chapa.verifyWebhookSignature.mockReturnValue(false);
    const res = await request(app).post(INGRESS).send({ tx_ref: "pay-1", status: "success" });
    expect(res.status).toBe(401);
  });

  it("routes a charge event to the checkout handler", async () => {
    vi.mocked(prisma.payment.findUnique).mockResolvedValue(pendingPayment() as never);
    chapa.initiateTransfer.mockResolvedValueOnce({ transferId: "tx-1" });
    const res = await request(app)
      .post(INGRESS)
      .send({ event: "charge.success", tx_ref: "pay-1", status: "success" });
    expect(res.status).toBe(200);
    expect(chapa.initiateTransfer).toHaveBeenCalled();
    expect(prisma.obligation.update).not.toHaveBeenCalled();
  });

  it("routes a payout event to the transfer handler", async () => {
    vi.mocked(prisma.payment.findUnique).mockResolvedValue(pendingPayment() as never);
    const res = await request(app)
      .post(INGRESS)
      .send({ event: "payout.success", reference: "pay-1", status: "success" });
    expect(res.status).toBe(200);
    expect(prisma.obligation.update).toHaveBeenCalled();
    expect(chapa.initiateTransfer).not.toHaveBeenCalled();
  });

  it("falls back to the id field when no event name is given", async () => {
    vi.mocked(prisma.payment.findUnique).mockResolvedValue(pendingPayment() as never);
    await request(app).post(INGRESS).send({ reference: "pay-1", status: "success" });
    expect(prisma.obligation.update).toHaveBeenCalled();
  });

  it("acknowledges an unrecognisable but signed event", async () => {
    const res = await request(app).post(INGRESS).send({ hello: "world" });
    expect(res.status).toBe(200);
    expect(prisma.payment.findUnique).not.toHaveBeenCalled();
  });
});
