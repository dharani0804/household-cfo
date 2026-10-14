import { describe, expect, it } from "vitest";
import { createDemoHousehold } from "../src/household.js";
import { describeDecisions, findRelatedDecisions, rememberDecision } from "../src/finance/decisions.js";

const today = new Date("2026-10-13T12:00:00Z");

describe("decisions", () => {
  it("saves a decision with today's date and tidy tags", () => {
    const household = createDemoHousehold(today);
    const d = rememberDecision(household, { text: "  No new subscriptions until December ", tags: [" Subscriptions "], memberId: "priya" }, today);
    expect(d).toEqual({ id: "d1", date: "2026-10-13", memberId: "priya", text: "No new subscriptions until December", tags: ["subscriptions"] });
    expect(household.decisions).toHaveLength(1);
  });

  it("finds a decision by a related word, singular or plural", () => {
    const household = createDemoHousehold(today);
    rememberDecision(household, { text: "No new subscriptions until December" }, today);
    expect(findRelatedDecisions(household, "Hulu subscription")).toHaveLength(1);
  });

  it("ignores common words, so unrelated questions don't match", () => {
    const household = createDemoHousehold(today);
    rememberDecision(household, { text: "No new subscriptions until December" }, today);
    expect(findRelatedDecisions(household, "dinner until Friday")).toHaveLength(0);
  });

  it("matches on tags as well as text", () => {
    const household = createDemoHousehold(today);
    rememberDecision(household, { text: "Cap eating out at twice a week", tags: ["dining"] }, today);
    expect(findRelatedDecisions(household, "pizza dining")).toHaveLength(1);
  });

  it("describes decisions with who made them", () => {
    const household = createDemoHousehold(today);
    const d = rememberDecision(household, { text: "Save for the Hyderabad trip first", memberId: "priya" }, today);
    expect(describeDecisions(household, [d])).toBe("On 2026-10-13, Priya decided: Save for the Hyderabad trip first.");
  });
});
