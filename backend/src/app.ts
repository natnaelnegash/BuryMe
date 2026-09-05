import express from "express";
import cors from "cors";

import { errorHandler } from "./middleware/errors.js";
import { authRouter } from "./routes/auth.js";

// Express app construction, separated from index.ts's `listen()` call so
// tests (supertest) can exercise the exact same wiring without binding a
// real port.
export const app = express();

app.use(cors());

app.use(express.json());

// Health check — kept deliberately dependency-free, stays outside
// requireAuth and outside contract/openapi.yaml's documented surface.
app.get("/api/v1/health", (_req, res) => {
  res.json({ status: "ok", service: "buryme-backend" });
});

app.use("/api/v1/auth", authRouter);

// Must be mounted last — Express only calls a 4-arg middleware as an error
// handler when it comes after every route.
app.use(errorHandler);
