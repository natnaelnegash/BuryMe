import type { Server as HttpServer } from "node:http";

import { Server, type Socket } from "socket.io";

import { auth } from "./firebase.js";
import { webOrigin } from "./origins.js";

let io: Server | null = null;

export const USER_ROOM = (uid: string) => `user:${uid}`;

export function initSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, { cors: { origin: webOrigin(), credentials: true } });

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
      next(new Error("UNAUTHENTICATED"));
    }
  });

  io.on("connection", (socket: Socket) => {
    const uid = socket.data.uid as string;
    void socket.join(USER_ROOM(uid));
  });

  return io;
}

// No-ops when no socket server is running: tests import the Express app
// directly, and a missing real-time layer must never break the request that
// raised the notification.
export function emitToUser(uid: string, event: string, payload: unknown): void {
  io?.to(USER_ROOM(uid)).emit(event, payload);
}
