import type { NextFunction, Request, Response } from "express";

// One line per request, on completion. Deliberately not a logging library:
// the only thing missing before this was any way to tell what a deployed
// instance was asked to do, and a hosted log tail reads this fine.
//
// Logs the route, not the query string or body — those carry phone numbers
// and amounts, and §12.1's "never expose raw payloads" posture applies to
// logs as much as to responses. Health and readiness probes are skipped so
// they don't bury real traffic.
const SKIP = new Set(["/api/v1/health", "/api/v1/ready"]);

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  // Vitest sets NODE_ENV=test; 152 route tests would otherwise each print a
  // line. Note the polarity: logging is on unless explicitly under test, so
  // an unset NODE_ENV (the default on a host) still logs.
  if (process.env.NODE_ENV === "test" || SKIP.has(req.path)) {
    next();
    return;
  }

  const startedAt = process.hrtime.bigint();

  res.on("finish", () => {
    const ms = Number(process.hrtime.bigint() - startedAt) / 1e6;
    // eslint-disable-next-line no-console
    console.log(`${req.method} ${req.path} ${res.statusCode} ${ms.toFixed(0)}ms`);
  });

  next();
}
