import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config/firebase.js", () => ({
  auth: { verifyIdToken: vi.fn() },
}));
vi.mock("../db/client.js", () => ({
  prisma: {
    user: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    telebirrAccount: { upsert: vi.fn() },
  },
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
