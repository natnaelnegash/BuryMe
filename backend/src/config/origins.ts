// The one place that resolves WEB_ORIGIN, read by three callers that must
// agree: the REST CORS allow-list (app.ts), the Socket.io CORS allow-list
// (config/socket.ts) and Chapa's hosted-checkout return URL
// (config/chapa.ts).
//
// Deliberately free of side effects — unlike config/env.ts, whose exported
// `env` object validates required variables at import time, which route
// tests (mocked DB, no real environment) must not trigger.

/** Origin of the web client, with any trailing slash removed. */
export function webOrigin(): string {
  return (process.env.WEB_ORIGIN || "http://localhost:5173").replace(/\/$/, "");
}
