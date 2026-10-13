import { getChapaClient } from "../config/chapa.js";
import { prisma } from "../db/client.js";
import type { Payment } from "../generated/prisma/client.js";

// Second hop of a Chapa payment: once the checkout webhook confirms the
// payer's money landed in BuryMe's merchant balance, push it on to the
// recipient's verified Telebirr. Shared by the checkout webhook (Slice 4,
// disbursements → borrower) and, from Slice 5, repayments → lender.
//
// The Payment stays Pending Acknowledgement; the transfer webhook is what
// finally confirms it. A transfer that can't even be started is marked
// Failed so the payer can retry from the start.
export async function startTransferForPayment(payment: Payment): Promise<void> {
  const [recipient, telebirr] = await Promise.all([
    prisma.user.findUnique({ where: { id: payment.recipientId } }),
    prisma.telebirrAccount.findUnique({ where: { userId: payment.recipientId } }),
  ]);
  if (!recipient || telebirr?.verificationStatus !== "Verified" || !telebirr.telebirrNumber) {
    // Verified at /disburse time; if it changed since, don't send money to
    // an unverified number — fail the payment for a retry after re-verifying.
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "Failed" } });
    return;
  }

  try {
    const { transferId } = await getChapaClient().initiateTransfer({
      amount: payment.amount.toNumber(),
      currency: "ETB",
      accountNumber: telebirr.telebirrNumber,
      reference: payment.id,
      beneficiaryName: recipient.displayName,
    });
    await prisma.payment.update({
      where: { id: payment.id },
      data: { chapaTransactionId: transferId },
    });
  } catch (err) {
    console.error("Chapa transfer failed:", err instanceof Error ? err.message : err);
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "Failed" } });
  }
}
