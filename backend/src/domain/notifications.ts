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

// Raising a notification (§8.11, §13.2). One call persists the row, pushes
// it down the recipient's socket and sends an FCM message — in that order,
// because the feed is the durable record and the other two are best-effort
// delivery on top of it.
//
// Nothing here throws into the caller: a notification failing must never
// roll back the business action that triggered it. A lender should not lose
// a confirmed payment because FCM was briefly unreachable.

// The catalog writes every money value as "1,200 ETB", so amounts are
// formatted once here rather than at each call site. Reads Decimals through
// `toNumber()` the same way serializers/money.ts does, and never throws:
// several call sites build their params outside notify()'s error handling,
// and a missing amount must not take down the request that raised it.
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
  /** The entity to open; the catalog decides its type. */
  referenceId?: string | null;
  /**
   * Timed reminders only (§13.3). The sweep re-evaluates the same rows every
   * run, so each reminder names the occasion it is for ("RS-04:<id>:3") and
   * the unique index makes a second send a no-op.
   */
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

    // Best-effort delivery. `deliveredAt` records the push attempt, not a
    // read receipt.
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
    // A duplicate dedupe key means this reminder already went out on an
    // earlier sweep — expected, not a failure.
    if (isDuplicateKey(err)) return;
    console.error("Notification failed:", err);
  }
}

function isDuplicateKey(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}

// A confirmed Chapa payment. A disbursement lands as LR-05 to both parties
// ("funds sent — obligation active"); a repayment as PAY-01 to the payer
// and PAY-02 to the recipient, both quoting what's left. Reads the rows
// back after the confirming transaction so the balances it quotes are the
// post-payment ones.
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

// PAY-07: raised when a confirmed payment is the one that clears the
// balance. Call it immediately after the transaction that might have
// settled the obligation — it reads the row back and stays quiet unless the
// status actually reached Settled.
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

// Several catalog events go to both parties with the same copy (LR-03,
// LR-05, PAY-07, BSS-03, BSS-04, BSS-05). The params differ per recipient
// though — each sees the *other* party's name — so this takes a resolver
// rather than one shared params object.
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
