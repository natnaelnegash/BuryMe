import { describe, expect, it } from "vitest";
import type { Schemas } from "@buryme/shared";

import { isOverdue, obligationDirection } from "./obligations.js";

function obligation(overrides: Partial<Schemas["Obligation"]> = {}): Schemas["Obligation"] {
  return {
    obligation_id: "obl-1",
    borrower: { user_id: "u-borrower", display_name: "Borrower", profile_photo_url: null },
    lender: { user_id: "u-lender", display_name: "Lender", profile_photo_url: null },
    originating_request_id: "req-1",
    originating_expense_id: null,
    principal_amount: { amount: 500, currency: "ETB" },
    outstanding_balance: { amount: 500, currency: "ETB" },
    purpose: "Loan",
    repayment_type: "Lump Sum",
    disbursement_method: "Already Given",
    due_date: "2020-01-01",
    status: "Active",
    created_at: "2019-12-01T00:00:00.000Z",
    settled_at: null,
    ...overrides,
  };
}

describe("obligationDirection", () => {
  it("reads from the viewer's side of the obligation", () => {
    expect(obligationDirection(obligation(), "u-lender")).toBe("owed");
    expect(obligationDirection(obligation(), "u-borrower")).toBe("owe");
    expect(obligationDirection(obligation(), "u-bystander")).toBe("self");
  });
});

describe("isOverdue", () => {
  it("is true only for an Active obligation past its due date with a balance left", () => {
    expect(isOverdue(obligation())).toBe(true);
    expect(isOverdue(obligation({ due_date: "2099-01-01" }))).toBe(false);
    expect(isOverdue(obligation({ status: "Settled" }))).toBe(false);
    expect(isOverdue(obligation({ status: "Pending Disbursement" }))).toBe(false);
  });

  it("is false once the balance reaches zero, whatever the due date", () => {
    expect(isOverdue(obligation({ outstanding_balance: { amount: 0, currency: "ETB" } }))).toBe(
      false,
    );
  });
});
