import { createServer } from "node:http";

import { app } from "./app.js";
import { env, assertRuntimeConfig } from "./config/env.js";
import { initSocket } from "./config/socket.js";
import { prisma } from "./db/client.js";
import { startReminderScheduler } from "./lib/reminders.js";

// Fail before binding a port rather than at the first Chapa call, so a
// misconfigured deploy shows up as a failed release instead of a payment
// that silently went nowhere.
assertRuntimeConfig();

// Express no longer listens directly: Socket.io needs the underlying HTTP
// server so the real-time layer and the REST API share one port.
const httpServer = createServer(app);
const io = initSocket(httpServer);

// §13.3's reminders are time-triggered, so something has to look. This is
// an in-process interval: fine for one API instance, but it would fire once
// per instance if this is ever scaled out, and it would want extracting to
// a single worker at that point.
const stopReminders = startReminderScheduler();

httpServer.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`buryme-backend listening on :${env.port} (REST + Socket.io)`);
});

// A redeploy sends SIGTERM and then kills the process. Without this, that
// drops in-flight requests and open sockets mid-write, and leaves Postgres
// to time the connections out on its own.
let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  // eslint-disable-next-line no-console
  console.log(`${signal} received — shutting down`);

  stopReminders();
  io.close();
  httpServer.close();

  try {
    await prisma.$disconnect();
  } catch (err) {
    console.error("Error disconnecting Prisma:", err);
  }
}

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => void shutdown(signal));
}
