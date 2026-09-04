import type { Schemas } from "@buryme/shared";
import type { NextFunction, Request, Response } from "express";

// The contract's ErrorCode enum, generated from contract/openapi.yaml —
// never invent a code outside this list (CLAUDE.md).
export type ErrorCode = Schemas["ErrorCode"];

// Thrown by route handlers; caught by `errorHandler` below and rendered as
// the contract's `Error` envelope. `message` must stay plain-language and
// user-safe — never a stack trace, DB id, or raw third-party payload (§12.1).
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
