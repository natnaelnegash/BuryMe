export const REPAYMENT_TYPE: Record<string, "Lump Sum" | "Installments"> = {
  LumpSum: "Lump Sum",
  Installments: "Installments",
};

export const DISBURSEMENT_METHOD: Record<string, "Already Given" | "Through App"> = {
  AlreadyGiven: "Already Given",
  ThroughApp: "Through App",
};

export const OBLIGATION_STATUS: Record<
  string,
  "Pending Disbursement" | "Active" | "Partially Paid" | "Settled" | "Disputed"
> = {
  PendingDisbursement: "Pending Disbursement",
  Active: "Active",
  PartiallyPaid: "Partially Paid",
  Settled: "Settled",
  Disputed: "Disputed",
};

export const PAYMENT_STATUS: Record<
  string,
  "Pending Acknowledgement" | "Confirmed" | "Disputed" | "Failed"
> = {
  PendingAcknowledgement: "Pending Acknowledgement",
  Confirmed: "Confirmed",
  Disputed: "Disputed",
  Failed: "Failed",
};
