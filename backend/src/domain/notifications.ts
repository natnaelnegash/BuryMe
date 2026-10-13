import { prisma } from "../db/client.js";
import { Prisma } from "../generated/prisma/client.js";
import { emitToUser } from "../config/socket.js";
import { sendPush } from "../config/push.js";
import {
  referenceTypeFor,
  renderNotification,
  type CatalogParams,
  type NotificationType,
} from "./notificationCatalog.js";

// Never throws: several call sites build params outside notify()'s catch.
export function etb(amount: Prisma.Decimal | number | null | undefined): string {
  const value =
    typeof amount === "number"
      ? amount
      : typeof (amount as Prisma.Decimal | null)?.toNumber === "function"
        ? (amount as Prisma.Decimal).toNumber()
        : 0;
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 2 })} ETB`;
}

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  params: CatalogParams;
  referenceId?: string | null;
  dedupeKey?: string;
}

export async function notify(input: NotifyInput): Promise<void> {
  try {
    const { title, body } = renderNotification(input.type, input.params);
    const referenceType = referenceTypeFor(input.type);

    const notification = await prisma.notification.create({
      data: {
        userId: input.userId,
        notificationType: input.type,
        title,
        body,
        referenceId: referenceType ? (input.referenceId ?? null) : null,
        referenceType,
        ...(input.dedupeKey ? { dedupeKey: input.dedupeKey } : {}),
      },
    });

    emitToUser(input.userId, "notification:new", {
      notification_id: notification.id,
      notification_type: notification.notificationType,
      title: notification.title,
      body: notification.body,
      reference_id: notification.referenceId,
      reference_type: notification.referenceType,
      is_read: notification.isRead,
      created_at: notification.createdAt.toISOString(),
    });

    const delivered = await sendPush(input.userId, input.type, { title, body });
    if (delivered) {
      await prisma.notification.update({
        where: { id: notification.id },
        data: { deliveredAt: new Date() },
      });
    }
  } catch (err) {
    if (isDuplicateKey(err)) return;
    console.error("Notification failed:", err);
  }
}

function isDuplicateKey(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}

export async function notifyChapaConfirmed(paymentId: string): Promise<void> {
  try {
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: { payer: true, recipient: true, obligation: true },
    });
    if (!payment) return;

    const amount = etb(payment.amount);

    if (payment.paymentDirection === "Disbursement") {
      await notifyBoth(
        [payment.payerId, payment.recipientId],
        "LR-05",
        () => ({ name: payment.payer.displayName, amount }),
        payment.obligationId,
      );
      return;
    }

    const outstanding = etb(payment.obligation.outstandingBalance);
    await Promise.all([
      notify({
        userId: payment.payerId,
        type: "PAY-01",
        params: { amount, outstanding },
        referenceId: payment.obligationId,
      }),
      notify({
        userId: payment.recipientId,
        type: "PAY-02",
        params: { name: payment.payer.displayName, amount, outstanding },
        referenceId: payment.obligationId,
      }),
    ]);

    await notifySettledIfCleared(payment.obligationId);
  } catch (err) {
    console.error("Chapa confirmation notification failed:", err);
  }
}

export async function notifySettledIfCleared(obligationId: string): Promise<void> {
  try {
    const obligation = await prisma.obligation.findUnique({
      where: { id: obligationId },
      include: { borrower: true, lender: true },
    });
    if (!obligation || obligation.status !== "Settled") return;

    await notifyBoth(
      [obligation.borrowerId, obligation.lenderId],
      "PAY-07",
      (userId) => ({
        name:
          userId === obligation.borrowerId
            ? obligation.lender.displayName
            : obligation.borrower.displayName,
        principal: etb(obligation.principalAmount),
      }),
      obligation.id,
    );
  } catch (err) {
    console.error("Settled notification failed:", err);
  }
}

export async function notifyBoth(
  userIds: [string, string],
  type: NotificationType,
  paramsFor: (userId: string) => CatalogParams,
  referenceId?: string | null,
): Promise<void> {
  await Promise.all(
    userIds.map((userId) =>
      notify({ userId, type, params: paramsFor(userId), referenceId: referenceId ?? null }),
    ),
  );
}
