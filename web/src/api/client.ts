import type { Schemas } from "@buryme/shared";

import { auth } from "./firebase.js";

const BASE_URL = import.meta.env.VITE_API_BASE_URL;

// Thrown on any non-2xx response, carrying the contract's Error envelope
// fields directly so callers can branch on `code` without re-parsing JSON.
export class ApiError extends Error {
  constructor(
    public readonly code: Schemas["ErrorCode"],
    message: string,
    public readonly status: number,
    public readonly field?: string | null,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const idToken = await auth.currentUser?.getIdToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
      ...init?.headers,
    },
  });

  if (res.status === 204) {
    return undefined as T;
  }

  const body: unknown = await res.json().catch(() => undefined);

  if (!res.ok) {
    const errorBody = body as Schemas["Error"] | undefined;
    throw new ApiError(
      errorBody?.error.code ?? "INTERNAL_ERROR",
      errorBody?.error.message ?? "Something went wrong.",
      res.status,
      errorBody?.error.field,
    );
  }

  return body as T;
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", ...(body ? { body: JSON.stringify(body) } : {}) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", ...(body ? { body: JSON.stringify(body) } : {}) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
