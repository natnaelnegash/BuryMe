-- CreateEnum
CREATE TYPE "RequestType" AS ENUM ('Borrow', 'Lend', 'Repayment');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('Pending', 'Countered', 'Accepted', 'Declined', 'Cancelled');

-- CreateEnum
CREATE TYPE "RepaymentType" AS ENUM ('Lump Sum', 'Installments');

-- CreateEnum
CREATE TYPE "DisbursementMethod" AS ENUM ('Already Given', 'Through App');

-- CreateEnum
CREATE TYPE "ObligationStatus" AS ENUM ('Pending Disbursement', 'Active', 'Partially Paid', 'Settled', 'Disputed');

-- CreateTable
CREATE TABLE "requests" (
    "id" TEXT NOT NULL,
    "request_type" "RequestType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "purpose" TEXT,
    "proposed_repayment_type" "RepaymentType",
    "proposed_schedule" JSONB,
    "proposed_due_date" DATE,
    "disbursement_method" "DisbursementMethod",
    "counter_proposal" JSONB,
    "installment_id" TEXT,
    "note" TEXT,
    "status" "RequestStatus" NOT NULL DEFAULT 'Pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMP(3),
    "initiating_user_id" TEXT NOT NULL,
    "receiving_user_id" TEXT NOT NULL,
    "obligation_id" TEXT,

    CONSTRAINT "requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "obligations" (
    "id" TEXT NOT NULL,
    "principal_amount" DECIMAL(12,2) NOT NULL,
    "outstanding_balance" DECIMAL(12,2) NOT NULL,
    "purpose" TEXT NOT NULL,
    "repayment_type" "RepaymentType" NOT NULL,
    "disbursement_method" "DisbursementMethod" NOT NULL,
    "due_date" DATE NOT NULL,
    "status" "ObligationStatus" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settled_at" TIMESTAMP(3),
    "borrower_id" TEXT NOT NULL,
    "lender_id" TEXT NOT NULL,
    "originating_request_id" TEXT,

    CONSTRAINT "obligations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "obligations_originating_request_id_key" ON "obligations"("originating_request_id");

-- AddForeignKey
ALTER TABLE "requests" ADD CONSTRAINT "requests_initiating_user_id_fkey" FOREIGN KEY ("initiating_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requests" ADD CONSTRAINT "requests_receiving_user_id_fkey" FOREIGN KEY ("receiving_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requests" ADD CONSTRAINT "requests_obligation_id_fkey" FOREIGN KEY ("obligation_id") REFERENCES "obligations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "obligations" ADD CONSTRAINT "obligations_borrower_id_fkey" FOREIGN KEY ("borrower_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "obligations" ADD CONSTRAINT "obligations_lender_id_fkey" FOREIGN KEY ("lender_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "obligations" ADD CONSTRAINT "obligations_originating_request_id_fkey" FOREIGN KEY ("originating_request_id") REFERENCES "requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
