import type { Schemas } from "@buryme/shared";

import type { User } from "../generated/prisma/client.js";
import type { NotificationType } from "./notificationCatalog.js";

export type PreferenceKey = keyof Schemas["NotificationPreferences"];

const BY_PREFIX: Record<string, PreferenceKey> = {
  BR: "requests",
  RR: "requests",
  LR: "requests",
  GE: "group_expenses",
  PAY: "payments",
  BSS: "settlements",
  TB: "telebirr",
  REM: "reminders",
};

const RS_REMINDERS = new Set<NotificationType>(["RS-04", "RS-05", "RS-06"]);

export function categoryOf(type: NotificationType): PreferenceKey | null {
  if (type.startsWith("RS-")) {
    return RS_REMINDERS.has(type) ? "reminders" : "schedules";
  }
  const prefix = type.split("-")[0]!;
  return BY_PREFIX[prefix] ?? null;
}

const COLUMN: Record<PreferenceKey, keyof User> = {
  requests: "prefRequests",
  group_expenses: "prefGroupExpenses",
  payments: "prefPayments",
  schedules: "prefSchedules",
  settlements: "prefSettlements",
  reminders: "prefReminders",
  telebirr: "prefTelebirr",
};

export function wantsPush(user: User, type: NotificationType): boolean {
  const key = categoryOf(type);
  if (!key) return true;
  return user[COLUMN[key]] === true;
}

export function toNotificationPreferencesResponse(user: User): Schemas["NotificationPreferences"] {
  return {
    requests: user.prefRequests,
    group_expenses: user.prefGroupExpenses,
    payments: user.prefPayments,
    schedules: user.prefSchedules,
    settlements: user.prefSettlements,
    reminders: user.prefReminders,
    telebirr: user.prefTelebirr,
  };
}
