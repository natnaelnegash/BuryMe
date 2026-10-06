import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config/firebase.js", () => ({ auth: { verifyIdToken: vi.fn() } }));
vi.mock("../db/client.js", () => ({
  prisma: {
    installment: { findMany: vi.fn() },
    obligation: { findMany: vi.fn() },
    payment: { findMany: vi.fn() },
    user: { findUnique: vi.fn() },
    notification: {
      create: vi.fn().mockResolvedValue({
        id: "ntf-1",
        notificationType: "",
        title: "",
        body: "",
        isRead: false,
        createdAt: new Date("2026-10-06T00:00:00.000Z"),
        referenceId: null,
        referenceType: null,
      }),
      update: vi.fn(),
    },
  },
}));

const { prisma } = await import("../db/client.js");
const { Prisma } = await import("../generated/prisma/client.js");
const { runReminderSweep } = await import("../lib/reminders.js");

// A fixed clock: everything below is relative to this.
const NOW = new Date("2026-10-06T09:30:00.000Z");
const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const borrower = { id: "borrower-1", displayName: "Borrower" };
const lender = { id: "lender-1", displayName: "Lender" };

function installment(overrides: Record<string, unknown> = {}) {
  return {
    id: "inst-1",
    amount: new Prisma.Decimal(500),
    dueDate: utc("2026-10-09"),
    status: "Pending",
    scheduleId: "sch-1",
    schedule: {
      id: "sch-1",
      obligationId: "obl-1",
      obligation: { id: "obl-1", borrowerId: borrower.id, status: "Active" },
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.installment.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.obligation.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.payment.findMany).mockResolvedValue([] as never);
});

function createdNotifications() {
  return vi
    .mocked(prisma.notification.create)
    .mock.calls.map((c) => (c[0] as { data: Record<string, unknown> }).data);
}

describe("RS-04 — upcoming installments", () => {
  it("queries the 3-day and 1-day marks, and only open obligations", async () => {
    await runReminderSweep(NOW);

    const wheres = vi
      .mocked(prisma.installment.findMany)
      .mock.calls.map((c) => (c[0] as { where: Record<string, unknown> }).where);

    // Two lead times from §13.3, plus the overdue query.
    const dues = wheres.map((w) => w.dueDate).filter((d) => d instanceof Date);
    expect(dues).toEqual([utc("2026-10-09"), utc("2026-10-07")]);
    // Settled and Disputed obligations are excluded (§13.3).
    expect(wheres[0]).toMatchObject({
      status: "Pending",
      schedule: { obligation: { status: { in: ["Active", "PartiallyPaid"] } } },
    });
  });

  it("sends to the borrower with the catalog's copy and a per-occasion key", async () => {
    // The overdue query passes a { lt } range rather than a Date, so this
    // has to answer only the exact-date lookups.
    vi.mocked(prisma.installment.findMany).mockImplementation((async (args: {
      where: { dueDate?: unknown };
    }) =>
      args.where.dueDate instanceof Date &&
      args.where.dueDate.getTime() === utc("2026-10-09").getTime()
        ? [installment()]
        : []) as never);

    const result = await runReminderSweep(NOW);
    expect(result.upcomingInstallments).toBe(1);

    const sent = createdNotifications();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      userId: borrower.id,
      notificationType: "RS-04",
      title: "Upcoming Installment",
      body: "Your installment of 500 ETB is due on 9 Oct 2026. Tap to pay.",
      referenceId: "obl-1",
      referenceType: "Obligation",
      // The 3-day and 1-day sends are different occasions for the same row.
      dedupeKey: "RS-04:inst-1:3",
    });
  });
});

describe("RS-05 — overdue installments", () => {
  it("looks only before today and keys once per installment", async () => {
    vi.mocked(prisma.installment.findMany).mockImplementation((async (args: {
      where: { dueDate?: unknown };
    }) =>
      args.where.dueDate && typeof args.where.dueDate === "object" && "lt" in args.where.dueDate
        ? [installment({ id: "inst-9", dueDate: utc("2026-10-01"), status: "Overdue" })]
        : []) as never);

    const result = await runReminderSweep(NOW);
    expect(result.overdueInstallments).toBe(1);

    const sent = createdNotifications();
    expect(sent[0]).toMatchObject({
      notificationType: "RS-05",
      title: "Installment Overdue",
      body: "Your installment of 500 ETB was due on 1 Oct 2026 and is now overdue.",
      dedupeKey: "RS-05:inst-9",
    });
  });
});

describe("RS-06 — lump sum obligations falling due", () => {
  it("excludes Installments obligations and names the lender", async () => {
    vi.mocked(prisma.obligation.findMany).mockImplementation((async (args: {
      where: { dueDate?: unknown };
    }) =>
      args.where.dueDate instanceof Date &&
      args.where.dueDate.getTime() === utc("2026-10-07").getTime()
        ? [
            {
              id: "obl-7",
              borrowerId: borrower.id,
              outstandingBalance: new Prisma.Decimal(1200),
              dueDate: utc("2026-10-07"),
              lender,
            },
          ]
        : []) as never);

    const result = await runReminderSweep(NOW);
    expect(result.upcomingObligations).toBe(1);

    const where = vi.mocked(prisma.obligation.findMany).mock.calls[0]![0]!.where as Record<
      string,
      unknown
    >;
    expect(where).toMatchObject({
      repaymentType: "LumpSum",
      status: { in: ["Active", "PartiallyPaid"] },
      outstandingBalance: { gt: 0 },
    });

    expect(createdNotifications()[0]).toMatchObject({
      notificationType: "RS-06",
      title: "Obligation Due Soon",
      body: "Your obligation of 1,200 ETB to Lender is due on 7 Oct 2026.",
      dedupeKey: "RS-06:obl-7:1",
    });
  });
});

describe("REM-01 — unanswered external payments", () => {
  it("chases the party who did not record it, after the configured delay", async () => {
    vi.mocked(prisma.payment.findMany).mockResolvedValue([
      {
        id: "pay-1",
        payerId: borrower.id,
        recipientId: lender.id,
        recordedByUserId: borrower.id,
        amount: new Prisma.Decimal(530),
        recordedAt: utc("2026-10-02"),
        payer: borrower,
        recipient: lender,
      },
    ] as never);

    const result = await runReminderSweep(NOW);
    expect(result.confirmationChases).toBe(1);

    const where = vi.mocked(prisma.payment.findMany).mock.calls[0]![0]!.where as {
      recordedAt: { lte: Date };
    };
    expect(where.recordedAt.lte).toEqual(utc("2026-10-03"));

    // The borrower recorded it, so the lender is the one who owes a response.
    expect(createdNotifications()[0]).toMatchObject({
      userId: lender.id,
      notificationType: "REM-01",
      title: "Confirmation Pending",
      body: "Borrower recorded a payment of 530 ETB 4 days ago. Please confirm or dispute.",
      referenceType: "Payment",
      dedupeKey: "REM-01:pay-1",
    });
  });
});

describe("the sweep as a whole", () => {
  it("sends nothing when there is nothing due", async () => {
    const result = await runReminderSweep(NOW);
    expect(result).toEqual({
      upcomingInstallments: 0,
      overdueInstallments: 0,
      upcomingObligations: 0,
      confirmationChases: 0,
    });
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });
});
