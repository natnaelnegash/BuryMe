import type { Schemas } from "@buryme/shared";

import { auth } from "./firebase.js";

const BASE_URL = import.meta.env.VITE_API_BASE_URL;

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

export class NetworkError extends Error {
  constructor(cause?: unknown) {
    super("You’re offline. Please check your connection and try again.");
    this.name = "NetworkError";
    this.cause = cause;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const idToken = await auth.currentUser?.getIdToken();

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        ...init?.headers,
      },
    });
  } catch (err) {
    // `fetch` rejects only when the request never left — an HTTP error status
    // resolves normally.
    throw new NetworkError(err);
  }

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
