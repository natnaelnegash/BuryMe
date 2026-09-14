import type { Schemas } from "@buryme/shared";

// The design writes amounts as "1,200 ETB", and signs them on rows where
// direction matters ("+1,200 ETB" / "−530 ETB", using a true minus sign).
export function formatMoney(money: Schemas["Money"]): string {
  return `${money.amount.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${money.currency}`;
}

export function formatSignedMoney(
  money: Schemas["Money"],
  direction: "incoming" | "outgoing",
): string {
  return `${direction === "incoming" ? "+" : "−"}${formatMoney(money)}`;
}
