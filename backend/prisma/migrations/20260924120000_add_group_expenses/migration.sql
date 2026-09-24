-- AlterTable
ALTER TABLE "obligations" ADD COLUMN     "originating_expense_id" TEXT;

-- CreateTable
CREATE TABLE "group_expenses" (
    "id" TEXT NOT NULL,
    "total_amount" DECIMAL(12,2) NOT NULL,
    "description" TEXT NOT NULL,
    "expense_date" DATE NOT NULL,
    "due_date" DATE NOT NULL,
    "payer_share_included" BOOLEAN NOT NULL,
    "payer_share_amount" DECIMAL(12,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payer_id" TEXT NOT NULL,

    CONSTRAINT "group_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_expense_participants" (
    "id" TEXT NOT NULL,
    "assigned_amount" DECIMAL(12,2) NOT NULL,
    "expense_id" TEXT NOT NULL,
    "participant_id" TEXT NOT NULL,

    CONSTRAINT "group_expense_participants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "group_expense_participants_expense_id_idx" ON "group_expense_participants"("expense_id");

-- CreateIndex
CREATE UNIQUE INDEX "group_expense_participants_expense_id_participant_id_key" ON "group_expense_participants"("expense_id", "participant_id");

-- CreateIndex
CREATE UNIQUE INDEX "obligations_originating_expense_id_key" ON "obligations"("originating_expense_id");

-- AddForeignKey
ALTER TABLE "obligations" ADD CONSTRAINT "obligations_originating_expense_id_fkey" FOREIGN KEY ("originating_expense_id") REFERENCES "group_expense_participants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_expenses" ADD CONSTRAINT "group_expenses_payer_id_fkey" FOREIGN KEY ("payer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_expense_participants" ADD CONSTRAINT "group_expense_participants_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "group_expenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_expense_participants" ADD CONSTRAINT "group_expense_participants_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

