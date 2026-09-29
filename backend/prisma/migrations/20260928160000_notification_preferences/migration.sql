-- AlterTable
ALTER TABLE "users" DROP COLUMN "push_enabled",
ADD COLUMN     "pref_group_expenses" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pref_payments" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "pref_reminders" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pref_requests" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "pref_schedules" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "pref_settlements" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "pref_telebirr" BOOLEAN NOT NULL DEFAULT true;

