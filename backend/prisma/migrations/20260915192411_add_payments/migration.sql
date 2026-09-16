-- CreateEnum
CREATE TYPE "PaymentDirection" AS ENUM ('Disbursement', 'Repayment');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('Chapa', 'External');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('Pending Acknowledgement', 'Confirmed', 'Disputed', 'Failed');

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "payment_direction" "PaymentDirection" NOT NULL,
    "payment_method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'Pending Acknowledgement',
    "installment_id" TEXT,
    "recorded_by_user_id" TEXT,
    "external_method_note" TEXT,
    "chapa_transaction_id" TEXT,
    "checkout_url" TEXT,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMP(3),
    "obligation_id" TEXT NOT NULL,
    "payer_id" TEXT NOT NULL,
    "recipient_id" TEXT NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payments_chapa_transaction_id_key" ON "payments"("chapa_transaction_id");

-- CreateIndex
CREATE INDEX "payments_obligation_id_idx" ON "payments"("obligation_id");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_obligation_id_fkey" FOREIGN KEY ("obligation_id") REFERENCES "obligations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_payer_id_fkey" FOREIGN KEY ("payer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
