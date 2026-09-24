import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config/firebase.js", () => ({
  auth: { verifyIdToken: vi.fn() },
}));
vi.mock("../db/client.js", () => ({
  prisma: {
    obligation: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    request: { create: vi.fn(), findUnique: vi.fn() },
    telebirrAccount: { findUnique: vi.fn() },
    payment: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    repaymentSchedule: { findUnique: vi.fn(), create: vi.fn(), findUniqueOrThrow: vi.fn() },
    installment: { updateMany: vi.fn() },
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
    originatingExpenseId: null,
    originatingExpense: null,
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

  // The FK points at the participant's share row; the contract field names
  // the expense, so the serializer has to read through it.
  it("reports the expense id, not the share row id, for a spawned obligation", async () => {
    vi.mocked(prisma.obligation.findFirst).mockResolvedValue(
      baseObligation({
        originatingExpenseId: "gep-1",
        originatingExpense: { expenseId: "exp-1" },
      }) as never,
    );
    const res = await request(app).get("/api/v1/obligations/obl-1").set(LENDER_AUTH);
    expect(res.status).toBe(200);
    expect(res.body.originating_expense_id).toBe("exp-1");
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

describe("GET /obligations/:id/payments", () => {
  it("lists a party's payments newest first", async () => {
    vi.mocked(prisma.obligation.findFirst).mockResolvedValue(baseObligation() as never);
    vi.mocked(prisma.payment.findMany).mockResolvedValue([
      {
        id: "pay-2",
        obligationId: "obl-1",
        installmentId: null,
        payerId: borrower.id,
        recipientId: lender.id,
        amount: { toNumber: () => 500 },
        paymentDirection: "Repayment",
        paymentMethod: "External",
        recordedByUserId: lender.id,
        externalMethodNote: "Cash",
        chapaTransactionId: null,
        checkoutUrl: null,
        status: "PendingAcknowledgement",
        recordedAt: new Date("2026-09-10T00:00:00.000Z"),
        confirmedAt: null,
        payer: borrower,
        recipient: lender,
      },
    ] as never);
    const res = await request(app).get("/api/v1/obligations/obl-1/payments").set(BORROWER_AUTH);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      payment_id: "pay-2",
      payment_method: "External",
      external_method_note: "Cash",
      status: "Pending Acknowledgement",
    });
    expect(prisma.payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { recordedAt: "desc" } }),
    );
  });
});

describe("POST /obligations/:id/payments/chapa (repayment)", () => {
  const lenderTelebirr = {
    userId: lender.id,
    telebirrNumber: "0922222222",
    verificationStatus: "Verified",
  };
  const created = {
    id: "pay-3",
    obligationId: "obl-1",
    installmentId: null,
    payerId: borrower.id,
    recipientId: lender.id,
    amount: { toNumber: () => 500 },
    paymentDirection: "Repayment",
    paymentMethod: "Chapa",
    recordedByUserId: null,
    externalMethodNote: null,
    chapaTransactionId: null,
    checkoutUrl: null,
    status: "PendingAcknowledgement",
    recordedAt: new Date("2026-09-16T00:00:00.000Z"),
    confirmedAt: null,
    payer: borrower,
    recipient: lender,
  };

  it("rejects the lender", async () => {
    vi.mocked(prisma.obligation.findFirst).mockResolvedValue(baseObligation() as never);
    const res = await request(app)
      .post("/api/v1/obligations/obl-1/payments/chapa")
      .set(LENDER_AUTH)
      .send({});
    expect(res.status).toBe(403);
  });

  it("requires an installment_id on an Installments obligation", async () => {
    vi.mocked(prisma.obligation.findFirst).mockResolvedValue(
      baseObligation({ repaymentType: "Installments" }) as never,
    );
    const res = await request(app)
      .post("/api/v1/obligations/obl-1/payments/chapa")
      .set(BORROWER_AUTH)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: "VALIDATION_ERROR", field: "installment_id" });
  });

  it("rejects a settled obligation", async () => {
    vi.mocked(prisma.obligation.findFirst).mockResolvedValue(
      baseObligation({ status: "Settled" }) as never,
    );
    const res = await request(app)
      .post("/api/v1/obligations/obl-1/payments/chapa")
      .set(BORROWER_AUTH)
      .send({});
    expect(res.status).toBe(409);
  });

  it("rejects when the lender has no verified Telebirr to receive it", async () => {
    vi.mocked(prisma.obligation.findFirst).mockResolvedValue(baseObligation() as never);
    vi.mocked(prisma.payment.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.telebirrAccount.findUnique).mockResolvedValue({
      ...lenderTelebirr,
      verificationStatus: "Unverified",
    } as never);
    const res = await request(app)
      .post("/api/v1/obligations/obl-1/payments/chapa")
      .set(BORROWER_AUTH)
      .send({});
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("RECIPIENT_UNVERIFIED");
  });

  it("opens the borrower's checkout for the full outstanding balance", async () => {
    vi.mocked(prisma.obligation.findFirst).mockResolvedValue(baseObligation() as never);
    vi.mocked(prisma.payment.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.telebirrAccount.findUnique).mockResolvedValue(lenderTelebirr as never);
    vi.mocked(prisma.payment.create).mockResolvedValue(created as never);
    vi.mocked(prisma.payment.update).mockResolvedValue({
      ...created,
      checkoutUrl: "https://checkout.chapa.co/r",
    } as never);
    chapa.initiateCheckout.mockResolvedValueOnce({ checkoutUrl: "https://checkout.chapa.co/r" });

    const res = await request(app)
      .post("/api/v1/obligations/obl-1/payments/chapa")
      .set(BORROWER_AUTH)
      .send({});
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      payment_direction: "Repayment",
      payer: { user_id: borrower.id },
      recipient: { user_id: lender.id },
      checkout_url: "https://checkout.chapa.co/r",
    });
    // Amount is the outstanding balance (500), never the principal.
    const { data } = vi.mocked(prisma.payment.create).mock.calls[0]![0] as {
      data: { amount: { toNumber(): number }; paymentDirection: string };
    };
    expect(data.amount.toNumber()).toBe(500);
    expect(data.paymentDirection).toBe("Repayment");
    expect(chapa.initiateCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 500, payerPhone: borrower.identifier }),
    );
  });
});

describe("POST /obligations/:id/payments/external", () => {
  const body = {
    payment_direction: "Repayment",
    payment_date: "2026-09-10",
    external_method_note: "Cash",
    note: "Paid at the office",
  };

  it("validates the body", async () => {
    vi.mocked(prisma.obligation.findFirst).mockResolvedValue(baseObligation() as never);
    const res = await request(app)
      .post("/api/v1/obligations/obl-1/payments/external")
      .set(LENDER_AUTH)
      .send({ ...body, external_method_note: "Gold" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a future payment date", async () => {
    vi.mocked(prisma.obligation.findFirst).mockResolvedValue(baseObligation() as never);
    vi.mocked(prisma.payment.findFirst).mockResolvedValue(null);
    const res = await request(app)
      .post("/api/v1/obligations/obl-1/payments/external")
      .set(LENDER_AUTH)
      .send({ ...body, payment_date: "2099-01-01" });
    expect(res.status).toBe(400);
    expect(res.body.error.field).toBe("payment_date");
  });

  it("lets either party record; the row is payer → recipient by direction", async () => {
    vi.mocked(prisma.obligation.findFirst).mockResolvedValue(baseObligation() as never);
    vi.mocked(prisma.payment.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.payment.create).mockImplementation((async (args: {
      data: Record<string, unknown>;
    }) => ({
      id: "pay-4",
      installmentId: null,
      chapaTransactionId: null,
      checkoutUrl: null,
      confirmedAt: null,
      ...args.data,
      amount: { toNumber: () => 500 },
      payer: borrower,
      recipient: lender,
    })) as never);

    const res = await request(app)
      .post("/api/v1/obligations/obl-1/payments/external")
      .set(LENDER_AUTH)
      .send(body);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      payment_method: "External",
      status: "Pending Acknowledgement",
      recorded_by_user_id: lender.id,
      external_method_note: "Cash",
      payer: { user_id: borrower.id },
      recipient: { user_id: lender.id },
    });
    expect(prisma.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          payerId: borrower.id,
          recipientId: lender.id,
          recordedByUserId: lender.id,
          recordedAt: new Date("2026-09-10T00:00:00.000Z"),
        }),
      }),
    );
  });
});

// ── Schedules (Slice 6) ─────────────────────────────────────────────

function scheduleWith(installments: Record<string, unknown>[]) {
  return {
    id: "sch-1",
    obligationId: "obl-1",
    installmentCount: installments.length,
    status: "Active",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    installments: installments.map((i, n) => ({
      id: `inst-${n + 1}`,
      scheduleId: "sch-1",
      amount: { toNumber: () => 500 },
      dueDate: new Date("2026-10-01"),
      status: "Pending",
      paidAt: null,
      ...i,
    })),
  };
}

describe("GET /obligations/:id/schedule", () => {
  it("404s for a Lump Sum obligation", async () => {
    vi.mocked(prisma.obligation.findFirst).mockResolvedValue(baseObligation() as never);
    const res = await request(app).get("/api/v1/obligations/obl-1/schedule").set(LENDER_AUTH);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("refreshes overdue rows and returns the schedule", async () => {
    vi.mocked(prisma.obligation.findFirst).mockResolvedValue(
      baseObligation({ repaymentType: "Installments" }) as never,
    );
    const schedule = scheduleWith([{ status: "Overdue", dueDate: new Date("2020-01-01") }, {}]);
    vi.mocked(prisma.repaymentSchedule.findUnique).mockResolvedValue(schedule as never);
    vi.mocked(prisma.repaymentSchedule.findUniqueOrThrow).mockResolvedValue(schedule as never);

    const res = await request(app).get("/api/v1/obligations/obl-1/schedule").set(BORROWER_AUTH);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      schedule_id: "sch-1",
      installment_count: 2,
      status: "Active",
      installments: [
        { installment_id: "inst-1", status: "Overdue", due_date: "2020-01-01" },
        { installment_id: "inst-2", status: "Pending" },
      ],
    });
    expect(prisma.installment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ scheduleId: "sch-1", status: "Pending" }),
        data: { status: "Overdue" },
      }),
    );
  });

  it("backfills a schedule from the originating request when none exists", async () => {
    vi.mocked(prisma.obligation.findFirst).mockResolvedValue(
      baseObligation({ repaymentType: "Installments", originatingRequestId: "req-1" }) as never,
    );
    vi.mocked(prisma.repaymentSchedule.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.request.findUnique).mockResolvedValue({
      id: "req-1",
      counterProposal: null,
      proposedSchedule: {
        installments: [
          { amount: { amount: 500, currency: "ETB" }, due_date: "2026-10-01" },
          { amount: { amount: 500, currency: "ETB" }, due_date: "2026-11-01" },
        ],
      },
    } as never);
    const created = scheduleWith([{}, { id: "inst-2", dueDate: new Date("2026-11-01") }]);
    vi.mocked(prisma.repaymentSchedule.create).mockResolvedValue(created as never);
    vi.mocked(prisma.repaymentSchedule.findUniqueOrThrow).mockResolvedValue(created as never);

    const res = await request(app).get("/api/v1/obligations/obl-1/schedule").set(BORROWER_AUTH);
    expect(res.status).toBe(200);
    expect(prisma.repaymentSchedule.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          obligationId: "obl-1",
          installmentCount: 2,
          installments: { create: expect.arrayContaining([expect.objectContaining({ amount: 500 })]) },
        }),
      }),
    );
  });
});

describe("Installments payments", () => {
  const installmentsObligation = () =>
    baseObligation({ repaymentType: "Installments", outstandingBalance: { toNumber: () => 1000 } });
  const lenderTelebirr = {
    userId: lender.id,
    telebirrNumber: "0922222222",
    verificationStatus: "Verified",
  };

  beforeEach(() => {
    const schedule = scheduleWith([{ status: "Overdue" }, {}]);
    vi.mocked(prisma.repaymentSchedule.findUnique).mockResolvedValue(schedule as never);
    vi.mocked(prisma.repaymentSchedule.findUniqueOrThrow).mockResolvedValue(schedule as never);
    vi.mocked(prisma.telebirrAccount.findUnique).mockResolvedValue(lenderTelebirr as never);
    vi.mocked(prisma.payment.findFirst).mockResolvedValue(null);
  });

  it("404s an installment that is not on this obligation", async () => {
    vi.mocked(prisma.obligation.findFirst).mockResolvedValue(installmentsObligation() as never);
    const res = await request(app)
      .post("/api/v1/obligations/obl-1/payments/chapa")
      .set(BORROWER_AUTH)
      .send({ installment_id: "inst-99" });
    expect(res.status).toBe(404);
  });

  it("refuses a paid installment", async () => {
    vi.mocked(prisma.obligation.findFirst).mockResolvedValue(installmentsObligation() as never);
    const paid = scheduleWith([{ status: "Paid" }, {}]);
    vi.mocked(prisma.repaymentSchedule.findUnique).mockResolvedValue(paid as never);
    vi.mocked(prisma.repaymentSchedule.findUniqueOrThrow).mockResolvedValue(paid as never);
    const res = await request(app)
      .post("/api/v1/obligations/obl-1/payments/chapa")
      .set(BORROWER_AUTH)
      .send({ installment_id: "inst-1" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("STATUS_CONFLICT");
  });

  it("creates a Chapa payment for exactly the installment amount", async () => {
    vi.mocked(prisma.obligation.findFirst).mockResolvedValue(installmentsObligation() as never);
    const created = {
      id: "pay-5",
      obligationId: "obl-1",
      installmentId: "inst-1",
      payerId: borrower.id,
      recipientId: lender.id,
      amount: { toNumber: () => 500 },
      paymentDirection: "Repayment",
      paymentMethod: "Chapa",
      recordedByUserId: null,
      externalMethodNote: null,
      chapaTransactionId: null,
      checkoutUrl: null,
      status: "PendingAcknowledgement",
      recordedAt: new Date("2026-09-19T00:00:00.000Z"),
      confirmedAt: null,
      payer: borrower,
      recipient: lender,
    };
    vi.mocked(prisma.payment.create).mockResolvedValue(created as never);
    vi.mocked(prisma.payment.update).mockResolvedValue({ ...created, checkoutUrl: "u" } as never);
    chapa.initiateCheckout.mockResolvedValueOnce({ checkoutUrl: "u" });

    const res = await request(app)
      .post("/api/v1/obligations/obl-1/payments/chapa")
      .set(BORROWER_AUTH)
      .send({ installment_id: "inst-1" });
    expect(res.status).toBe(201);
    expect(res.body.installment_id).toBe("inst-1");
    const { data } = vi.mocked(prisma.payment.create).mock.calls[0]![0] as {
      data: { amount: { toNumber(): number }; installmentId: string };
    };
    expect(data.amount.toNumber()).toBe(500);
    expect(data.installmentId).toBe("inst-1");
    // The in-flight check is per installment.
    expect(prisma.payment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ installmentId: "inst-1" }) }),
    );
  });

  it("lets the lender request repayment of an Overdue installment only", async () => {
    vi.mocked(prisma.obligation.findFirst).mockResolvedValue(installmentsObligation() as never);
    vi.mocked(prisma.request.create).mockImplementation(
      (async (args: { data: Record<string, unknown> }) => ({
        id: "req-9",
        ...args.data,
        amount: { toNumber: () => 500 },
        proposedSchedule: null,
        counterProposal: null,
        proposedRepaymentType: null,
        proposedDueDate: null,
        disbursementMethod: null,
        purpose: null,
        createdAt: new Date("2026-09-19T00:00:00.000Z"),
        respondedAt: null,
        initiatingUser: lender,
        receivingUser: borrower,
      })) as never,
    );

    const pending = await request(app)
      .post("/api/v1/obligations/obl-1/repayment-requests")
      .set(LENDER_AUTH)
      .send({ installment_id: "inst-2" });
    expect(pending.status).toBe(409);

    const overdue = await request(app)
      .post("/api/v1/obligations/obl-1/repayment-requests")
      .set(LENDER_AUTH)
      .send({ installment_id: "inst-1" });
    expect(overdue.status).toBe(201);
    expect(prisma.request.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ installmentId: "inst-1" }),
      }),
    );
  });
});
