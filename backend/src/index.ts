import { createServer } from "node:http";

import { app } from "./app.js";
import { env } from "./config/env.js";
import { initSocket } from "./config/socket.js";
import { startReminderScheduler } from "./lib/reminders.js";

// Express no longer listens directly: Socket.io needs the underlying HTTP
// server so the real-time layer and the REST API share one port.
const httpServer = createServer(app);
initSocket(httpServer);

// §13.3's reminders are time-triggered, so something has to look. This is
// an in-process interval: fine for one API instance, but it would fire once
// per instance if this is ever scaled out, and it would want extracting to
// a single worker at that point.
startReminderScheduler();

httpServer.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`buryme-backend listening on :${env.port} (REST + Socket.io)`);
});
