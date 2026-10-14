import { describe, expect, it } from "vitest";
import { createDemoHousehold } from "../src/household.js";
import { categoryStatus, summarizeBudget } from "../src/finance/budget.js";
import { toCents } from "../src/money.js";

const today = new Date("2026-10-13T12:00:00Z");

describe("categoryStatus", () => {
  it("adds up this month's spending in one category", () => {
    const kids = categoryStatus(createDemoHousehold(today), "kids", today);
    expect(kids.spent).toBe(toCents(258.5));
    expect(kids.remaining).toBe(toCents(141.5));
    expect(kids.percentUsed).toBe(65);
  });

  it("ignores spending from last month", () => {
    const household = createDemoHousehold(today);
    household.transactions.push({ id: "old", date: "2026-09-30", amount: toCents(500), category: "kids", merchant: "Camp", memberId: "priya" });
    expect(categoryStatus(household, "kids", today).spent).toBe(toCents(258.5));
  });
});

describe("summarizeBudget", () => {
  it("reports over-budget categories in the spoken summary", () => {
    const household = createDemoHousehold(today);
    household.transactions.push({ id: "x", date: "2026-10-13", amount: toCents(200), category: "dining", merchant: "Party", memberId: "dharani" });
    const summary = summarizeBudget(household, today);
    expect(summary.overBudget).toEqual(["dining"]);
    expect(summary.speech).toContain("dining by $79.85");
  });

  it("says everything is on track when it is", () => {
    const household = createDemoHousehold(today);
    household.transactions = [];
    expect(summarizeBudget(household, today).speech).toContain("Every category is on track.");
  });
});