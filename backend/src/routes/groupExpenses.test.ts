import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config/firebase.js", () => ({
  auth: { verifyIdToken: vi.fn() },
}));
vi.mock("../db/client.js", () => ({
  prisma: {
    user: { findMany: vi.fn(), findUnique: vi.fn() },
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
    groupExpense: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    obligation: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

const { app } = await import("../app.js");
const { auth } = await import("../config/firebase.js");
const { prisma } = await import("../db/client.js");
const { Prisma } = await import("../generated/prisma/client.js");

const PAYER_AUTH = { Authorization: "Bearer payer-token" };
const OUTSIDER_AUTH = { Authorization: "Bearer outsider-token" };

const payer = {
  id: "payer-1",
  identifier: "+251900000001",
  displayName: "Payer",
  profilePhotoUrl: null,
  verificationStatus: "Verified",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};
const helen = { ...payer, id: "helen-1", displayName: "Helen Girma" };
const yonas = { ...payer, id: "yonas-1", displayName: "Yonas Alemu" };

// A 2,100 bill split three ways: two participants at 700 plus the payer's
// own 700, which must never spawn an obligation.
const validBody = {
  total_amount: { amount: 2100, currency: "ETB" },
  description: "Dinner at Yod Abyssinia",
  expense_date: "2026-09-10",
  due_date: "2026-10-10",
  payer_share_included: true,
  payer_share_amount: { amount: 700, currency: "ETB" },
  participants: [
    { participant_user_id: helen.id, assigned_amount: { amount: 700, currency: "ETB" } },
    { participant_user_id: yonas.id, assigned_amount: { amount: 700, currency: "ETB" } },
  ],
};

function storedExpense(overrides: Record<string, unknown> = {}) {
  return {
    id: "exp-1",
    payerId: payer.id,
    totalAmount: { toNumber: () => 2100 },
    description: "Dinner at Yod Abyssinia",
    expenseDate: new Date("2026-09-10"),
    dueDate: new Date("2026-10-10"),
    payerShareIncluded: true,
    payerShareAmount: { toNumber: () => 700 },
    createdAt: new Date("2026-09-10T00:00:00.000Z"),
    payer,
    participants: [
      {
        id: "gep-1",
        assignedAmount: { toNumber: () => 700 },
        participantId: helen.id,
        participant: helen,
        obligation: { id: "obl-h", outstandingBalance: new Prisma.Decimal(700) },
      },
      {
        id: "gep-2",
        assignedAmount: { toNumber: () => 700 },
        participantId: yonas.id,
        participant: yonas,
        obligation: { id: "obl-y", outstandingBalance: new Prisma.Decimal(250) },
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth.verifyIdToken).mockImplementation(async (token: string) =>
    token === "payer-token"
      ? ({ uid: payer.id, phone_number: payer.identifier } as never)
      : ({ uid: "outsider-1", phone_number: "+251900000009" } as never),
  );
  vi.mocked(prisma.user.findMany).mockResolvedValue([helen, yonas] as never);
  // Run the transaction callback against the same mocked client.
  vi.mocked(prisma.$transaction).mockImplementation((async (fn: (tx: unknown) => unknown) =>
    fn(prisma)) as never);
  vi.mocked(prisma.groupExpense.create).mockResolvedValue({
    id: "exp-1",
    participants: [
      { id: "gep-1", participantId: helen.id, assignedAmount: { toNumber: () => 700 } },
      { id: "gep-2", participantId: yonas.id, assignedAmount: { toNumber: () => 700 } },
    ],
  } as never);
  vi.mocked(prisma.groupExpense.findUniqueOrThrow).mockResolvedValue(storedExpense() as never);
});

describe("POST /group-expenses", () => {
  it("rejects shares that don't add up to the total", async () => {
    const res = await request(app)
      .post("/api/v1/group-expenses")
      .set(PAYER_AUTH)
      .send({ ...validBody, payer_share_amount: { amount: 100, currency: "ETB" } });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: "VALIDATION_ERROR", field: "participants" });
    expect(prisma.groupExpense.create).not.toHaveBeenCalled();
  });

  it("rejects the payer appearing as a participant", async () => {
    const res = await request(app)
      .post("/api/v1/group-expenses")
      .set(PAYER_AUTH)
      .send({
        ...validBody,
        payer_share_included: false,
        payer_share_amount: null,
        participants: [
          { participant_user_id: payer.id, assigned_amount: { amount: 1400, currency: "ETB" } },
          { participant_user_id: helen.id, assigned_amount: { amount: 700, currency: "ETB" } },
        ],
      });
    expect(res.status).toBe(400);
    expect(res.body.error.field).toBe("participants");
  });

  it("rejects a duplicated participant", async () => {
    const res = await request(app)
      .post("/api/v1/group-expenses")
      .set(PAYER_AUTH)
      .send({
        ...validBody,
        participants: [
          { participant_user_id: helen.id, assigned_amount: { amount: 700, currency: "ETB" } },
          { participant_user_id: helen.id, assigned_amount: { amount: 700, currency: "ETB" } },
        ],
      });
    expect(res.status).toBe(400);
  });

  it("requires a share amount when the payer is included", async () => {
    const res = await request(app)
      .post("/api/v1/group-expenses")
      .set(PAYER_AUTH)
      .send({ ...validBody, payer_share_amount: null });
    expect(res.status).toBe(400);
    expect(res.body.error.field).toBe("payer_share_amount");
  });

  it("rejects a future expense date", async () => {
    const res = await request(app)
      .post("/api/v1/group-expenses")
      .set(PAYER_AUTH)
      .send({ ...validBody, expense_date: "2099-01-01", due_date: "2099-02-01" });
    expect(res.status).toBe(400);
    expect(res.body.error.field).toBe("expense_date");
  });

  it("rejects a due date before the expense date", async () => {
    const res = await request(app)
      .post("/api/v1/group-expenses")
      .set(PAYER_AUTH)
      .send({ ...validBody, due_date: "2026-09-01" });
    expect(res.status).toBe(400);
    expect(res.body.error.field).toBe("due_date");
  });

  it("rejects an unknown participant", async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([helen] as never);
    const res = await request(app).post("/api/v1/group-expenses").set(PAYER_AUTH).send(validBody);
    expect(res.status).toBe(400);
    expect(res.body.error.field).toBe("participants");
  });

  it("creates one Active obligation per participant and none for the payer's share", async () => {
    const res = await request(app).post("/api/v1/group-expenses").set(PAYER_AUTH).send(validBody);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      expense_id: "exp-1",
      payer: { user_id: payer.id },
      total_amount: { amount: 2100, currency: "ETB" },
      due_date: "2026-10-10",
      payer_share_included: true,
      payer_share_amount: { amount: 700 },
      participants: [
        { participant: { user_id: helen.id }, obligation_id: "obl-h" },
        { participant: { user_id: yonas.id }, obligation_id: "obl-y" },
      ],
    });

    // Two participants → exactly two obligations; the payer's own share
    // creates none (§8.12).
    expect(prisma.obligation.create).toHaveBeenCalledTimes(2);
    const first = vi.mocked(prisma.obligation.create).mock.calls[0]![0] as {
      data: Record<string, unknown>;
    };
    expect(first.data).toMatchObject({
      borrowerId: helen.id,
      lenderId: payer.id,
      originatingExpenseId: "gep-1",
      repaymentType: "LumpSum",
      disbursementMethod: "AlreadyGiven",
      status: "Active",
    });
    const borrowers = vi
      .mocked(prisma.obligation.create)
      .mock.calls.map((c) => (c[0] as { data: { borrowerId: string } }).data.borrowerId);
    expect(borrowers).not.toContain(payer.id);

    // GE-01 to each participant and nobody else — the payer has no
    // obligation of their own, so they get no notification either.
    await vi.waitFor(() =>
      expect(vi.mocked(prisma.notification.create).mock.calls.length).toBeGreaterThanOrEqual(2),
    );
    const sent = vi
      .mocked(prisma.notification.create)
      .mock.calls.map((c) => (c[0] as { data: Record<string, unknown> }).data);

    expect(sent).toHaveLength(2);
    expect(sent.map((d) => d.userId)).toEqual([helen.id, yonas.id]);
    expect(sent.map((d) => d.userId)).not.toContain(payer.id);
    expect(sent[0]).toMatchObject({
      notificationType: "GE-01",
      title: "New Shared Expense",
      body: "Payer recorded a shared expense. You owe 700 ETB. Tap to review.",
      referenceType: "Obligation",
      referenceId: "obl-h",
    });
  });
});

describe("GET /group-expenses", () => {
  it("scopes by role", async () => {
    vi.mocked(prisma.groupExpense.findMany).mockResolvedValue([storedExpense()] as never);
    const res = await request(app).get("/api/v1/group-expenses?role=payer").set(PAYER_AUTH);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.next_cursor).toBeNull();
    expect(prisma.groupExpense.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { payerId: payer.id } }),
    );
  });
});

describe("outstanding_total", () => {
  // The payer is owed every participant's remaining share; their own share
  // is never an obligation, so it never appears here.
  it("sums every participant's remaining share for the payer", async () => {
    vi.mocked(prisma.groupExpense.findFirst).mockResolvedValue(storedExpense() as never);
    const res = await request(app).get("/api/v1/group-expenses/exp-1").set(PAYER_AUTH);
    expect(res.status).toBe(200);
    expect(res.body.outstanding_total).toEqual({ amount: 950, currency: "ETB" });
  });

  // A participant sees only what they still owe, not the whole bill.
  it("reports only their own remaining share for a participant", async () => {
    vi.mocked(auth.verifyIdToken).mockResolvedValue({
      uid: yonas.id,
      phone_number: yonas.identifier,
    } as never);
    vi.mocked(prisma.groupExpense.findFirst).mockResolvedValue(storedExpense() as never);
    const res = await request(app)
      .get("/api/v1/group-expenses/exp-1")
      .set({ Authorization: "Bearer yonas-token" });
    expect(res.status).toBe(200);
    expect(res.body.outstanding_total).toEqual({ amount: 250, currency: "ETB" });
  });
});

describe("GET /group-expenses/:id", () => {
  it("404s for someone not involved", async () => {
    vi.mocked(prisma.groupExpense.findFirst).mockResolvedValue(null);
    const res = await request(app).get("/api/v1/group-expenses/exp-1").set(OUTSIDER_AUTH);
    expect(res.status).toBe(404);
  });

  it("returns the expense for a party", async () => {
    vi.mocked(prisma.groupExpense.findFirst).mockResolvedValue(storedExpense() as never);
    const res = await request(app).get("/api/v1/group-expenses/exp-1").set(PAYER_AUTH);
    expect(res.status).toBe(200);
    expect(res.body.expense_id).toBe("exp-1");
  });
});
