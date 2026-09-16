import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config/firebase.js", () => ({
  auth: { verifyIdToken: vi.fn() },
}));
vi.mock("../db/client.js", () => ({
  prisma: {
    obligation: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    request: { create: vi.fn() },
    telebirrAccount: { findUnique: vi.fn() },
    payment: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
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
}));

const { app } = await import("../app.js");
const { auth } = await import("../config/firebase.js");
const { prisma } = await import("../db/client.js");

const verifyIdToken = vi.mocked(auth.verifyIdToken);
const LENDER_AUTH = { Authorization: "Bearer lender-token" };
const BORROWER_AUTH = { Authorization: "Bearer borrower-token" };

const lender = {
  id: "lender-1",
  identifier: "+251900000001",
  displayName: "Lender",
  profilePhotoUrl: null,
  verificationStatus: "Verified",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};
const borrower = {
  id: "borrower-1",
  identifier: "+251900000002",
  displayName: "Borrower",
  profilePhotoUrl: null,
  verificationStatus: "Verified",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

function baseObligation(overrides: Record<string, unknown> = {}) {
  return {
    id: "obl-1",
    borrowerId: borrower.id,
    lenderId: lender.id,
    principalAmount: { toNumber: () => 1000 },
    outstandingBalance: { toNumber: () => 500 },
    purpose: "Rent",
    repaymentType: "LumpSum",
    disbursementMethod: "AlreadyGiven",
    dueDate: new Date("2020-01-01"),
    status: "Active",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    settledAt: null,
    originatingRequestId: null,
    borrower,
    lender,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  verifyIdToken.mockImplementation(async (token: string) =>
    token === "lender-token"
      ? ({ uid: lender.id, phone_number: lender.identifier } as never)
      : ({ uid: borrower.id, phone_number: borrower.identifier } as never),
  );
});

describe("GET /obligations/:id", () => {
  it("returns 404 for a non-party", async () => {
    vi.mocked(prisma.obligation.findFirst).mockResolvedValue(null);
    const res = await request(app).get("/api/v1/obligations/obl-1").set(LENDER_AUTH);
    expect(res.status).toBe(404);
  });

  it("returns the obligation for a party", async () => {
    vi.mocked(prisma.obligation.findFirst).mockResolvedValue(baseObligation() as never);
    const res = await request(app).get("/api/v1/obligations/obl-1").set(LENDER_AUTH);
    expect(res.status).toBe(200);
    expect(res.body.obligation_id).toBe("obl-1");
    expect(res.body.originating_expense_id).toBeNull();
  });
});

describe("POST /obligations/:id/repayment-requests", () => {
  it("rejects the borrower requesting their own repayment", async () => {
    vi.mocked(prisma.obligation.findFirst).mockResolvedValue(baseObligation() as never);
    const res = await request(app)
      .post("/api/v1/obligations/obl-1/repayment-requests")
      .set(BORROWER_AUTH)
      .send({});
    expect(res.status).toBe(400);
  });

  it("rejects an Installments obligation", async () => {
    vi.mocked(prisma.obligation.findFirst).mockResolvedValue(
      baseObligation({ repaymentType: "Installments" }) as never,
    );
    const res = await request(app)
      .post("/api/v1/obligations/obl-1/repayment-requests")
      .set(LENDER_AUTH)
      .send({});
    expect(res.status).toBe(400);
  });

  it("creates a repayment request when overdue", async () => {
    vi.mocked(prisma.obligation.findFirst).mockResolvedValue(baseObligation() as never);
    vi.mocked(prisma.request.create).mockResolvedValue({
      id: "req-1",
      requestType: "Repayment",
      initiatingUserId: lender.id,
      receivingUserId: borrower.id,
      obligationId: "obl-1",
      amount: { toNumber: () => 500 },
      purpose: null,
      proposedRepaymentType: null,
      proposedSchedule: null,
      proposedDueDate: null,
      disbursementMethod: null,
      counterProposal: null,
      status: "Pending",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      respondedAt: null,
      initiatingUser: lender,
      receivingUser: borrower,
    } as never);

    const res = await request(app)
      .post("/api/v1/obligations/obl-1/repayment-requests")
      .set(LENDER_AUTH)
      .send({});
    expect(res.status).toBe(201);
    expect(res.body.request_type).toBe("Repayment");
  });
});

describe("POST /obligations/:id/disburse", () => {
  const pending = () =>
    baseObligation({ status: "PendingDisbursement", disbursementMethod: "ThroughApp" });
  const verifiedTelebirr = {
    accountId: "acct-b",
    userId: borrower.id,
    telebirrNumber: "0911111111",
    verificationStatus: "Verified",
  };
  const createdPayment = {
    id: "pay-1",
    obligationId: "obl-1",
    installmentId: null,
    payerId: lender.id,
    recipientId: borrower.id,
    amount: { toNumber: () => 1000 },
    paymentDirection: "Disbursement",
    paymentMethod: "Chapa",
    recordedByUserId: null,
    externalMethodNote: null,
    chapaTransactionId: null,
    checkoutUrl: null,
    status: "PendingAcknowledgement",
    recordedAt: new Date("2026-09-16T00:00:00.000Z"),
    confirmedAt: null,
    payer: lender,
    recipient: borrower,
  };

  it("rejects the borrower", async () => {
    vi.mocked(prisma.obligation.findFirst).mockResolvedValue(pending() as never);
    const res = await request(app).post("/api/v1/obligations/obl-1/disburse").set(BORROWER_AUTH);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects an obligation that is not Pending Disbursement", async () => {
    vi.mocked(prisma.obligation.findFirst).mockResolvedValue(baseObligation() as never);
    const res = await request(app).post("/api/v1/obligations/obl-1/disburse").set(LENDER_AUTH);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("STATUS_CONFLICT");
  });

  it("rejects an unverified borrower before taking the lender's money", async () => {
    vi.mocked(prisma.obligation.findFirst).mockResolvedValue(pending() as never);
    vi.mocked(prisma.telebirrAccount.findUnique).mockResolvedValue({
      ...verifiedTelebirr,
      verificationStatus: "Unverified",
    } as never);
    const res = await request(app).post("/api/v1/obligations/obl-1/disburse").set(LENDER_AUTH);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("RECIPIENT_UNVERIFIED");
    expect(chapa.initiateCheckout).not.toHaveBeenCalled();
  });

  it("rejects a second disbursement while one is in flight", async () => {
    vi.mocked(prisma.obligation.findFirst).mockResolvedValue(pending() as never);
    vi.mocked(prisma.telebirrAccount.findUnique).mockResolvedValue(verifiedTelebirr as never);
    vi.mocked(prisma.payment.findFirst).mockResolvedValue({ id: "pay-0" } as never);
    const res = await request(app).post("/api/v1/obligations/obl-1/disburse").set(LENDER_AUTH);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("DUPLICATE_SUBMISSION");
  });

  it("marks the payment Failed and returns 502 when Chapa can't open checkout", async () => {
    vi.mocked(prisma.obligation.findFirst).mockResolvedValue(pending() as never);
    vi.mocked(prisma.telebirrAccount.findUnique).mockResolvedValue(verifiedTelebirr as never);
    vi.mocked(prisma.payment.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.payment.create).mockResolvedValue(createdPayment as never);
    chapa.initiateCheckout.mockRejectedValueOnce(new Error("down"));

    const res = await request(app).post("/api/v1/obligations/obl-1/disburse").set(LENDER_AUTH);
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe("PAYMENT_GATEWAY_ERROR");
    expect(prisma.payment.update).toHaveBeenCalledWith({
      where: { id: "pay-1" },
      data: { status: "Failed" },
    });
    expect(chapa.initiateTransfer).not.toHaveBeenCalled();
  });

  it("creates the payment and returns 201 with the lender's checkout URL", async () => {
    vi.mocked(prisma.obligation.findFirst).mockResolvedValue(pending() as never);
    vi.mocked(prisma.telebirrAccount.findUnique).mockResolvedValue(verifiedTelebirr as never);
    vi.mocked(prisma.payment.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.payment.create).mockResolvedValue(createdPayment as never);
    vi.mocked(prisma.payment.update).mockResolvedValue({
      ...createdPayment,
      checkoutUrl: "https://checkout.chapa.co/x",
    } as never);
    chapa.initiateCheckout.mockResolvedValueOnce({ checkoutUrl: "https://checkout.chapa.co/x" });

    const res = await request(app).post("/api/v1/obligations/obl-1/disburse").set(LENDER_AUTH);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      payment_id: "pay-1",
      payment_direction: "Disbursement",
      payment_method: "Chapa",
      status: "Pending Acknowledgement",
      checkout_url: "https://checkout.chapa.co/x",
      payer: { user_id: lender.id },
      recipient: { user_id: borrower.id },
    });

    // The lender pays in; nothing is transferred yet.
    expect(chapa.initiateCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 1000,
        currency: "ETB",
        reference: "pay-1",
        payerName: lender.displayName,
        payerPhone: lender.identifier,
      }),
    );
    expect(chapa.initiateTransfer).not.toHaveBeenCalled();
    expect(prisma.obligation.update).not.toHaveBeenCalled();
  });
});
