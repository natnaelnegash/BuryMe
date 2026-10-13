import type { Schemas } from "@buryme/shared";
import type { NextFunction, Request, Response } from "express";

// Never invent a code outside this list (CLAUDE.md). `ApiError.message` must
// stay user-safe: no stack traces, DB ids, or raw third-party payloads.
export type ErrorCode = Schemas["ErrorCode"];

export class ApiError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly status: number,
    public readonly field?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ApiError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, field: err.field ?? null },
    });
    return;
  }

  console.error(err);
  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR" satisfies ErrorCode,
      message: "Something went wrong. Please try again.",
    },
  });
}
