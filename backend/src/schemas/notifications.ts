import { z } from "zod";

// Notifications (§8.11).

// Omitting `notification_ids` marks the whole feed read, per the contract.
export const markNotificationsReadSchema = z.object({
  notification_ids: z.array(z.string().min(1)).optional(),
});

// Every switch is optional: PATCH leaves omitted categories alone.
export const notificationPreferencesSchema = z.object({
  requests: z.boolean().optional(),
  group_expenses: z.boolean().optional(),
  payments: z.boolean().optional(),
  schedules: z.boolean().optional(),
  settlements: z.boolean().optional(),
  reminders: z.boolean().optional(),
  telebirr: z.boolean().optional(),
});
