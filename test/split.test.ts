import { describe, expect, it } from "vitest";
import { splitBill } from "../src/finance/split.js";
import { toCents } from "../src/money.js";

describe("splitBill", () => {
  it("splits evenly with a tip", () => {
    const result = splitBill(toCents(100), ["Dharani", "Priya"], 20);
    expect(result.total).toBe(toCents(120));
    expect(result.shares).toEqual([
      { name: "Dharani", amount: toCents(60) },
      { name: "Priya", amount: toCents(60) },
    ]);
    expect(result.speech).toBe("$120 split 2 ways is $60 each, including a 20% tip.");
  });

  it("hands out leftover cents so shares add up to the total", () => {
    const result = splitBill(toCents(100), ["A", "B", "C"]);
    expect(result.shares.map((s) => s.amount)).toEqual([3334, 3333, 3333]);
    expect(result.shares.reduce((sum, s) => sum + s.amount, 0)).toBe(result.total);
  });

  it("refuses an empty list of people", () => {
    expect(() => splitBill(1000, [])).toThrow("at least one person");
  });
});
