import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config/firebase.js", () => ({
  auth: { verifyIdToken: vi.fn() },
}));
vi.mock("../db/client.js", () => ({
  prisma: {
    user: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
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
    telebirrAccount: { upsert: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  },
}));
const smsSender = { send: vi.fn() };
vi.mock("../config/sms.js", () => ({
  getSmsSender: () => smsSender,
}));

const { app } = await import("../app.js");
const { auth } = await import("../config/firebase.js");
const { prisma } = await import("../db/client.js");

const verifyIdToken = vi.mocked(auth.verifyIdToken);
const AUTH_HEADER = { Authorization: "Bearer test-token" };

const baseUser = {
  id: "uid-1",
  identifier: "+251911111111",
  displayName: "Abel",
  profilePhotoUrl: null,
  verificationStatus: "Verified",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  verifyIdToken.mockResolvedValue({ uid: "uid-1", phone_number: "+251911111111" } as never);
});

describe("GET /users/search", () => {
  it("returns 400 when q is too short", async () => {
    const res = await request(app).get("/api/v1/users/search?q=a").set(AUTH_HEADER);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns matching users as UserSummary", async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([baseUser] as never);
    const res = await request(app).get("/api/v1/users/search?q=Abel").set(AUTH_HEADER);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ user_id: "uid-1", display_name: "Abel", profile_photo_url: null }]);
  });
});

describe("GET /users/:userId", () => {
  it("returns 404 when no user exists", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    const res = await request(app).get("/api/v1/users/nope").set(AUTH_HEADER);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("returns the public summary when found", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(baseUser as never);
    const res = await request(app).get("/api/v1/users/uid-1").set(AUTH_HEADER);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ user_id: "uid-1", display_name: "Abel", profile_photo_url: null });
  });
});

describe("PATCH /users/me", () => {
  it("updates display_name and returns the full User", async () => {
    vi.mocked(prisma.user.update).mockResolvedValue({
      ...baseUser,
      displayName: "New Name",
      telebirrAccount: null,
    } as never);

    const res = await request(app)
      .patch("/api/v1/users/me")
      .set(AUTH_HEADER)
      .send({ display_name: "New Name" });
    expect(res.status).toBe(200);
    expect(res.body.display_name).toBe("New Name");
    expect(res.body.telebirr).toBeNull();
  });

  it("returns 400 on an invalid display_name", async () => {
    const res = await request(app)
      .patch("/api/v1/users/me")
      .set(AUTH_HEADER)
      .send({ display_name: "a" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("GET /users/me/telebirr", () => {
  it("lazily creates and returns an Unverified account", async () => {
    vi.mocked(prisma.telebirrAccount.upsert).mockResolvedValue({
      accountId: "acct-1",
      telebirrNumber: null,
      verificationStatus: "Unverified",
      verifiedAt: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    } as never);

    const res = await request(app).get("/api/v1/users/me/telebirr").set(AUTH_HEADER);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ telebirr_number: null, verification_status: "Unverified" });
  });
});

describe("POST /users/me/telebirr", () => {
  it("returns 400 on a malformed number", async () => {
    const res = await request(app)
      .post("/api/v1/users/me/telebirr")
      .set(AUTH_HEADER)
      .send({ telebirr_number: "12345" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("sets the number and resets status to Unverified", async () => {
    vi.mocked(prisma.telebirrAccount.upsert).mockResolvedValue({
      accountId: "acct-1",
      telebirrNumber: "0911111111",
      verificationStatus: "Unverified",
      verifiedAt: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    } as never);

    const res = await request(app)
      .post("/api/v1/users/me/telebirr")
      .set(AUTH_HEADER)
      .send({ telebirr_number: "0911111111" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      telebirr_number: "0911111111",
      verification_status: "Unverified",
    });
  });
});

// ── Telebirr OTP (POST /users/me/telebirr/otp + /verify) ──────────────

const { createHash } = await import("node:crypto");
const { otpPepper } = await import("../config/otp.js");
const hashOf = (code: string) =>
  createHash("sha256").update(`${code}:${otpPepper()}`).digest("hex");

const pendingAccount = {
  accountId: "acct-1",
  telebirrNumber: "0911111111",
  verificationStatus: "Unverified",
  verifiedAt: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  otpHash: null,
  otpExpiresAt: null,
  otpSentAt: null,
  otpAttempts: 0,
  userId: "uid-1",
};

describe("POST /users/me/telebirr/otp", () => {
  it("returns 409 when no number is saved", async () => {
    vi.mocked(prisma.telebirrAccount.findUnique).mockResolvedValue({
      ...pendingAccount,
      telebirrNumber: null,
    } as never);
    const res = await request(app).post("/api/v1/users/me/telebirr/otp").set(AUTH_HEADER);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("STATUS_CONFLICT");
    expect(smsSender.send).not.toHaveBeenCalled();
  });

  it("returns 409 when already Verified", async () => {
    vi.mocked(prisma.telebirrAccount.findUnique).mockResolvedValue({
      ...pendingAccount,
      verificationStatus: "Verified",
    } as never);
    const res = await request(app).post("/api/v1/users/me/telebirr/otp").set(AUTH_HEADER);
    expect(res.status).toBe(409);
  });

  it("returns 429 when a code was sent under a minute ago", async () => {
    vi.mocked(prisma.telebirrAccount.findUnique).mockResolvedValue({
      ...pendingAccount,
      otpSentAt: new Date(Date.now() - 10_000),
    } as never);
    const res = await request(app).post("/api/v1/users/me/telebirr/otp").set(AUTH_HEADER);
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("DUPLICATE_SUBMISSION");
    expect(smsSender.send).not.toHaveBeenCalled();
  });

  it("sends a 6-digit code and stores only its hash", async () => {
    vi.mocked(prisma.telebirrAccount.findUnique).mockResolvedValue(pendingAccount as never);
    vi.mocked(prisma.telebirrAccount.update).mockResolvedValue(pendingAccount as never);

    const res = await request(app).post("/api/v1/users/me/telebirr/otp").set(AUTH_HEADER);
    expect(res.status).toBe(200);
    expect(typeof res.body.expires_at).toBe("string");
    expect(typeof res.body.resend_available_at).toBe("string");

    expect(smsSender.send).toHaveBeenCalledTimes(1);
    const [to, message] = vi.mocked(smsSender.send).mock.calls[0]!;
    expect(to).toBe("0911111111");
    const code = /\b(\d{6})\b/.exec(message)![1]!;

    const data = vi.mocked(prisma.telebirrAccount.update).mock.calls[0]![0].data as Record<
      string,
      unknown
    >;
    expect(data.otpHash).toBe(hashOf(code));
    expect(data.otpHash).not.toContain(code);
    expect(data.otpAttempts).toBe(0);
  });

  it("returns 500 INTERNAL_ERROR and stores nothing when the SMS fails", async () => {
    vi.mocked(prisma.telebirrAccount.findUnique).mockResolvedValue(pendingAccount as never);
    vi.mocked(smsSender.send).mockRejectedValueOnce(new Error("provider down"));
    const res = await request(app).post("/api/v1/users/me/telebirr/otp").set(AUTH_HEADER);
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("INTERNAL_ERROR");
    expect(prisma.telebirrAccount.update).not.toHaveBeenCalled();
  });
});

describe("POST /users/me/telebirr/verify", () => {
  const challenged = {
    ...pendingAccount,
    otpHash: hashOf("123456"),
    otpExpiresAt: new Date(Date.now() + 60_000),
    otpSentAt: new Date(),
  };

  it("returns 400 on a malformed code", async () => {
    const res = await request(app)
      .post("/api/v1/users/me/telebirr/verify")
      .set(AUTH_HEADER)
      .send({ code: "12" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 409 when nothing is pending", async () => {
    vi.mocked(prisma.telebirrAccount.findUnique).mockResolvedValue(pendingAccount as never);
    const res = await request(app)
      .post("/api/v1/users/me/telebirr/verify")
      .set(AUTH_HEADER)
      .send({ code: "123456" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("STATUS_CONFLICT");
  });

  it("returns 400 and counts the attempt on a wrong code", async () => {
    vi.mocked(prisma.telebirrAccount.findUnique).mockResolvedValue(challenged as never);
    const res = await request(app)
      .post("/api/v1/users/me/telebirr/verify")
      .set(AUTH_HEADER)
      .send({ code: "654321" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: "VALIDATION_ERROR", field: "code" });
    expect(prisma.telebirrAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { otpAttempts: { increment: 1 } } }),
    );
  });

  it("returns 400 on an expired code", async () => {
    vi.mocked(prisma.telebirrAccount.findUnique).mockResolvedValue({
      ...challenged,
      otpExpiresAt: new Date(Date.now() - 1_000),
    } as never);
    const res = await request(app)
      .post("/api/v1/users/me/telebirr/verify")
      .set(AUTH_HEADER)
      .send({ code: "123456" });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/expired/i);
  });

  it("returns 409 once attempts are exhausted, even with the right code", async () => {
    vi.mocked(prisma.telebirrAccount.findUnique).mockResolvedValue({
      ...challenged,
      otpAttempts: 5,
    } as never);
    const res = await request(app)
      .post("/api/v1/users/me/telebirr/verify")
      .set(AUTH_HEADER)
      .send({ code: "123456" });
    expect(res.status).toBe(409);
    expect(prisma.telebirrAccount.update).not.toHaveBeenCalled();
  });

  it("marks the account Verified and clears the challenge on the right code", async () => {
    vi.mocked(prisma.telebirrAccount.findUnique).mockResolvedValue(challenged as never);
    vi.mocked(prisma.telebirrAccount.update).mockResolvedValue({
      ...challenged,
      verificationStatus: "Verified",
      verifiedAt: new Date("2026-09-15T10:00:00.000Z"),
      otpHash: null,
      otpExpiresAt: null,
      otpSentAt: null,
      otpAttempts: 0,
    } as never);

    const res = await request(app)
      .post("/api/v1/users/me/telebirr/verify")
      .set(AUTH_HEADER)
      .send({ code: "123456" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      verification_status: "Verified",
      verified_at: "2026-09-15T10:00:00.000Z",
    });
    expect(prisma.telebirrAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ verificationStatus: "Verified", otpHash: null }),
      }),
    );
  });
});
