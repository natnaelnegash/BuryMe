import type { Schemas } from "@buryme/shared";

import type { Prisma } from "../generated/prisma/client.js";

// The DB layer stores plain Decimal columns (no currency column — ETB is
// the only supported currency for now, per CLAUDE.md's Money convention).
// This is the one place that translates Decimal -> the API's
// {amount, currency} shape.
export function toMoney(amount: Prisma.Decimal): Schemas["Money"] {
  return { amount: amount.toNumber(), currency: "ETB" };
}
