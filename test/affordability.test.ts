import { describe, expect, it } from "vitest";
import { createDemoHousehold } from "../src/household.js";
import { checkAffordability } from "../src/finance/affordability.js";
import { toCents } from "../src/money.js";

const today = new Date("2026-10-13T12:00:00Z");
const check = (item: string, usd: number, category: "kids" | "shopping") =>
  checkAffordability(createDemoHousehold(today), { item, amount: toCents(usd), category }, today);

describe("checkAffordability", () => {
  it("says yes when it fits the category budget", () => {
    const result = check("swim goggles", 25, "kids");
    expect(result.verdict).toBe("yes");
    expect(result.speech).toBe("Yes, you can afford the swim goggles. You'd still have $116.50 left for kids this month.");
  });

  it("says stretch and suggests where to cover the gap", () => {
    const result = check("soccer camp", 240, "kids");
    expect(result.verdict).toBe("stretch");
    expect(result.coverFrom).toEqual({ category: "home", remaining: toCents(135.75) });
    expect(result.speech).toBe(
      "You can, but it's a stretch. It puts kids over budget by $98.50. You could cover the gap from home, which has $135.75 left.",
    );
  });

  it("says no when it would eat into bills or the cushion", () => {
    const result = check("new TV", 3000, "shopping");
    expect(result.verdict).toBe("no");
    expect(result.speech).toContain("Payday is 2026-11-01");
  });

  it("never suggests covering from the same category", () => {
    const result = check("sofa", 400, "shopping");
    expect(result.coverFrom?.category).not.toBe("shopping");
  });
});
