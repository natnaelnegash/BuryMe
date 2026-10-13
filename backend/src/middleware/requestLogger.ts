import type { NextFunction, Request, Response } from "express";

const SKIP = new Set(["/api/v1/health", "/api/v1/ready"]);

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  if (process.env.NODE_ENV === "test" || SKIP.has(req.path)) {
    next();
    return;
  }

  // Route only, never the query string or body — those carry phone numbers
  // and amounts.
  const startedAt = process.hrtime.bigint();

  res.on("finish", () => {
    const ms = Number(process.hrtime.bigint() - startedAt) / 1e6;
    // eslint-disable-next-line no-console
    console.log(`${req.method} ${req.path} ${res.statusCode} ${ms.toFixed(0)}ms`);
  });

  next();
}
