import type { Schemas } from "@buryme/shared";

import type { Prisma } from "../generated/prisma/client.js";

export function toMoney(amount: Prisma.Decimal): Schemas["Money"] {
  return { amount: amount.toNumber(), currency: "ETB" };
}
