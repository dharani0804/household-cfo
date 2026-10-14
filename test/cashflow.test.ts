import { describe, expect, it } from "vitest";
import { createDemoHousehold } from "../src/household.js";
import { billsDueBeforePayday, nextPayday, safeToSpend } from "../src/finance/cashflow.js";
import { toCents } from "../src/money.js";

const at = (iso: string) => new Date(`${iso}T12:00:00Z`);

describe("cashflow", () => {
  it("finds the next payday, rolling into next month", () => {
    const household = createDemoHousehold(at("2026-10-13"));
    expect(nextPayday(household, at("2026-10-13")).toISOString().slice(0, 10)).toBe("2026-11-01");
  });

  it("lists bills due between today and payday, in date order", () => {
    const household = createDemoHousehold(at("2026-10-13"));
    expect(billsDueBeforePayday(household, at("2026-10-13")).map((b) => b.name)).toEqual([
      "Car payment",
      "Electric",
      "Internet",
      "Phone plan",
    ]);
  });

  it("leaves out a bill that is due on payday itself", () => {
    const household = createDemoHousehold(at("2026-10-13"));
    expect(billsDueBeforePayday(household, at("2026-10-13")).some((b) => b.name === "Rent")).toBe(false);
  });

  it("handles the December to January rollover", () => {
    const household = createDemoHousehold(at("2026-12-21"));
    const due = billsDueBeforePayday(household, at("2026-12-21"));
    expect(due.map((b) => b.date)).toEqual(["2026-12-22", "2026-12-25"]);
  });

  it("subtracts upcoming bills and the cushion from the balance", () => {
    const household = createDemoHousehold(at("2026-10-13"));
    // $3,840 balance - $715 in bills - $500 cushion
    expect(safeToSpend(household, at("2026-10-13"))).toBe(toCents(2625));
  });
});