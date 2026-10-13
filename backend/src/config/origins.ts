// Read by three callers that must agree — REST CORS, Socket.io CORS, and
// Chapa's checkout return URL. Kept free of side effects, unlike
// config/env.ts, whose exported `env` validates at import.
export function webOrigin(): string {
  return (process.env.WEB_ORIGIN || "http://localhost:5173").replace(/\/$/, "");
}
