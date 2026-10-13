import type { Schemas } from "@buryme/shared";

type Obligation = Schemas["Obligation"];

export interface SettleablePair {
  counterparty: Schemas["UserSummary"];
  netAmount: Schemas["Money"];
  netIncoming: boolean;
}

const OPEN = ["Active", "Partially Paid"];

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
    if (!mine || mine.length !== 1 || theirs.length !== 1) continue;
    const them = theirs[0]!;
    const you = mine[0]!;
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
