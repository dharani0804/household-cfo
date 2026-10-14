import { describe, expect, it } from "vitest";
import { createDemoHousehold } from "../src/household.js";
import { auditSubscriptions } from "../src/finance/subscriptions.js";
import { toCents } from "../src/money.js";

const today = new Date("2026-10-13T12:00:00Z");

describe("auditSubscriptions", () => {
  const audit = auditSubscriptions(createDemoHousehold(today), today);

  it("suggests canceling unused subscriptions", () => {
    expect(audit.suggestedCancellations).toEqual(["Disney+", "Peloton App"]);
    expect(audit.annualSavings).toBe(toCents(13.99 + 24) * 12);
  });

  it("reports a price increase without suggesting a cancellation", () => {
    expect(audit.findings).toContainEqual(expect.objectContaining({ name: "Max", kind: "price_increase" }));
    expect(audit.suggestedCancellations).not.toContain("Max");
  });

  it("reads naturally out loud", () => {
    expect(audit.speech).toBe("You spend $105.95 a month on subscriptions. Canceling Disney+ and Peloton App would save $455.88 a year.");
  });

  it("flags overlap when nothing in the group is unused", () => {
    const household = createDemoHousehold(today);
    household.subscriptions = household.subscriptions.map((s) => ({ ...s, lastUsed: "2026-10-10" }));
    const result = auditSubscriptions(household, today);
    expect(result.findings).toContainEqual(expect.objectContaining({ kind: "overlap" }));
  });
});
