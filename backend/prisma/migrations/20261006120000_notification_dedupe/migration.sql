-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "dedupe_key" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "notifications_dedupe_key_key" ON "notifications"("dedupe_key");

