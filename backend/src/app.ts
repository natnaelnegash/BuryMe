import express from "express";
import cors from "cors";

import { errorHandler } from "./middleware/errors.js";
import { authRouter } from "./routes/auth.js";
import { usersRouter } from "./routes/users.js";
import { requestsRouter } from "./routes/requests.js";
import { obligationsRouter } from "./routes/obligations.js";
import { webhooksRouter } from "./routes/webhooks.js";

// Express app construction, separated from index.ts's `listen()` call so
// tests (supertest) can exercise the exact same wiring without binding a
// real port.
export const app = express();

app.use(cors());

// Webhooks need the raw body for signature checks, so they mount ahead of
// the JSON parser (which would consume the stream first).
app.use("/api/v1/webhooks/chapa", webhooksRouter);
app.use(express.json());

// Health check — kept deliberately dependency-free, stays outside
// requireAuth and outside contract/openapi.yaml's documented surface.
app.get("/api/v1/health", (_req, res) => {
  res.json({ status: "ok", service: "buryme-backend" });
});

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/users", usersRouter);
app.use("/api/v1/requests", requestsRouter);
app.use("/api/v1/obligations", obligationsRouter);

// Must be mounted last — Express only calls a 4-arg middleware as an error
// handler when it comes after every route.
app.use(errorHandler);
