import { describe, expect, it } from "vitest";

import { formatMoney, formatSignedMoney } from "./money.js";

describe("formatMoney", () => {
  it("groups thousands and keeps at most two decimals", () => {
    expect(formatMoney({ amount: 1500, currency: "ETB" })).toBe("1,500 ETB");
    expect(formatMoney({ amount: 1234567.5, currency: "ETB" })).toBe("1,234,567.5 ETB");
    expect(formatMoney({ amount: 0, currency: "ETB" })).toBe("0 ETB");
  });
});

describe("formatSignedMoney", () => {
  it("marks direction with a plus or a true minus sign", () => {
    expect(formatSignedMoney({ amount: 300, currency: "ETB" }, "incoming")).toBe("+300 ETB");
    expect(formatSignedMoney({ amount: 300, currency: "ETB" }, "outgoing")).toBe("−300 ETB");
  });
});
