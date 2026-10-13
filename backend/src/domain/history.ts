import type { Schemas } from "@buryme/shared";

import { prisma } from "../db/client.js";
import type { Obligation, Payment, Prisma, User } from "../generated/prisma/client.js";

type ObligationWithParties = Obligation & { borrower: User; lender: User };
type PaymentWithParties = Payment & { payer: User; recipient: User };

export type ObligationHistoryPayload =
  | {
      kind: "created";
      principalAmount: Prisma.Decimal;
      purpose: string;
      repaymentType: string;
      disbursementMethod: string;
      dueDate: Date;
      fromRequestId: string | null;
      fromExpenseId: string | null;
    }
  | {
      kind: "termsChanged";
      proposedAmount: Prisma.Decimal;
      proposedRepaymentType: string | null;
      proposedDueDate: Date | null;
      counterProposal: Prisma.JsonValue;
    }
  | { kind: "payment"; payment: PaymentWithParties }
  | { kind: "dispute"; payment: PaymentWithParties }
  | { kind: "settled"; clearedBy: PaymentWithParties | null };

export interface ObligationHistoryEvent {
  id: string;
  eventType: Schemas["ObligationHistoryEventType"];
  initiatedBy: User;
  occurredAt: Date;
  payload: ObligationHistoryPayload;
}

// The history is derived from the rows that already record each event rather
// than stored as its own table, so an entry's id is a stable composite of
// what it describes instead of a row id. `Schedule Accepted` never appears:
// the schedule negotiation it belongs to (RS-01/02/03) does not exist yet.
export async function loadObligationHistory(
  obligation: ObligationWithParties,
): Promise<ObligationHistoryEvent[]> {
  const [originatingRequest, payments] = await Promise.all([
    obligation.originatingRequestId
      ? prisma.request.findUnique({
          where: { id: obligation.originatingRequestId },
          include: { initiatingUser: true, receivingUser: true },
        })
      : Promise.resolve(null),
    prisma.payment.findMany({
      where: { obligationId: obligation.id },
      include: { payer: true, recipient: true },
      orderBy: { recordedAt: "asc" },
    }),
  ]);

  const events: ObligationHistoryEvent[] = [];
  const countered = originatingRequest?.counterProposal != null;

  // Terms that changed during negotiation took effect when the request was
  // accepted, which is the moment the obligation was created. The counter can
  // only have come from the receiving side — the counter endpoint refuses it
  // from anyone else.
  if (originatingRequest && countered) {
    events.push({
      id: `${obligation.id}:terms-changed`,
      eventType: "Terms Changed",
      initiatedBy: originatingRequest.receivingUser,
      occurredAt: obligation.createdAt,
      payload: {
        kind: "termsChanged",
        proposedAmount: originatingRequest.amount,
        proposedRepaymentType: originatingRequest.proposedRepaymentType,
        proposedDueDate: originatingRequest.proposedDueDate,
        counterProposal: originatingRequest.counterProposal,
      },
    });
  }

  events.push({
    id: `${obligation.id}:created`,
    eventType: "Created",
    // Acceptance is what creates the obligation: the receiving side accepts a
    // first proposal, the initiating side accepts a counter. A group expense
    // has no request — the payer, who is the lender, created it.
    initiatedBy: originatingRequest
      ? countered
        ? originatingRequest.initiatingUser
        : originatingRequest.receivingUser
      : obligation.lender,
    occurredAt: obligation.createdAt,
    payload: {
      kind: "created",
      principalAmount: obligation.principalAmount,
      purpose: obligation.purpose,
      repaymentType: obligation.repaymentType,
      disbursementMethod: obligation.disbursementMethod,
      dueDate: obligation.dueDate,
      fromRequestId: obligation.originatingRequestId,
      fromExpenseId: obligation.originatingExpenseId,
    },
  });

  for (const payment of payments) {
    if (payment.status === "Confirmed") {
      events.push({
        id: `${payment.id}:confirmed`,
        eventType: "Payment Confirmed",
        initiatedBy: payment.payer,
        occurredAt: payment.confirmedAt ?? payment.recordedAt,
        payload: { kind: "payment", payment },
      });
      continue;
    }
    if (payment.status === "Disputed") {
      events.push({
        id: `${payment.id}:disputed`,
        eventType: "Disputed",
        // Whoever did not record the payment is the one who disputed it.
        initiatedBy:
          payment.recordedByUserId === payment.payerId ? payment.recipient : payment.payer,
        // No column records when the dispute was raised, so the entry sits at
        // the disputed payment's own position in the timeline.
        occurredAt: payment.recordedAt,
        payload: { kind: "dispute", payment },
      });
    }
  }

  if (obligation.settledAt) {
    const confirmed = payments.filter((p) => p.status === "Confirmed");
    events.push({
      id: `${obligation.id}:settled`,
      eventType: "Settled",
      initiatedBy: confirmed[confirmed.length - 1]?.payer ?? obligation.borrower,
      occurredAt: obligation.settledAt,
      payload: { kind: "settled", clearedBy: confirmed[confirmed.length - 1] ?? null },
    });
  }

  // Oldest first, per the contract. The sort is stable, so the events built
  // above for the same instant — Terms Changed then Created — keep that order.
  return events.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
}
