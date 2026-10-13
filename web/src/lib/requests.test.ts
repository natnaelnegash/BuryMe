import { describe, expect, it } from "vitest";
import type { Schemas } from "@buryme/shared";

import { canCancel, canCounter, canRespond, requestStatusLabel } from "./requests.js";

const INITIATOR = "u-init";
const RECEIVER = "u-recv";

function user(id: string): Schemas["UserSummary"] {
  return { user_id: id, display_name: `User ${id}`, profile_photo_url: null };
}

function request(overrides: Partial<Schemas["Request"]> = {}): Schemas["Request"] {
  return {
    request_id: "req-1",
    request_type: "Borrow",
    initiating_user: user(INITIATOR),
    receiving_user: user(RECEIVER),
    obligation_id: null,
    amount: { amount: 500, currency: "ETB" },
    purpose: "School fees",
    proposed_repayment_type: "Lump Sum",
    proposed_schedule: null,
    proposed_due_date: "2026-12-01",
    disbursement_method: null,
    counter_proposal: null,
    installment_id: null,
    note: null,
    status: "Pending",
    created_at: "2026-10-01T00:00:00.000Z",
    responded_at: null,
    ...overrides,
  };
}

describe("canRespond", () => {
  it("lets the receiver respond to a pending request", () => {
    expect(canRespond(request(), RECEIVER)).toBe(true);
    expect(canRespond(request(), INITIATOR)).toBe(false);
  });

  it("flips to the initiator once the request is countered", () => {
    const countered = request({ status: "Countered" });
    expect(canRespond(countered, INITIATOR)).toBe(true);
    expect(canRespond(countered, RECEIVER)).toBe(false);
  });

  it("is false for a settled request and for a signed-out viewer", () => {
    expect(canRespond(request({ status: "Accepted" }), RECEIVER)).toBe(false);
    expect(canRespond(request(), undefined)).toBe(false);
  });
});

describe("canCounter", () => {
  it("allows one counter on a pending Borrow or Lend request", () => {
    expect(canCounter(request(), RECEIVER)).toBe(true);
    expect(canCounter(request({ request_type: "Lend" }), RECEIVER)).toBe(true);
  });

  it("refuses a Repayment request, which carries no negotiable terms", () => {
    const repayment = request({
      request_type: "Repayment",
      obligation_id: "obl-1",
      purpose: null,
      proposed_repayment_type: null,
      proposed_due_date: null,
      note: "Rent is due on Friday.",
    });
    expect(canRespond(repayment, RECEIVER)).toBe(true);
    expect(canCounter(repayment, RECEIVER)).toBe(false);
  });

  it("refuses a second counter on an already-countered request", () => {
    expect(canCounter(request({ status: "Countered" }), INITIATOR)).toBe(false);
  });
});

describe("canCancel", () => {
  it("is the initiator's own pending request only", () => {
    expect(canCancel(request(), INITIATOR)).toBe(true);
    expect(canCancel(request(), RECEIVER)).toBe(false);
    expect(canCancel(request({ status: "Countered" }), INITIATOR)).toBe(false);
  });
});

describe("requestStatusLabel", () => {
  it("reads from the viewer's side", () => {
    expect(requestStatusLabel(request(), RECEIVER)).toBe("Pending your response");
    expect(requestStatusLabel(request(), INITIATOR)).toBe("Awaiting their response");
    expect(requestStatusLabel(request({ status: "Countered" }), INITIATOR)).toBe(
      "Counter-proposal received",
    );
    expect(requestStatusLabel(request({ status: "Countered" }), RECEIVER)).toBe("Counter sent");
  });

  it("falls through to the raw status once the request is closed", () => {
    expect(requestStatusLabel(request({ status: "Declined" }), RECEIVER)).toBe("Declined");
  });
});
