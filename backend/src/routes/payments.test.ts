import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config/firebase.js", () => ({
  auth: { verifyIdToken: vi.fn() },
}));
vi.mock("../db/client.js", () => ({
  prisma: {
    payment: { findUnique: vi.fn(), update: vi.fn() },
    // Read by the push path when a notification fires.
    user: { findUnique: vi.fn() },
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
    installment: { findUnique: vi.fn(), count: vi.fn(), update: vi.fn() },
    repaymentSchedule: { update: vi.fn() },
    $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops)),
  },
}));
vi.mock("../config/chapa.js", () => ({
  getChapaClient: () => ({}),
  chapaReturnUrl: (path: string) => `http://web${path}`,
  chapaCallbackUrl: () => undefined,
}));

const { app } = await import("../app.js");
const { auth } = await import("../config/firebase.js");
const { prisma } = await import("../db/client.js");
const { Prisma } = await import("../generated/prisma/client.js");

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
  ...lender,
  id: "borrower-1",
  identifier: "+251900000002",
  displayName: "Borrower",
};

function activeObligation(overrides: Record<string, unknown> = {}) {
  return {
    id: "obl-1",
    borrowerId: borrower.id,
    lenderId: lender.id,
    principalAmount: new Prisma.Decimal(1000),
    outstandingBalance: new Prisma.Decimal(1000),
    repaymentType: "LumpSum",
    status: "Active",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    settledAt: null,
    ...overrides,
  };
}

// An external repayment recorded by the lender ("I received cash"), so the
// borrower is the one who must respond.
function pendingExternal(overrides: Record<string, unknown> = {}) {
  return {
    id: "pay-1",
    obligationId: "obl-1",
    installmentId: null,
    payerId: borrower.id,
    recipientId: lender.id,
    amount: new Prisma.Decimal(1000),
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
    obligation: activeObligation(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth.verifyIdToken).mockImplementation(async (token: string) =>
    token === "lender-token"
      ? ({ uid: lender.id, phone_number: lender.identifier } as never)
      : ({ uid: borrower.id, phone_number: borrower.identifier } as never),
  );
  // Echo the update back as the "confirmed" row.
  vi.mocked(prisma.payment.update).mockImplementation((async (args: {
    data: Record<string, unknown>;
  }) => ({
    ...pendingExternal(),
    ...args.data,
  })) as never);
});

describe("POST /payments/:id/acknowledge", () => {
  it("404s for a non-party", async () => {
    vi.mocked(prisma.payment.findUnique).mockResolvedValue({
      ...pendingExternal(),
      payerId: "someone-else",
      recipientId: "another",
    } as never);
    const res = await request(app).post("/api/v1/payments/pay-1/acknowledge").set(LENDER_AUTH);
    expect(res.status).toBe(404);
  });

  it("refuses the party who recorded it", async () => {
    vi.mocked(prisma.payment.findUnique).mockResolvedValue(pendingExternal() as never);
    const res = await request(app).post("/api/v1/payments/pay-1/acknowledge").set(LENDER_AUTH);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("refuses a payment that is no longer pending", async () => {
    vi.mocked(prisma.payment.findUnique).mockResolvedValue(
      pendingExternal({ status: "Confirmed" }) as never,
    );
    const res = await request(app).post("/api/v1/payments/pay-1/acknowledge").set(BORROWER_AUTH);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("STATUS_CONFLICT");
  });

  it("refuses a Chapa payment", async () => {
    vi.mocked(prisma.payment.findUnique).mockResolvedValue(
      pendingExternal({ paymentMethod: "Chapa", recordedByUserId: null }) as never,
    );
    const res = await request(app).post("/api/v1/payments/pay-1/acknowledge").set(BORROWER_AUTH);
    expect(res.status).toBe(409);
  });

  it("confirms a full Lump Sum repayment and settles the obligation", async () => {
    vi.mocked(prisma.payment.findUnique).mockResolvedValue(pendingExternal() as never);
    const res = await request(app).post("/api/v1/payments/pay-1/acknowledge").set(BORROWER_AUTH);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("Confirmed");
    expect(prisma.obligation.update).toHaveBeenCalledTimes(1);
    const { data } = vi.mocked(prisma.obligation.update).mock.calls[0]![0] as {
      data: { outstandingBalance: InstanceType<typeof Prisma.Decimal>; status?: string };
    };
    expect(data.outstandingBalance.toNumber()).toBe(0);
    expect(data.status).toBe("Settled");

    // PAY-04 back to the lender who recorded it, then PAY-07 to both
    // parties. The settled read is what the notification path re-fetches
    // after the transaction, so it has to look settled.
    vi.mocked(prisma.obligation.findUnique).mockResolvedValue(
      activeObligation({
        status: "Settled",
        outstandingBalance: new Prisma.Decimal(0),
        borrower,
        lender,
      }) as never,
    );
    await vi.waitFor(() =>
      expect(vi.mocked(prisma.notification.create).mock.calls.length).toBeGreaterThanOrEqual(1),
    );
    const sent = vi
      .mocked(prisma.notification.create)
      .mock.calls.map((c) => (c[0] as { data: Record<string, unknown> }).data);
    expect(sent.find((d) => d.notificationType === "PAY-04")).toMatchObject({
      userId: lender.id,
      title: "Payment confirmed",
      body: "Borrower confirmed the 1,000 ETB external payment.",
    });
  });

  it("activates a Pending Disbursement obligation for an external disbursement", async () => {
    vi.mocked(prisma.payment.findUnique).mockResolvedValue(
      pendingExternal({
        paymentDirection: "Disbursement",
        payerId: lender.id,
        recipientId: borrower.id,
        recordedByUserId: lender.id,
        obligation: activeObligation({
          status: "PendingDisbursement",
          outstandingBalance: new Prisma.Decimal(0),
        }),
      }) as never,
    );
    const res = await request(app).post("/api/v1/payments/pay-1/acknowledge").set(BORROWER_AUTH);
    expect(res.status).toBe(200);
    expect(prisma.obligation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "Active" }) }),
    );
  });
});

describe("POST /payments/:id/dispute", () => {
  it("marks both the payment and the obligation Disputed", async () => {
    vi.mocked(prisma.payment.findUnique).mockResolvedValue(pendingExternal() as never);
    const res = await request(app).post("/api/v1/payments/pay-1/dispute").set(BORROWER_AUTH);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("Disputed");
    expect(prisma.obligation.update).toHaveBeenCalledWith({
      where: { id: "obl-1" },
      data: { status: "Disputed" },
    });
  });

  it("refuses the recorder", async () => {
    vi.mocked(prisma.payment.findUnique).mockResolvedValue(pendingExternal() as never);
    const res = await request(app).post("/api/v1/payments/pay-1/dispute").set(LENDER_AUTH);
    expect(res.status).toBe(403);
  });
});

describe("acknowledge — installments", () => {
  const installmentPayment = () =>
    pendingExternal({
      installmentId: "inst-1",
      amount: new Prisma.Decimal(500),
      obligation: activeObligation({
        repaymentType: "Installments",
        outstandingBalance: new Prisma.Decimal(1000),
      }),
    });

  beforeEach(() => {
    vi.mocked(prisma.installment.findUnique).mockResolvedValue({
      id: "inst-1",
      scheduleId: "sch-1",
      status: "Pending",
    } as never);
  });

  it("marks the installment Paid and the obligation Partially Paid while others remain", async () => {
    vi.mocked(prisma.payment.findUnique).mockResolvedValue(installmentPayment() as never);
    vi.mocked(prisma.installment.count).mockResolvedValue(1);

    const res = await request(app).post("/api/v1/payments/pay-1/acknowledge").set(BORROWER_AUTH);
    expect(res.status).toBe(200);
    expect(prisma.installment.update).toHaveBeenCalledWith({
      where: { id: "inst-1" },
      data: expect.objectContaining({ status: "Paid" }),
    });
    const { data } = vi.mocked(prisma.obligation.update).mock.calls[0]![0] as {
      data: { outstandingBalance: InstanceType<typeof Prisma.Decimal>; status: string };
    };
    expect(data.outstandingBalance.toNumber()).toBe(500);
    expect(data.status).toBe("PartiallyPaid");
    expect(prisma.repaymentSchedule.update).not.toHaveBeenCalled();
  });

  it("settles the obligation and completes the schedule on the last installment", async () => {
    vi.mocked(prisma.payment.findUnique).mockResolvedValue(installmentPayment() as never);
    vi.mocked(prisma.installment.count).mockResolvedValue(0);

    const res = await request(app).post("/api/v1/payments/pay-1/acknowledge").set(BORROWER_AUTH);
    expect(res.status).toBe(200);
    const { data } = vi.mocked(prisma.obligation.update).mock.calls[0]![0] as {
      data: { outstandingBalance: InstanceType<typeof Prisma.Decimal>; status: string };
    };
    expect(data.outstandingBalance.toNumber()).toBe(0);
    expect(data.status).toBe("Settled");
    expect(prisma.repaymentSchedule.update).toHaveBeenCalledWith({
      where: { id: "sch-1" },
      data: { status: "Completed" },
    });
  });
});
