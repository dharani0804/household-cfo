import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CATEGORIES, type Household } from "./household.js";
import { toCents } from "./money.js";
import { summarizeBudget } from "./finance/budget.js";
import { checkAffordability } from "./finance/affordability.js";

/**
 * Everything the server needs from the outside world is passed in.
 * Tests pass a fixed clock and a fresh household, so results never change.
 */
export interface ServerDeps {
  household: Household;
  clock: () => Date;
}

export function createServer({ household, clock }: ServerDeps): McpServer {
  const server = new McpServer({ name: "household-cfo", title: "Household CFO", version: "0.1.0" });

  server.registerTool(
    "budget_status",
    {
      title: "Budget status",
      description: "How the household is doing against this month's budget, overall and per category.",
      annotations: { readOnlyHint: true },
    },
    async () => {
      const summary = summarizeBudget(household, clock());
      return {
        content: [{ type: "text", text: summary.speech }],
        structuredContent: { ...summary },
      };
    },
  );

  server.registerTool(
    "can_we_afford",
    {
      title: "Can we afford it?",
      description:
        "Checks a possible purchase against its category budget, bills due before payday and a safety cushion. " +
        "Answers yes, stretch or no with reasons. Does not spend anything.",
      inputSchema: {
        item: z.string().min(1).max(100).describe("What they want to buy, e.g. 'soccer camp'"),
        amountUsd: z.number().positive().max(100_000).describe("Price in US dollars"),
        category: z.enum(CATEGORIES).describe("Budget category the purchase belongs to"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ item, amountUsd, category }) => {
      const check = checkAffordability(household, { item, amount: toCents(amountUsd), category }, clock());
      return {
        content: [{ type: "text", text: check.speech }],
        structuredContent: { ...check },
      };
    },
  );

  return server;
}