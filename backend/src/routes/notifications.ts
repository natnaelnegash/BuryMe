import { Router } from "express";

import { prisma } from "../db/client.js";
import {
  markNotificationsReadSchema,
  notificationPreferencesSchema,
  parseBody,
} from "../lib/validation.js";
import { requireAuth } from "../middleware/auth.js";
import { toNotificationPreferencesResponse } from "../lib/notificationPrefs.js";
import { toNotificationResponse } from "../serializers/notification.js";

// In-app notification feed and read state (§6.1.5, §8.11). Notifications
// are raised by lib/notifications.ts wherever the triggering event happens;
// this router only reads them back and marks them read.
export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);

// GET /notifications — contract: listNotifications. Newest first.
notificationsRouter.get("/", async (req, res, next) => {
  try {
    const uid = req.auth!.uid;
    const { limit, cursor } = req.query as Record<string, string | undefined>;

    const take = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const notifications = await prisma.notification.findMany({
      where: { userId: uid },
      orderBy: { createdAt: "desc" },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = notifications.length > take;
    const page = hasMore ? notifications.slice(0, take) : notifications;
    res.status(200).json({
      data: page.map(toNotificationResponse),
      next_cursor: hasMore ? page[page.length - 1]!.id : null,
    });
  } catch (err) {
    next(err);
  }
});

// POST /notifications/read — contract: markNotificationsRead. An omitted
// `notification_ids` marks the whole feed read. Always scoped to the
// caller, so passing someone else's id silently marks nothing rather than
// leaking whether it exists.
notificationsRouter.post("/read", async (req, res, next) => {
  try {
    const uid = req.auth!.uid;
    const body = parseBody(markNotificationsReadSchema, req.body ?? {});

    await prisma.notification.updateMany({
      where: {
        userId: uid,
        isRead: false,
        ...(body.notification_ids ? { id: { in: body.notification_ids } } : {}),
      },
      data: { isRead: true },
    });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// PATCH /notifications/preferences — contract: updateNotificationPreferences.
// One switch per §13.2 event family, matching the seven rows of the
// preferences screen (66:744).
notificationsRouter.patch("/preferences", async (req, res, next) => {
  try {
    const uid = req.auth!.uid;
    const body = parseBody(notificationPreferencesSchema, req.body ?? {});

    // PATCH semantics: only the switches actually present are touched.
    const user = await prisma.user.update({
      where: { id: uid },
      data: {
        ...(body.requests === undefined ? {} : { prefRequests: body.requests }),
        ...(body.group_expenses === undefined ? {} : { prefGroupExpenses: body.group_expenses }),
        ...(body.payments === undefined ? {} : { prefPayments: body.payments }),
        ...(body.schedules === undefined ? {} : { prefSchedules: body.schedules }),
        ...(body.settlements === undefined ? {} : { prefSettlements: body.settlements }),
        ...(body.reminders === undefined ? {} : { prefReminders: body.reminders }),
        ...(body.telebirr === undefined ? {} : { prefTelebirr: body.telebirr }),
      },
    });

    res.status(200).json(toNotificationPreferencesResponse(user));
  } catch (err) {
    next(err);
  }
});
