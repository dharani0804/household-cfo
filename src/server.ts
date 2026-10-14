import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CATEGORIES, type Household } from "./household.js";
import { toCents } from "./money.js";
import { summarizeBudget } from "./finance/budget.js";
import { checkAffordability } from "./finance/affordability.js";
import { recordExpense } from "./finance/expenses.js";
import { splitBill } from "./finance/split.js";
import { auditSubscriptions } from "./finance/subscriptions.js";

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

  server.registerTool(
    "log_expense",
    {
      title: "Log an expense",
      description: "Records money already spent, then says how that category stands. Warns near or over the budget.",
      inputSchema: {
        amountUsd: z.number().positive().max(100_000).describe("Amount spent in US dollars"),
        category: z.enum(CATEGORIES).describe("Budget category"),
        merchant: z.string().min(1).max(100).describe("Where the money was spent"),
        memberId: z.string().optional().describe("Who spent it; defaults to the first adult"),
      },
      annotations: { readOnlyHint: false, idempotentHint: false },
    },
    async ({ amountUsd, category, merchant, memberId }) => {
      const result = recordExpense(household, { amount: toCents(amountUsd), category, merchant, memberId }, clock());
      return {
        content: [{ type: "text", text: result.speech }],
        structuredContent: { ...result },
      };
    },
  );

  server.registerTool(
    "split_bill",
    {
      title: "Split a bill",
      description: "Splits a bill evenly with an optional tip. The shares always add up to the total.",
      inputSchema: {
        amountUsd: z.number().positive().max(100_000).describe("Bill total in US dollars, before tip"),
        people: z.array(z.string().min(1)).min(1).max(50).describe("Everyone sharing the bill, including the speaker"),
        tipPercent: z.number().min(0).max(100).optional().describe("Tip as a percentage, e.g. 18"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ amountUsd, people, tipPercent }) => {
      const result = splitBill(toCents(amountUsd), people, tipPercent);
      return {
        content: [{ type: "text", text: result.speech }],
        structuredContent: { ...result },
      };
    },
  );

  server.registerTool(
    "audit_subscriptions",
    {
      title: "Audit subscriptions",
      description: "Finds subscriptions that are unused, overlapping or recently more expensive, and the yearly savings from canceling.",
      annotations: { readOnlyHint: true },
    },
    async () => {
      const audit = auditSubscriptions(household, clock());
      return {
        content: [{ type: "text", text: audit.speech }],
        structuredContent: { ...audit },
      };
    },
  );

  return server;
}
