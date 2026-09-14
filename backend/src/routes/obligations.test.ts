import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config/firebase.js", () => ({
  auth: { verifyIdToken: vi.fn() },
}));
vi.mock("../db/client.js", () => ({
  prisma: {
    obligation: { findFirst: vi.fn(), findMany: vi.fn() },
    request: { create: vi.fn() },
  },
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
