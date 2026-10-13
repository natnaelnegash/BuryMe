import type { Schemas } from "@buryme/shared";

export function formatMoney(money: Schemas["Money"]): string {
  return `${money.amount.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${money.currency}`;
}

export function formatSignedMoney(
  money: Schemas["Money"],
  direction: "incoming" | "outgoing",
): string {
  return `${direction === "incoming" ? "+" : "−"}${formatMoney(money)}`;
}
