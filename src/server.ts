import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Household } from "./household.js";
import { summarizeBudget } from "./finance/budget.js";

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

  return server;
}
