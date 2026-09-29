import type { Schemas } from "@buryme/shared";

// Display helpers for the Dashboard's "Needs your action" list. The
// authoritative pairing and netting rules live in the backend
// (`lib/settlement.ts`); everything here only decides what to offer, and a
// wrong guess is refused by the server on submit.

type Obligation = Schemas["Obligation"];

export interface SettleablePair {
  counterparty: Schemas["UserSummary"];
  /** What they still owe the viewer, minus what the viewer owes them. */
  netAmount: Schemas["Money"];
  /** Whether the net lands in the viewer's pocket. */
  netIncoming: boolean;
}

const OPEN = ["Active", "Partially Paid"];

// Counterparties the viewer both owes and is owed by, with exactly one open
// obligation in each direction — the same shape the backend requires.
export function settleablePairs(
  obligations: Obligation[],
  uid: string | undefined,
): SettleablePair[] {
  if (!uid) return [];
  const open = obligations.filter((o) => OPEN.includes(o.status));

  const theyOwe = new Map<string, Obligation[]>();
  const youOwe = new Map<string, Obligation[]>();
  for (const o of open) {
    if (o.lender.user_id === uid) push(theyOwe, o.borrower.user_id, o);
    else if (o.borrower.user_id === uid) push(youOwe, o.lender.user_id, o);
  }

  const pairs: SettleablePair[] = [];
  for (const [counterpartyId, theirs] of theyOwe) {
    const mine = youOwe.get(counterpartyId);
    // More than one either way is ambiguous, so it isn't offered.
    if (!mine || mine.length !== 1 || theirs.length !== 1) continue;
    const them = theirs[0]!;
    const you = mine[0]!;
    // Installment plans can't be settled this way yet.
    if (them.repayment_type === "Installments" || you.repayment_type === "Installments") continue;

    const diff = them.outstanding_balance.amount - you.outstanding_balance.amount;
    pairs.push({
      counterparty: them.borrower,
      netAmount: { amount: Math.abs(Math.round(diff * 100) / 100), currency: "ETB" },
      netIncoming: diff >= 0,
    });
  }
  return pairs;
}

function push(map: Map<string, Obligation[]>, key: string, value: Obligation) {
  const existing = map.get(key);
  if (existing) existing.push(value);
  else map.set(key, [value]);
}
