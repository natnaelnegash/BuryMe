import type { Schemas } from "@buryme/shared";

// PRD §13.2 Notification Event Catalog, transcribed verbatim. Each entry
// owns its Title and Body copy so the wording lives in exactly one place —
// the web feed, the Flutter app and the FCM push payload all render from
// what this produces, rather than each reimplementing forty templates.
//
// Only the ids listed in `EMITTED` below actually fire today; the rest
// describe features that don't exist yet and are documented on the
// contract's NotificationType enum.

export type NotificationType = Schemas["NotificationType"];
export type ReferenceType = Schemas["NotificationReferenceType"];

export interface NotificationContent {
  title: string;
  body: string;
}

// Values the catalog interpolates. Everything is optional because each
// template uses its own subset; a template only ever reads what its row in
// §13.2 names.
export interface CatalogParams {
  name?: string;
  amount?: string;
  outstanding?: string;
  principal?: string;
  date?: string;
  description?: string;
  direction?: "Disbursement" | "Repayment";
  days?: number;
}

type Template = (p: CatalogParams) => NotificationContent;

const CATALOG: Partial<Record<NotificationType, Template>> = {
  // ── Telebirr Account Setup (6.1.6) ──────────────────────────────────
  "TB-01": (p) => ({
    title: "Set up Telebirr to receive funds",
    body: `Someone is ready to send you ${p.amount} through the app. Verify your Telebirr number to receive it.`,
  }),
  "TB-02": () => ({
    title: "Telebirr verified",
    body: "Your Telebirr account is verified. Pending payments can now be sent to you.",
  }),

  // ── Borrowing Requests (6.2.1) ──────────────────────────────────────
  "BR-01": (p) => ({
    title: "New Borrow Request",
    body: `${p.name} is requesting ${p.amount}. Tap to review.`,
  }),
  "BR-02": (p) => ({
    title: "Request Accepted",
    body: `${p.name} accepted your request for ${p.amount}. Your obligation is now active.`,
  }),
  "BR-03": (p) => ({
    title: "Request Declined",
    body: `${p.name} declined your request for ${p.amount}.`,
  }),
  "BR-04": (p) => ({
    title: "Counter-Proposal Received",
    body: `${p.name} proposed revised terms for your ${p.amount} request. Tap to review.`,
  }),
  "BR-05": (p) => ({
    title: "Counter-Proposal Accepted",
    body: `${p.name} accepted your counter-proposal. The obligation is now active.`,
  }),
  "BR-06": (p) => ({
    title: "Counter-Proposal Declined",
    body: `${p.name} declined your counter-proposal.`,
  }),

  // ── Repayment Requests (6.2.2) ──────────────────────────────────────
  "RR-01": (p) => ({
    title: "Repayment Requested",
    body: `${p.name} is requesting ${p.amount} toward your active obligation. Tap to review.`,
  }),

  // ── Group Expense Management (6.2.3) ────────────────────────────────
  "GE-01": (p) => ({
    title: "New Shared Expense",
    body: `${p.name} recorded a shared expense. You owe ${p.amount}. Tap to review.`,
  }),

  // ── Lending Records (6.2.4) ─────────────────────────────────────────
  "LR-01": (p) => ({
    title: `Lending record from ${p.name}`,
    body: `${p.name} recorded that they lent you ${p.amount}. Review and acknowledge the terms.`,
  }),
  "LR-02": (p) => ({
    title: "Revised terms proposed",
    body: `${p.name} proposed revised terms on a ${p.amount} lending record. Tap to review.`,
  }),
  "LR-03": (p) => ({
    title: "Obligation now active",
    body: `Your ${p.amount} obligation with ${p.name} is now active.`,
  }),
  "LR-04": (p) => ({
    title: "Disbursement ready to send",
    body: `${p.name} agreed to the terms. Send ${p.amount} via Chapa to activate the obligation.`,
  }),
  "LR-05": (p) => ({
    title: "Funds sent — obligation active",
    body: `${p.name} sent ${p.amount}. The obligation is now active.`,
  }),
  "LR-06": (p) => ({
    title: "Lending record declined",
    body: `${p.name} declined the lending record for ${p.amount}.`,
  }),

  // ── Chapa Payments (6.4.1) ──────────────────────────────────────────
  "PAY-01": (p) => ({
    title: "Payment Sent",
    body: `Your payment of ${p.amount} has been confirmed. ${p.outstanding} remaining.`,
  }),
  "PAY-02": (p) => ({
    title: "Payment Received",
    body: `${p.name} made a payment of ${p.amount}. ${p.outstanding} remaining.`,
  }),

  // ── External Payment Recording (6.4.2) ──────────────────────────────
  "PAY-03": (p) => ({
    title: "Payment to confirm",
    body: `${p.name} recorded an external ${p.direction} of ${p.amount}. Please confirm or dispute.`,
  }),
  "PAY-04": (p) => ({
    title: "Payment confirmed",
    body: `${p.name} confirmed the ${p.amount} external payment.`,
  }),
  "PAY-05": (p) => ({
    title: "Payment disputed",
    body: `${p.name} disputed the recorded ${p.amount} payment. Please resolve directly.`,
  }),

  // ── Obligation Settlement ───────────────────────────────────────────
  "PAY-07": (p) => ({
    title: "Obligation Settled",
    body: `The ${p.principal} obligation between you and ${p.name} has been fully settled.`,
  }),

  // ── Bilateral Settlement Suggestions (6.5.2) ────────────────────────
  "BSS-02": (p) => ({
    title: "Response Needed",
    body: `${p.name} accepted the suggested net settlement of ${p.amount}. Your response is needed.`,
  }),
  "BSS-03": (p) => ({
    title: "Settlement Completed",
    body: `Your mutual obligations with ${p.name} have been resolved. Net payment: ${p.amount}.`,
  }),
  "BSS-04": (p) => ({
    title: "Settlement Declined",
    body: `The suggested settlement with ${p.name} was declined. Your obligations remain unchanged.`,
  }),
  "BSS-05": (p) => ({
    title: "Settlement No Longer Available",
    body: `The suggested settlement with ${p.name} is no longer valid. One of the obligations has since been settled.`,
  }),
};

// Where tapping the notification should land, per the catalog's Navigation
// Target column. Null means the Dashboard.
const REFERENCE: Partial<Record<NotificationType, ReferenceType | null>> = {
  "TB-01": "TelebirrAccount",
  "TB-02": "TelebirrAccount",
  "BR-01": "Request",
  "BR-02": "Obligation",
  "BR-03": "Request",
  "BR-04": "Request",
  "BR-05": "Obligation",
  "BR-06": "Request",
  "RR-01": "Obligation",
  "GE-01": "Obligation",
  "LR-01": "Request",
  "LR-02": "Request",
  "LR-03": "Obligation",
  "LR-04": "Obligation",
  "LR-05": "Obligation",
  "LR-06": null,
  "PAY-01": "Obligation",
  "PAY-02": "Obligation",
  "PAY-03": "Payment",
  "PAY-04": "Obligation",
  "PAY-05": "Payment",
  "PAY-07": "Obligation",
  "BSS-02": "SettlementSuggestion",
  "BSS-03": "Obligation",
  "BSS-04": "Obligation",
  "BSS-05": null,
};

export function renderNotification(
  type: NotificationType,
  params: CatalogParams,
): NotificationContent {
  const template = CATALOG[type];
  if (!template) {
    throw new Error(`No §13.2 catalog entry for notification type ${type}`);
  }
  return template(params);
}

export function referenceTypeFor(type: NotificationType): ReferenceType | null {
  return REFERENCE[type] ?? null;
}
