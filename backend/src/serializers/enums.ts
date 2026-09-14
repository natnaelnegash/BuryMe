// Prisma enum values with `@map`'d DB representations (spaces aren't valid
// Prisma enum-member identifiers) still surface from the generated client
// as the schema's identifier (e.g. "LumpSum"), NOT the mapped DB string
// ("Lump Sum") — @map only affects the column value, not the client-facing
// TS type/value. These translate Prisma's client-facing identifiers to the
// contract's exact enum strings.
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
