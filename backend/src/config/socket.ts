import type { Server as HttpServer } from "node:http";

import { Server, type Socket } from "socket.io";

import { auth } from "./firebase.js";

// Socket.io real-time layer (§13). The PRD's §13.2 catalog names the events
// but not the socket channel, so the wire format is defined here:
//
//   - the client connects with its Firebase ID token in `auth.token`
//   - the server verifies it exactly as the REST middleware does and joins
//     the socket to a private room named `user:<uid>`
//   - notifications are emitted to that room as `notification:new`
//
// Rooms are per-user rather than broadcast because every notification in
// the catalog is addressed to one recipient. A client never subscribes to
// anything; the room is chosen from the verified token, so one user cannot
// listen to another's feed by asking.

let io: Server | null = null;

export const USER_ROOM = (uid: string) => `user:${uid}`;

export function initSocket(httpServer: HttpServer): Server {
  // Mirrors the REST layer's `app.use(cors())` — open, and tightened in
  // one place when that is.
  io = new Server(httpServer, { cors: { origin: true, credentials: true } });

  io.use(async (socket: Socket, next) => {
    try {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) {
        next(new Error("UNAUTHENTICATED"));
        return;
      }
      const decoded = await auth.verifyIdToken(token);
      socket.data.uid = decoded.uid;
      next();
    } catch {
      // Same posture as the REST middleware: a bad token is rejected
      // without saying why.
      next(new Error("UNAUTHENTICATED"));
    }
  });

  io.on("connection", (socket: Socket) => {
    const uid = socket.data.uid as string;
    void socket.join(USER_ROOM(uid));
  });

  return io;
}

// No-op when the server isn't running under a socket-enabled process —
// tests import the Express app directly, and a missing real-time layer must
// never break the request that raised the notification.
export function emitToUser(uid: string, event: string, payload: unknown): void {
  io?.to(USER_ROOM(uid)).emit(event, payload);
}
