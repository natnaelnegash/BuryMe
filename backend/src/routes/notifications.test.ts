import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config/firebase.js", () => ({
  auth: { verifyIdToken: vi.fn() },
}));
vi.mock("../db/client.js", () => ({
  prisma: {
    notification: { findMany: vi.fn(), updateMany: vi.fn() },
    user: { update: vi.fn() },
  },
}));

const { app } = await import("../app.js");
const { auth } = await import("../config/firebase.js");
const { prisma } = await import("../db/client.js");
const { renderNotification, referenceTypeFor } = await import("../lib/notificationCatalog.js");
const { categoryOf, wantsPush } = await import("../lib/notificationPrefs.js");

const AUTH = { Authorization: "Bearer test-token" };
const me = { id: "user-1", identifier: "+251900000001" };

function storedNotification(overrides: Record<string, unknown> = {}) {
  return {
    id: "ntf-1",
    notificationType: "BSS-02",
    title: "Response Needed",
    body: "Dawit Mekonnen accepted the suggested net settlement of 750 ETB. Your response is needed.",
    isRead: false,
    deliveredAt: null,
    createdAt: new Date("2026-09-28T10:00:00.000Z"),
    userId: me.id,
    referenceId: "sug-1",
    referenceType: "SettlementSuggestion",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth.verifyIdToken).mockResolvedValue({
    uid: me.id,
    phone_number: me.identifier,
  } as never);
});

describe("GET /notifications", () => {
  it("returns the caller's feed newest first", async () => {
    vi.mocked(prisma.notification.findMany).mockResolvedValue([storedNotification()] as never);
    const res = await request(app).get("/api/v1/notifications").set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data[0]).toMatchObject({
      notification_id: "ntf-1",
      notification_type: "BSS-02",
      title: "Response Needed",
      reference_type: "SettlementSuggestion",
      reference_id: "sug-1",
      is_read: false,
      delivered_at: null,
    });
    expect(res.body.next_cursor).toBeNull();
    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: me.id },
        orderBy: { createdAt: "desc" },
      }),
    );
  });

  it("pages with a cursor when there are more", async () => {
    const rows = Array.from({ length: 21 }, (_, i) => storedNotification({ id: `ntf-${i}` }));
    vi.mocked(prisma.notification.findMany).mockResolvedValue(rows as never);
    const res = await request(app).get("/api/v1/notifications").set(AUTH);

    expect(res.body.data).toHaveLength(20);
    expect(res.body.next_cursor).toBe("ntf-19");
  });

  it("carries a null reference for Dashboard-targeted events", async () => {
    vi.mocked(prisma.notification.findMany).mockResolvedValue([
      storedNotification({ notificationType: "LR-06", referenceId: null, referenceType: null }),
    ] as never);
    const res = await request(app).get("/api/v1/notifications").set(AUTH);

    expect(res.body.data[0].reference_id).toBeNull();
    expect(res.body.data[0].reference_type).toBeNull();
  });
});

describe("POST /notifications/read", () => {
  it("marks the whole feed read when no ids are given", async () => {
    vi.mocked(prisma.notification.updateMany).mockResolvedValue({ count: 3 } as never);
    const res = await request(app).post("/api/v1/notifications/read").set(AUTH).send({});

    expect(res.status).toBe(204);
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { userId: me.id, isRead: false },
      data: { isRead: true },
    });
  });

  it("marks only the given ids, always scoped to the caller", async () => {
    vi.mocked(prisma.notification.updateMany).mockResolvedValue({ count: 1 } as never);
    const res = await request(app)
      .post("/api/v1/notifications/read")
      .set(AUTH)
      .send({ notification_ids: ["ntf-1", "someone-elses"] });

    expect(res.status).toBe(204);
    // The userId clause is what stops one user marking another's feed read.
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { userId: me.id, isRead: false, id: { in: ["ntf-1", "someone-elses"] } },
      data: { isRead: true },
    });
  });

  it("rejects a malformed id list", async () => {
    const res = await request(app)
      .post("/api/v1/notifications/read")
      .set(AUTH)
      .send({ notification_ids: "ntf-1" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

const allPrefsOn = {
  prefRequests: true,
  prefGroupExpenses: true,
  prefPayments: true,
  prefSchedules: true,
  prefSettlements: true,
  prefReminders: true,
  prefTelebirr: true,
};

describe("PATCH /notifications/preferences", () => {
  it("touches only the switches actually sent", async () => {
    vi.mocked(prisma.user.update).mockResolvedValue({
      ...allPrefsOn,
      prefGroupExpenses: false,
    } as never);

    const res = await request(app)
      .patch("/api/v1/notifications/preferences")
      .set(AUTH)
      .send({ group_expenses: false });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      requests: true,
      group_expenses: false,
      payments: true,
      schedules: true,
      settlements: true,
      reminders: true,
      telebirr: true,
    });
    // The other six are absent from the update, not written as `true`.
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: me.id },
      data: { prefGroupExpenses: false },
    });
  });

  it("rejects a non-boolean switch", async () => {
    const res = await request(app)
      .patch("/api/v1/notifications/preferences")
      .set(AUTH)
      .send({ reminders: "yes" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

// Every catalog id has to land in one of the seven switches, or it would
// silently bypass the user's choice.
describe("preference mapping", () => {
  it("routes each event family to its switch", () => {
    expect(categoryOf("BR-01")).toBe("requests");
    expect(categoryOf("RR-01")).toBe("requests");
    expect(categoryOf("LR-04")).toBe("requests");
    expect(categoryOf("GE-01")).toBe("group_expenses");
    expect(categoryOf("PAY-07")).toBe("payments");
    expect(categoryOf("BSS-03")).toBe("settlements");
    expect(categoryOf("TB-02")).toBe("telebirr");
    expect(categoryOf("REM-01")).toBe("reminders");
  });

  // RS splits: proposing/accepting a schedule is a schedule event, but the
  // due-date nudges are reminders (§13.3).
  it("splits the RS family between schedules and reminders", () => {
    expect(categoryOf("RS-01")).toBe("schedules");
    expect(categoryOf("RS-03")).toBe("schedules");
    expect(categoryOf("RS-04")).toBe("reminders");
    expect(categoryOf("RS-06")).toBe("reminders");
  });

  it("suppresses push for a category that is off, and allows it when on", () => {
    const user = { ...allPrefsOn, prefGroupExpenses: false } as never;
    expect(wantsPush(user, "GE-01")).toBe(false);
    expect(wantsPush(user, "BR-01")).toBe(true);
  });
});

// The catalog is the single source of the wording, so it's worth asserting
// the §13.2 copy directly rather than only through a route.
describe("§13.2 catalog", () => {
  it("renders BR-01 exactly as the catalog specifies", () => {
    expect(renderNotification("BR-01", { name: "Helen Girma", amount: "1,200 ETB" })).toEqual({
      title: "New Borrow Request",
      body: "Helen Girma is requesting 1,200 ETB. Tap to review.",
    });
  });

  it("renders PAY-02 with both the payment and the remaining balance", () => {
    expect(
      renderNotification("PAY-02", {
        name: "Yonas Alemu",
        amount: "450 ETB",
        outstanding: "750 ETB",
      }),
    ).toEqual({
      title: "Payment Received",
      body: "Yonas Alemu made a payment of 450 ETB. 750 ETB remaining.",
    });
  });

  it("maps navigation targets, with null for the Dashboard-bound events", () => {
    expect(referenceTypeFor("BR-01")).toBe("Request");
    expect(referenceTypeFor("BSS-02")).toBe("SettlementSuggestion");
    expect(referenceTypeFor("PAY-03")).toBe("Payment");
    expect(referenceTypeFor("LR-06")).toBeNull();
    expect(referenceTypeFor("BSS-05")).toBeNull();
  });

  // The enum carries the whole catalog, including events for features that
  // don't exist yet — rendering one of those must fail loudly rather than
  // silently produce an empty notification.
  it("throws for a catalog id with no template yet", () => {
    expect(() => renderNotification("OM-01", {})).toThrow(/OM-01/);
  });
});
