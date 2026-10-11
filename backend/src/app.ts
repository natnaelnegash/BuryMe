import express from "express";
import cors from "cors";

import { webOrigin } from "./config/origins.js";
import { prisma } from "./db/client.js";
import { ApiError, errorHandler } from "./middleware/errors.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { authRouter } from "./routes/auth.js";
import { usersRouter } from "./routes/users.js";
import { requestsRouter } from "./routes/requests.js";
import { obligationsRouter } from "./routes/obligations.js";
import { groupExpensesRouter } from "./routes/groupExpenses.js";
import { notificationsRouter } from "./routes/notifications.js";
import { settlementsRouter } from "./routes/settlements.js";
import { paymentsRouter } from "./routes/payments.js";
import { webhooksRouter } from "./routes/webhooks.js";

// Express app construction, separated from index.ts's `listen()` call so
// tests (supertest) can exercise the exact same wiring without binding a
// real port.
export const app = express();

// Railway/Render/any reverse proxy terminates TLS upstream, so without this
// `req.ip` is the proxy's address and `req.protocol` is always "http".
app.set("trust proxy", 1);

// Restricted to the web client's own origin. Note this is not the auth
// boundary — every authenticated route takes a Firebase ID token in the
// Authorization header, not an ambient cookie, so a browser on another
// origin has nothing to replay. Chapa posts server-to-server and is
// unaffected by CORS.
//
// Must stay in step with the Socket.io allow-list in config/socket.ts;
// both read config/origins.ts.
app.use(cors({ origin: webOrigin() }));

app.use(requestLogger);

// Webhooks need the raw body for signature checks, so they mount ahead of
// the JSON parser (which would consume the stream first).
app.use("/api/v1/webhooks/chapa", webhooksRouter);
app.use(express.json());

// Health check — kept deliberately dependency-free, stays outside
// requireAuth and outside contract/openapi.yaml's documented surface.
app.get("/api/v1/health", (_req, res) => {
  res.json({ status: "ok", service: "buryme-backend" });
});

// Readiness, as opposed to the liveness check above: this one touches the
// database, so a host health check pointed here will pull the instance out
// of rotation when Postgres is unreachable rather than serving 500s.
app.get("/api/v1/ready", (_req, res) => {
  void prisma.$queryRaw`SELECT 1`
    .then(() => res.json({ status: "ready" }))
    .catch(() => res.status(503).json({ status: "unavailable", dependency: "database" }));
});

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/users", usersRouter);
app.use("/api/v1/requests", requestsRouter);
app.use("/api/v1/obligations", obligationsRouter);
app.use("/api/v1/payments", paymentsRouter);
app.use("/api/v1/group-expenses", groupExpensesRouter);
app.use("/api/v1/settlements", settlementsRouter);
app.use("/api/v1/notifications", notificationsRouter);

// Unmatched routes would otherwise get Express's default HTML 404, which no
// client can parse — every other failure on this API is the contract's
// `Error` envelope.
app.use((_req, _res, next) => {
  next(new ApiError("NOT_FOUND", "No such endpoint.", 404));
});

// Must be mounted last — Express only calls a 4-arg middleware as an error
// handler when it comes after every route.
app.use(errorHandler);
