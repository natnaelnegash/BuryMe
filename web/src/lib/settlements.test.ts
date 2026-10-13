import { describe, expect, it } from "vitest";
import type { Schemas } from "@buryme/shared";

import { settleablePairs } from "./settlements.js";

const ME = "u-me";
const THEM = "u-them";

function user(id: string): Schemas["UserSummary"] {
  return { user_id: id, display_name: `User ${id}`, profile_photo_url: null };
}

function obligation(
  lenderId: string,
  borrowerId: string,
  outstanding: number,
  overrides: Partial<Schemas["Obligation"]> = {},
): Schemas["Obligation"] {
  return {
    obligation_id: `obl-${lenderId}-${borrowerId}-${outstanding}`,
    borrower: user(borrowerId),
    lender: user(lenderId),
    originating_request_id: "req-1",
    originating_expense_id: null,
    principal_amount: { amount: outstanding, currency: "ETB" },
    outstanding_balance: { amount: outstanding, currency: "ETB" },
    purpose: "Loan",
    repayment_type: "Lump Sum",
    disbursement_method: "Already Given",
    due_date: "2026-12-01",
    status: "Active",
    created_at: "2026-10-01T00:00:00.000Z",
    settled_at: null,
    ...overrides,
  };
}

describe("settleablePairs", () => {
  it("nets a reciprocal pair towards whoever is owed more", () => {
    const pairs = settleablePairs([obligation(ME, THEM, 800), obligation(THEM, ME, 500)], ME);
    expect(pairs).toEqual([
      { counterparty: user(THEM), netAmount: { amount: 300, currency: "ETB" }, netIncoming: true },
    ]);
  });

  it("reports an outgoing net as a positive amount", () => {
    const pairs = settleablePairs([obligation(ME, THEM, 200), obligation(THEM, ME, 900)], ME);
    expect(pairs[0]?.netIncoming).toBe(false);
    expect(pairs[0]?.netAmount.amount).toBe(700);
  });

  it("rounds away floating-point noise", () => {
    const pairs = settleablePairs([obligation(ME, THEM, 300.55), obligation(THEM, ME, 100.3)], ME);
    expect(pairs[0]?.netAmount.amount).toBe(200.25);
  });

  it("needs debt in both directions", () => {
    expect(settleablePairs([obligation(ME, THEM, 800)], ME)).toEqual([]);
  });

  it("skips a pair where either side is paid in installments", () => {
    const installments = obligation(THEM, ME, 500, { repayment_type: "Installments" });
    expect(settleablePairs([obligation(ME, THEM, 800), installments], ME)).toEqual([]);
  });

  it("skips a counterparty with more than one obligation in a direction", () => {
    const pairs = settleablePairs(
      [obligation(ME, THEM, 800), obligation(ME, THEM, 100), obligation(THEM, ME, 500)],
      ME,
    );
    expect(pairs).toEqual([]);
  });

  it("ignores obligations that are not yet or no longer open", () => {
    const settled = obligation(THEM, ME, 500, { status: "Settled" });
    const undisbursed = obligation(THEM, ME, 500, { status: "Pending Disbursement" });
    expect(settleablePairs([obligation(ME, THEM, 800), settled], ME)).toEqual([]);
    expect(settleablePairs([obligation(ME, THEM, 800), undisbursed], ME)).toEqual([]);
  });

  it("counts a Partially Paid obligation as open", () => {
    const partly = obligation(THEM, ME, 500, { status: "Partially Paid" });
    expect(settleablePairs([obligation(ME, THEM, 800), partly], ME)).toHaveLength(1);
  });

  it("returns nothing for a signed-out viewer", () => {
    expect(
      settleablePairs([obligation(ME, THEM, 800), obligation(THEM, ME, 500)], undefined),
    ).toEqual([]);
  });
});
