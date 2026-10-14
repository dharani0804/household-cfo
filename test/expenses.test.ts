import { describe, expect, it } from "vitest";
import { createDemoHousehold } from "../src/household.js";
import { recordExpense } from "../src/finance/expenses.js";
import { toCents } from "../src/money.js";

const today = new Date("2026-10-13T12:00:00Z");

describe("recordExpense", () => {
  it("adds the transaction and lowers the balance", () => {
    const household = createDemoHousehold(today);
    const before = household.checkingBalance;
    const result = recordExpense(household, { amount: toCents(20), category: "groceries", merchant: "Safeway" }, today);
    expect(household.transactions.at(-1)).toEqual(result.transaction);
    expect(household.checkingBalance).toBe(before - toCents(20));
    expect(result.transaction.date).toBe("2026-10-13");
  });

  it("warns when a category goes over budget", () => {
    const household = createDemoHousehold(today);
    const result = recordExpense(household, { amount: toCents(200), category: "dining", merchant: "Party" }, today);
    expect(result.speech).toBe("Logged $200 at Party. That puts dining over budget by $79.85.");
  });

  it("warns when a category passes 80%", () => {
    const household = createDemoHousehold(today);
    const result = recordExpense(household, { amount: toCents(50), category: "dining", merchant: "Thai" }, today);
    expect(result.speech).toContain("Heads up, that's 80% of the budget.");
  });

  it("falls back to the first adult for an unknown member", () => {
    const household = createDemoHousehold(today);
    const result = recordExpense(household, { amount: 500, category: "other", merchant: "Gift", memberId: "nobody" }, today);
    expect(result.transaction.memberId).toBe("dharani");
  });
});
