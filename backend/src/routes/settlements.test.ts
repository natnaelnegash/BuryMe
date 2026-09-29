import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config/firebase.js", () => ({
  auth: { verifyIdToken: vi.fn() },
}));
vi.mock("../db/client.js", () => ({
  prisma: {
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
    obligation: { findMany: vi.fn(), count: vi.fn(), update: vi.fn() },
    settlementSuggestion: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  },
}));

const { app } = await import("../app.js");
const { auth } = await import("../config/firebase.js");
const { prisma } = await import("../db/client.js");
const { Prisma } = await import("../generated/prisma/client.js");

const A_AUTH = { Authorization: "Bearer a-token" };
const B_AUTH = { Authorization: "Bearer b-token" };
const OUTSIDER_AUTH = { Authorization: "Bearer outsider-token" };

const alem = {
  id: "alem-1",
  identifier: "+251900000001",
  displayName: "Alem Bekele",
  profilePhotoUrl: null,
  verificationStatus: "Verified",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};
const dawit = { ...alem, id: "dawit-1", displayName: "Dawit Mekonnen" };

// Alem owes Dawit 450; Dawit owes Alem 1,200. Netting leaves Dawit paying
// Alem 750 — the numbers on the Figma frame.
function obligation(overrides: Record<string, unknown> = {}) {
  return {
    id: "obl-a",
    borrowerId: alem.id,
    lenderId: dawit.id,
    principalAmount: new Prisma.Decimal(450),
    outstandingBalance: new Prisma.Decimal(450),
    purpose: "Lunch",
    repaymentType: "LumpSum",
    disbursementMethod: "AlreadyGiven",
    dueDate: new Date("2026-10-01"),
    status: "Active",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    settledAt: null,
    ...overrides,
  };
}

const alemOwes = obligation();
const dawitOwes = obligation({
  id: "obl-b",
  borrowerId: dawit.id,
  lenderId: alem.id,
  principalAmount: new Prisma.Decimal(1200),
  outstandingBalance: new Prisma.Decimal(1200),
});

function storedSuggestion(overrides: Record<string, unknown> = {}) {
  return {
    id: "sug-1",
    userAId: alem.id,
    userBId: dawit.id,
    obligationAId: "obl-a",
    obligationBId: "obl-b",
    netAmount: new Prisma.Decimal(750),
    netPayerId: dawit.id,
    netRecipientId: alem.id,
    userAResponse: "Accepted",
    userBResponse: "Pending",
    status: "Pending",
    createdAt: new Date("2026-09-24T00:00:00.000Z"),
    resolvedAt: null,
    userA: alem,
    userB: dawit,
    netPayer: dawit,
    netRecipient: alem,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth.verifyIdToken).mockImplementation(async (token: string) => {
    if (token === "a-token") return { uid: alem.id, phone_number: alem.identifier } as never;
    if (token === "b-token") return { uid: dawit.id, phone_number: dawit.identifier } as never;
    return { uid: "outsider-1", phone_number: "+251900000009" } as never;
  });
  vi.mocked(prisma.user.findUnique).mockResolvedValue(dawit as never);
  vi.mocked(prisma.settlementSuggestion.findFirst).mockResolvedValue(null);
  // One open obligation in each direction.
  vi.mocked(prisma.obligation.findMany).mockImplementation((async (args: {
    where: { borrowerId: string };
  }) => (args.where.borrowerId === alem.id ? [alemOwes] : [dawitOwes])) as never);
  vi.mocked(prisma.settlementSuggestion.create).mockResolvedValue(storedSuggestion() as never);
  vi.mocked(prisma.obligation.count).mockResolvedValue(2 as never);
});

describe("POST /settlements/suggestions", () => {
  it("nets the two balances and records the proposer as already accepted", async () => {
    const res = await request(app)
      .post("/api/v1/settlements/suggestions")
      .set(A_AUTH)
      .send({ counterparty_user_id: dawit.id });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      suggestion_id: "sug-1",
      user_a: { user_id: alem.id },
      user_b: { user_id: dawit.id },
      net_amount: { amount: 750, currency: "ETB" },
      net_payer: { user_id: dawit.id },
      net_recipient: { user_id: alem.id },
      user_a_response: "Accepted",
      user_b_response: "Pending",
      status: "Pending",
    });

    // user_a is the initiator, so obligation_a is the one they borrow on.
    const data = vi.mocked(prisma.settlementSuggestion.create).mock.calls[0]![0]!.data as Record<
      string,
      unknown
    >;
    expect(data).toMatchObject({
      userAId: alem.id,
      obligationAId: "obl-a",
      obligationBId: "obl-b",
      netPayerId: dawit.id,
      userAResponse: "Accepted",
      userBResponse: "Pending",
    });
    expect((data.netAmount as InstanceType<typeof Prisma.Decimal>).toNumber()).toBe(750);
  });

  it("refuses when only one side owes", async () => {
    vi.mocked(prisma.obligation.findMany).mockImplementation((async (args: {
      where: { borrowerId: string };
    }) => (args.where.borrowerId === alem.id ? [alemOwes] : [])) as never);

    const res = await request(app)
      .post("/api/v1/settlements/suggestions")
      .set(A_AUTH)
      .send({ counterparty_user_id: dawit.id });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("STATUS_CONFLICT");
    expect(prisma.settlementSuggestion.create).not.toHaveBeenCalled();
  });

  it("refuses when a direction has more than one open obligation", async () => {
    vi.mocked(prisma.obligation.findMany).mockImplementation((async (args: {
      where: { borrowerId: string };
    }) =>
      args.where.borrowerId === alem.id
        ? [alemOwes, obligation({ id: "obl-a2" })]
        : [dawitOwes]) as never);

    const res = await request(app)
      .post("/api/v1/settlements/suggestions")
      .set(A_AUTH)
      .send({ counterparty_user_id: dawit.id });
    expect(res.status).toBe(409);
    expect(prisma.settlementSuggestion.create).not.toHaveBeenCalled();
  });

  // Settling an installment plan would strand Pending installments under a
  // Settled obligation, so it's refused until the contract has a way to say
  // "cancelled".
  it("refuses an installment obligation", async () => {
    vi.mocked(prisma.obligation.findMany).mockImplementation((async (args: {
      where: { borrowerId: string };
    }) =>
      args.where.borrowerId === alem.id
        ? [obligation({ repaymentType: "Installments" })]
        : [dawitOwes]) as never);

    const res = await request(app)
      .post("/api/v1/settlements/suggestions")
      .set(A_AUTH)
      .send({ counterparty_user_id: dawit.id });
    expect(res.status).toBe(409);
  });

  it("refuses a second live suggestion for the same pair", async () => {
    vi.mocked(prisma.settlementSuggestion.findFirst).mockResolvedValue({ id: "sug-0" } as never);
    const res = await request(app)
      .post("/api/v1/settlements/suggestions")
      .set(A_AUTH)
      .send({ counterparty_user_id: dawit.id });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("DUPLICATE_SUBMISSION");
  });

  it("rejects settling with yourself", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(alem as never);
    const res = await request(app)
      .post("/api/v1/settlements/suggestions")
      .set(A_AUTH)
      .send({ counterparty_user_id: alem.id });
    expect(res.status).toBe(400);
    expect(res.body.error.field).toBe("counterparty_user_id");
  });
});

describe("POST /settlements/suggestions/:id/accept", () => {
  it("settles nothing while the other party hasn't answered", async () => {
    // A suggestion neither party has accepted yet.
    vi.mocked(prisma.settlementSuggestion.findFirst).mockResolvedValue(
      storedSuggestion({ userAResponse: "Pending" }) as never,
    );
    vi.mocked(prisma.settlementSuggestion.update).mockResolvedValue(
      storedSuggestion({ userAResponse: "Accepted" }) as never,
    );

    const res = await request(app).post("/api/v1/settlements/suggestions/sug-1/accept").set(A_AUTH);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("Pending");
    expect(prisma.obligation.update).not.toHaveBeenCalled();
  });

  it("settles both obligations once the second party accepts", async () => {
    vi.mocked(prisma.settlementSuggestion.findFirst).mockResolvedValue(storedSuggestion() as never);
    vi.mocked(prisma.settlementSuggestion.update).mockResolvedValue(
      storedSuggestion({
        userBResponse: "Accepted",
        status: "Accepted",
        resolvedAt: new Date("2026-09-24T12:00:00.000Z"),
      }) as never,
    );

    const res = await request(app).post("/api/v1/settlements/suggestions/sug-1/accept").set(B_AUTH);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("Accepted");
    expect(res.body.resolved_at).not.toBeNull();

    // Both obligations zeroed and Settled — the same invariant a confirmed
    // final payment produces.
    expect(prisma.obligation.update).toHaveBeenCalledTimes(2);
    const ids = vi
      .mocked(prisma.obligation.update)
      .mock.calls.map((c) => (c[0] as { where: { id: string } }).where.id);
    expect(ids).toEqual(["obl-a", "obl-b"]);
    for (const call of vi.mocked(prisma.obligation.update).mock.calls) {
      const data = (call[0] as { data: Record<string, unknown> }).data;
      expect(data.status).toBe("Settled");
      expect(data.settledAt).toBeInstanceOf(Date);
      expect((data.outstandingBalance as InstanceType<typeof Prisma.Decimal>).toNumber()).toBe(0);
    }

    // BSS-03 to both parties. Each is told the OTHER person's name and
    // pointed at their own obligation — easy to get backwards, so both
    // directions are pinned here.
    await vi.waitFor(() =>
      expect(vi.mocked(prisma.notification.create).mock.calls.length).toBeGreaterThanOrEqual(2),
    );
    const sent = vi
      .mocked(prisma.notification.create)
      .mock.calls.map((c) => (c[0] as { data: Record<string, unknown> }).data)
      .filter((d) => d.notificationType === "BSS-03");

    expect(sent).toHaveLength(2);
    expect(sent.find((d) => d.userId === alem.id)).toMatchObject({
      title: "Settlement Completed",
      body: "Your mutual obligations with Dawit Mekonnen have been resolved. Net payment: 750 ETB.",
      referenceId: "obl-a",
      referenceType: "Obligation",
    });
    expect(sent.find((d) => d.userId === dawit.id)).toMatchObject({
      body: "Your mutual obligations with Alem Bekele have been resolved. Net payment: 750 ETB.",
      referenceId: "obl-b",
    });
  });

  it("409s when an obligation was already settled by other means", async () => {
    vi.mocked(prisma.settlementSuggestion.findFirst).mockResolvedValue(storedSuggestion() as never);
    vi.mocked(prisma.obligation.count).mockResolvedValue(1 as never);

    const res = await request(app).post("/api/v1/settlements/suggestions/sug-1/accept").set(B_AUTH);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("STATUS_CONFLICT");
    expect(prisma.obligation.update).not.toHaveBeenCalled();
  });

  it("409s on an already-resolved suggestion", async () => {
    vi.mocked(prisma.settlementSuggestion.findFirst).mockResolvedValue(
      storedSuggestion({ status: "Declined" }) as never,
    );
    const res = await request(app).post("/api/v1/settlements/suggestions/sug-1/accept").set(B_AUTH);
    expect(res.status).toBe(409);
  });

  it("404s for someone who isn't a party", async () => {
    vi.mocked(prisma.settlementSuggestion.findFirst).mockResolvedValue(null);
    const res = await request(app)
      .post("/api/v1/settlements/suggestions/sug-1/accept")
      .set(OUTSIDER_AUTH);
    expect(res.status).toBe(404);
  });
});

describe("POST /settlements/suggestions/:id/decline", () => {
  it("ends the suggestion and leaves both obligations untouched", async () => {
    vi.mocked(prisma.settlementSuggestion.findFirst).mockResolvedValue(storedSuggestion() as never);
    vi.mocked(prisma.settlementSuggestion.update).mockResolvedValue(
      storedSuggestion({
        userBResponse: "Declined",
        status: "Declined",
        resolvedAt: new Date("2026-09-24T12:00:00.000Z"),
      }) as never,
    );

    const res = await request(app)
      .post("/api/v1/settlements/suggestions/sug-1/decline")
      .set(B_AUTH);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("Declined");
    expect(prisma.obligation.update).not.toHaveBeenCalled();
  });
});

describe("GET /settlements/suggestions", () => {
  it("returns a bare array of the caller's suggestions", async () => {
    vi.mocked(prisma.settlementSuggestion.findMany).mockResolvedValue([
      storedSuggestion(),
    ] as never);
    const res = await request(app).get("/api/v1/settlements/suggestions").set(A_AUTH);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].suggestion_id).toBe("sug-1");
  });
});
