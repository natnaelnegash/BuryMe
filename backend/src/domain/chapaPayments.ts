import { getChapaClient } from "../config/chapa.js";
import { prisma } from "../db/client.js";
import type { Payment } from "../generated/prisma/client.js";

// Telebirr is re-read here, not trusted from /disburse time: if it changed
// since, the money must not go to the old number.
export async function startTransferForPayment(payment: Payment): Promise<void> {
  const [recipient, telebirr] = await Promise.all([
    prisma.user.findUnique({ where: { id: payment.recipientId } }),
    prisma.telebirrAccount.findUnique({ where: { userId: payment.recipientId } }),
  ]);
  if (!recipient || telebirr?.verificationStatus !== "Verified" || !telebirr.telebirrNumber) {
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
