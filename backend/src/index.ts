import { createServer } from "node:http";

import { app } from "./app.js";
import { env } from "./config/env.js";
import { initSocket } from "./config/socket.js";

// Express no longer listens directly: Socket.io needs the underlying HTTP
// server so the real-time layer and the REST API share one port.
const httpServer = createServer(app);
initSocket(httpServer);

httpServer.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`buryme-backend listening on :${env.port} (REST + Socket.io)`);
});
