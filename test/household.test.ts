import { describe, expect, it } from "vitest";
import { CATEGORIES, createDemoHousehold } from "../src/household.js";
import { formatUsd, toCents } from "../src/money.js";

describe("money", () => {
  it("converts dollars to whole cents without drift", () => {
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents(17.99)).toBe(1799);
  });

  it("formats cents for speech", () => {
    expect(formatUsd(151889)).toBe("$1,518.89");
    expect(formatUsd(24000)).toBe("$240");
    expect(formatUsd(9850)).toBe("$98.50");
    expect(formatUsd(-500)).toBe("-$5");
  });
});

describe("demo household", () => {
  const today = new Date("2026-10-13T12:00:00Z");
  const household = createDemoHousehold(today);

  it("has a budget for every category", () => {
    expect(Object.keys(household.budgets).sort()).toEqual([...CATEGORIES].sort());
  });

  it("keeps every transaction in the current month", () => {
    for (const t of household.transactions) expect(t.date.startsWith("2026-10")).toBe(true);
  });

  it("still works on the first day of a month", () => {
    const firstOfMonth = createDemoHousehold(new Date("2026-11-01T12:00:00Z"));
    for (const t of firstOfMonth.transactions) expect(t.date).toBe("2026-11-01");
  });
});