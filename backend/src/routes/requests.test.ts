import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config/firebase.js", () => ({
  auth: { verifyIdToken: vi.fn() },
}));
vi.mock("../db/client.js", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    request: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    obligation: { findUnique: vi.fn(), create: vi.fn() },
    $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  },
}));

const { app } = await import("../app.js");
const { auth } = await import("../config/firebase.js");
const { prisma } = await import("../db/client.js");

const verifyIdToken = vi.mocked(auth.verifyIdToken);
const AUTH_HEADER = { Authorization: "Bearer test-token" };
const OTHER_AUTH_HEADER = { Authorization: "Bearer other-token" };

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

function pendingBorrowRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: "req-1",
    requestType: "Borrow",
    initiatingUserId: borrower.id,
    receivingUserId: lender.id,
    obligationId: null,
    amount: { toNumber: () => 1000 },
    purpose: "Rent",
    proposedRepaymentType: "LumpSum",
    proposedSchedule: null,
    proposedDueDate: new Date("2026-12-01"),
    disbursementMethod: null,
    counterProposal: null,
    installmentId: null,
    note: null,
    status: "Pending",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    respondedAt: null,
    initiatingUser: borrower,
    receivingUser: lender,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  verifyIdToken.mockImplementation(async (token: string) =>
    token === "test-token"
      ? ({ uid: borrower.id, phone_number: borrower.identifier } as never)
      : ({ uid: lender.id, phone_number: lender.identifier } as never),
  );
});

describe("POST /requests (Borrow/Lend)", () => {
  it("rejects self-targeting", async () => {
    const res = await request(app)
      .post("/api/v1/requests")
      .set(AUTH_HEADER)
      .send({
        request_type: "Borrow",
        recipient_user_id: borrower.id,
        amount: { amount: 1000, currency: "ETB" },
        purpose: "Rent",
        proposed_repayment_type: "Lump Sum",
        proposed_due_date: "2026-12-01",
      });
    expect(res.status).toBe(400);
    expect(res.body.error.field).toBe("recipient_user_id");
  });

  it("rejects a duplicate open request in the same direction", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(lender as never);
    vi.mocked(prisma.request.findFirst).mockResolvedValue(pendingBorrowRequest() as never);

    const res = await request(app)
      .post("/api/v1/requests")
      .set(AUTH_HEADER)
      .send({
        request_type: "Borrow",
        recipient_user_id: lender.id,
        amount: { amount: 1000, currency: "ETB" },
        purpose: "Rent",
        proposed_repayment_type: "Lump Sum",
        proposed_due_date: "2026-12-01",
      });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("DUPLICATE_SUBMISSION");
  });

  it("creates a Borrow request", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(lender as never);
    vi.mocked(prisma.request.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.request.create).mockResolvedValue(pendingBorrowRequest() as never);

    const res = await request(app)
      .post("/api/v1/requests")
      .set(AUTH_HEADER)
      .send({
        request_type: "Borrow",
        recipient_user_id: lender.id,
        amount: { amount: 1000, currency: "ETB" },
        purpose: "Rent",
        proposed_repayment_type: "Lump Sum",
        proposed_due_date: "2026-12-01",
      });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("Pending");
  });
});

describe("POST /requests/:id/counter", () => {
  it("rejects a counter from the initiator (not the recipient)", async () => {
    vi.mocked(prisma.request.findFirst).mockResolvedValue(pendingBorrowRequest() as never);
    const res = await request(app)
      .post("/api/v1/requests/req-1/counter")
      .set(AUTH_HEADER) // borrower = initiator
      .send({ amount: { amount: 900, currency: "ETB" } });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("STATUS_CONFLICT");
  });

  it("allows the recipient to counter once, moving to Countered", async () => {
    vi.mocked(prisma.request.findFirst).mockResolvedValue(pendingBorrowRequest() as never);
    vi.mocked(prisma.request.update).mockResolvedValue(
      pendingBorrowRequest({
        status: "Countered",
        counterProposal: { amount: { amount: 900 } },
      }) as never,
    );
    const res = await request(app)
      .post("/api/v1/requests/req-1/counter")
      .set(OTHER_AUTH_HEADER) // lender = receiving user
      .send({ amount: { amount: 900, currency: "ETB" } });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("Countered");
  });

  it("rejects an empty counter body", async () => {
    vi.mocked(prisma.request.findFirst).mockResolvedValue(pendingBorrowRequest() as never);
    const res = await request(app)
      .post("/api/v1/requests/req-1/counter")
      .set(OTHER_AUTH_HEADER)
      .send({});
    expect(res.status).toBe(400);
  });
});

describe("POST /requests/:id/accept", () => {
  it("requires disbursement_method for a Borrow accept", async () => {
    vi.mocked(prisma.request.findFirst).mockResolvedValue(pendingBorrowRequest() as never);
    const res = await request(app)
      .post("/api/v1/requests/req-1/accept")
      .set(OTHER_AUTH_HEADER)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error.field).toBe("disbursement_method");
  });

  it("rejects accept from the wrong actor after a counter", async () => {
    vi.mocked(prisma.request.findFirst).mockResolvedValue(
      pendingBorrowRequest({ status: "Countered" }) as never,
    );
    // lender countered; only the original initiator (borrower) may accept now
    const res = await request(app)
      .post("/api/v1/requests/req-1/accept")
      .set(OTHER_AUTH_HEADER)
      .send({ disbursement_method: "Already Given" });
    expect(res.status).toBe(409);
  });

  it("creates an Active obligation for Already Given", async () => {
    vi.mocked(prisma.request.findFirst).mockResolvedValue(pendingBorrowRequest() as never);
    vi.mocked(prisma.request.update).mockResolvedValue(
      pendingBorrowRequest({ status: "Accepted" }) as never,
    );
    vi.mocked(prisma.obligation.create).mockResolvedValue({
      id: "obl-1",
      status: "Active",
    } as never);

    const res = await request(app)
      .post("/api/v1/requests/req-1/accept")
      .set(OTHER_AUTH_HEADER) // lender = receiving user, Pending state
      .send({ disbursement_method: "Already Given" });
    expect(res.status).toBe(200);
    expect(prisma.obligation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "Active", disbursementMethod: "AlreadyGiven" }),
      }),
    );
  });

  it("creates a Pending Disbursement obligation for Through App", async () => {
    vi.mocked(prisma.request.findFirst).mockResolvedValue(pendingBorrowRequest() as never);
    vi.mocked(prisma.request.update).mockResolvedValue(
      pendingBorrowRequest({ status: "Accepted" }) as never,
    );
    vi.mocked(prisma.obligation.create).mockResolvedValue({ id: "obl-1" } as never);

    const res = await request(app)
      .post("/api/v1/requests/req-1/accept")
      .set(OTHER_AUTH_HEADER)
      .send({ disbursement_method: "Through App" });
    expect(res.status).toBe(200);
    expect(prisma.obligation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "PendingDisbursement", outstandingBalance: 0 }),
      }),
    );
  });
});

describe("POST /requests/:id/decline", () => {
  it("declines a Pending request", async () => {
    vi.mocked(prisma.request.findFirst).mockResolvedValue(pendingBorrowRequest() as never);
    vi.mocked(prisma.request.update).mockResolvedValue(
      pendingBorrowRequest({ status: "Declined" }) as never,
    );
    const res = await request(app).post("/api/v1/requests/req-1/decline").set(OTHER_AUTH_HEADER);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("Declined");
  });
});

describe("POST /requests/:id/cancel", () => {
  it("rejects cancel from a non-initiator", async () => {
    vi.mocked(prisma.request.findFirst).mockResolvedValue(pendingBorrowRequest() as never);
    const res = await request(app).post("/api/v1/requests/req-1/cancel").set(OTHER_AUTH_HEADER);
    expect(res.status).toBe(403);
  });

  it("cancels a Pending request for its initiator", async () => {
    vi.mocked(prisma.request.findFirst).mockResolvedValue(pendingBorrowRequest() as never);
    vi.mocked(prisma.request.update).mockResolvedValue(
      pendingBorrowRequest({ status: "Cancelled" }) as never,
    );
    const res = await request(app).post("/api/v1/requests/req-1/cancel").set(AUTH_HEADER);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("Cancelled");
  });
});

describe("POST /requests (Repayment)", () => {
  const activeObligation = {
    id: "obl-1",
    borrowerId: borrower.id,
    lenderId: lender.id,
    repaymentType: "LumpSum",
    status: "Active",
    dueDate: new Date("2020-01-01"),
    outstandingBalance: { toNumber: () => 500 },
  };

  it("rejects a non-lender requesting repayment", async () => {
    vi.mocked(prisma.obligation.findUnique).mockResolvedValue(activeObligation as never);
    const res = await request(app)
      .post("/api/v1/requests")
      .set(AUTH_HEADER) // borrower, not lender
      .send({ request_type: "Repayment", obligation_id: "obl-1" });
    expect(res.status).toBe(400);
  });

  it("rejects when nothing is overdue", async () => {
    vi.mocked(prisma.obligation.findUnique).mockResolvedValue({
      ...activeObligation,
      dueDate: new Date("2099-01-01"),
    } as never);
    const res = await request(app)
      .post("/api/v1/requests")
      .set(OTHER_AUTH_HEADER) // lender
      .send({ request_type: "Repayment", obligation_id: "obl-1" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("STATUS_CONFLICT");
  });

  it("creates a Repayment request when overdue", async () => {
    vi.mocked(prisma.obligation.findUnique).mockResolvedValue(activeObligation as never);
    vi.mocked(prisma.request.create).mockResolvedValue(
      pendingBorrowRequest({ requestType: "Repayment", obligationId: "obl-1" }) as never,
    );
    const res = await request(app)
      .post("/api/v1/requests")
      .set(OTHER_AUTH_HEADER)
      .send({ request_type: "Repayment", obligation_id: "obl-1" });
    expect(res.status).toBe(201);
  });
});
