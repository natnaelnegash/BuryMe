-- CreateEnum
CREATE TYPE "SettlementResponse" AS ENUM ('Pending', 'Accepted', 'Declined');

-- CreateTable
CREATE TABLE "settlement_suggestions" (
    "id" TEXT NOT NULL,
    "net_amount" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "user_a_id" TEXT NOT NULL,
    "user_b_id" TEXT NOT NULL,
    "obligation_a_id" TEXT NOT NULL,
    "obligation_b_id" TEXT NOT NULL,
    "net_payer_id" TEXT NOT NULL,
    "net_recipient_id" TEXT NOT NULL,
    "user_a_response" "SettlementResponse" NOT NULL DEFAULT 'Pending',
    "user_b_response" "SettlementResponse" NOT NULL DEFAULT 'Pending',
    "status" "SettlementResponse" NOT NULL DEFAULT 'Pending',

    CONSTRAINT "settlement_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "settlement_suggestions_user_a_id_idx" ON "settlement_suggestions"("user_a_id");

-- CreateIndex
CREATE INDEX "settlement_suggestions_user_b_id_idx" ON "settlement_suggestions"("user_b_id");

-- AddForeignKey
ALTER TABLE "settlement_suggestions" ADD CONSTRAINT "settlement_suggestions_user_a_id_fkey" FOREIGN KEY ("user_a_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_suggestions" ADD CONSTRAINT "settlement_suggestions_user_b_id_fkey" FOREIGN KEY ("user_b_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_suggestions" ADD CONSTRAINT "settlement_suggestions_obligation_a_id_fkey" FOREIGN KEY ("obligation_a_id") REFERENCES "obligations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_suggestions" ADD CONSTRAINT "settlement_suggestions_obligation_b_id_fkey" FOREIGN KEY ("obligation_b_id") REFERENCES "obligations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_suggestions" ADD CONSTRAINT "settlement_suggestions_net_payer_id_fkey" FOREIGN KEY ("net_payer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_suggestions" ADD CONSTRAINT "settlement_suggestions_net_recipient_id_fkey" FOREIGN KEY ("net_recipient_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

