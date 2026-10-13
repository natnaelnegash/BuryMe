import { createServer } from "node:http";

import { app } from "./app.js";
import { env, assertRuntimeConfig } from "./config/env.js";
import { initSocket } from "./config/socket.js";
import { prisma } from "./db/client.js";
import { startReminderScheduler } from "./domain/reminders.js";

assertRuntimeConfig();

const httpServer = createServer(app);
const io = initSocket(httpServer);

const stopReminders = startReminderScheduler();

httpServer.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`buryme-backend listening on :${env.port} (REST + Socket.io)`);
});

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
