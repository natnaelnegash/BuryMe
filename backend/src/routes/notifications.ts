import { Router } from "express";

import { prisma } from "../db/client.js";
import {
  markNotificationsReadSchema,
  notificationPreferencesSchema,
} from "../schemas/notifications.js";
import { parseBody } from "../schemas/parse.js";
import { requireAuth } from "../middleware/auth.js";
import { toNotificationPreferencesResponse } from "../domain/notificationPrefs.js";
import { toNotificationResponse } from "../serializers/notification.js";

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);

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

notificationsRouter.patch("/preferences", async (req, res, next) => {
  try {
    const uid = req.auth!.uid;
    const body = parseBody(notificationPreferencesSchema, req.body ?? {});

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
