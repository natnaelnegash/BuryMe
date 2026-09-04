import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mocked before any import pulls in the real modules — both would otherwise
// throw at import time (config/firebase.ts needs real Admin SDK creds,
// db/client.ts needs a real DATABASE_URL) or hit a real DB/Firebase project.
vi.mock("../config/firebase.js", () => ({
  auth: { verifyIdToken: vi.fn() },
}));
vi.mock("../db/client.js", () => ({
  prisma: {
    user: { findUnique: vi.fn(), create: vi.fn() },
    fcmToken: { upsert: vi.fn(), deleteMany: vi.fn() },
  },
}));

const { app } = await import("../app.js");
const { auth } = await import("../config/firebase.js");
const { prisma } = await import("../db/client.js");

const verifyIdToken = vi.mocked(auth.verifyIdToken);
const AUTH_HEADER = { Authorization: "Bearer test-token" };

beforeEach(() => {
  vi.clearAllMocks();
  verifyIdToken.mockResolvedValue({ uid: "uid-1", phone_number: "+251911111111" } as never);
});

describe("GET /auth/me", () => {
  it("returns 401 without a bearer token", async () => {
    const res = await request(app).get("/api/v1/auth/me");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("returns 404 when no BuryMe profile exists yet", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    const res = await request(app).get("/api/v1/auth/me").set(AUTH_HEADER);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("returns the serialized user when found", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "uid-1",
      identifier: "+251911111111",
      displayName: "Abel",
      profilePhotoUrl: null,
      verificationStatus: "Verified",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      telebirrAccount: null,
    } as never);

    const res = await request(app).get("/api/v1/auth/me").set(AUTH_HEADER);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ user_id: "uid-1", display_name: "Abel", telebirr: null });
  });
});

describe("POST /auth/register", () => {
  it("returns 409 if a profile already exists", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "uid-1" } as never);
    const res = await request(app)
      .post("/api/v1/auth/register")
      .set(AUTH_HEADER)
      .send({ display_name: "Abel" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("DUPLICATE_SUBMISSION");
  });

  it("creates a user and returns 201", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.create).mockResolvedValue({
      id: "uid-1",
      identifier: "+251911111111",
      displayName: "Abel",
      profilePhotoUrl: null,
      verificationStatus: "Verified",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    } as never);

    const res = await request(app)
      .post("/api/v1/auth/register")
      .set(AUTH_HEADER)
      .send({ display_name: "Abel" });
    expect(res.status).toBe(201);
    expect(res.body.telebirr).toBeNull();
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ id: "uid-1", displayName: "Abel" }),
      }),
    );
  });
});

describe("POST /auth/fcm-token", () => {
  it("returns 400 on an invalid platform", async () => {
    const res = await request(app)
      .post("/api/v1/auth/fcm-token")
      .set(AUTH_HEADER)
      .send({ fcm_token: "tok", platform: "windows" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("upserts the token and returns 204", async () => {
    const res = await request(app)
      .post("/api/v1/auth/fcm-token")
      .set(AUTH_HEADER)
      .send({ fcm_token: "tok", platform: "android" });
    expect(res.status).toBe(204);
    expect(prisma.fcmToken.upsert).toHaveBeenCalled();
  });
});
