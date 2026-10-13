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

export const app = express();

app.set("trust proxy", 1);

// Keep in step with the Socket.io allow-list in config/socket.ts.
app.use(cors({ origin: webOrigin() }));

app.use(requestLogger);

// Mounted before the JSON parser, which would consume the raw body the
// signature check needs.
app.use("/api/v1/webhooks/chapa", webhooksRouter);
app.use(express.json());

app.get("/api/v1/health", (_req, res) => {
  res.json({ status: "ok", service: "buryme-backend" });
});

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

app.use((_req, _res, next) => {
  next(new ApiError("NOT_FOUND", "No such endpoint.", 404));
});

// Must come after every route — Express only treats a 4-arg middleware as
// an error handler there.
app.use(errorHandler);
