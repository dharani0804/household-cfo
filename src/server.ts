import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CATEGORIES, type Household } from "./household.js";
import { formatUsd, toCents } from "./money.js";
import { ActionGuard, type GuardOutcome } from "./guardrails/action-guard.js";
import { summarizeBudget } from "./finance/budget.js";
import { checkAffordability } from "./finance/affordability.js";
import { recordExpense } from "./finance/expenses.js";
import { splitBill } from "./finance/split.js";
import { auditSubscriptions, cancelSubscription, findSubscription } from "./finance/subscriptions.js";
import { describeDecisions, findRelatedDecisions, rememberDecision } from "./finance/decisions.js";

/**
 * Everything the server needs from the outside world is passed in.
 * Tests pass a fixed clock and a fresh household, so results never change.
 */
export interface ServerDeps {
  household: Household;
  clock: () => Date;
  guards?: Guards;
}

export interface Guards {
  purchases: ActionGuard;
  cancellations: ActionGuard;
}

/** Purchases under $50 go through, over $2,000 are refused. Cancellations always ask. */
export function createGuards(clock: () => Date): Guards {
  const now = () => clock().getTime();
  return {
    purchases: new ActionGuard({ autoApproveBelow: toCents(50), hardLimit: toCents(2000) }, now),
    cancellations: new ActionGuard({ autoApproveBelow: 0, hardLimit: Number.MAX_SAFE_INTEGER }, now),
  };
}

const confirmationToken = z
  .string()
  .optional()
  .describe("Only after the user agreed out loud: the confirmationToken from the previous needs_confirmation answer");

/** What to say when a guarded action didn't go ahead. */
function describeOutcome(outcome: Exclude<GuardOutcome, { status: "approved" }>, what: string): string {
  switch (outcome.status) {
    case "blocked":
      return `I can't do that. ${outcome.reason}`;
    case "declined":
      return `Okay, I won't ${what}.`;
    case "cancelled":
      return "No problem, I've left it alone.";
    case "needs_confirmation":
      return outcome.prompt;
  }
}

export function createServer({ household, clock, guards = createGuards(clock) }: ServerDeps): McpServer {
  const server = new McpServer(
    { name: "household-cfo", title: "Household CFO", version: "0.1.0" },
    {
      instructions:
        "Household CFO manages one family's budget by voice. Read each tool's text answer aloud. " +
        "Purchases and cancellations need the user's confirmation. If a tool answers needs_confirmation, " +
        "ask the user its prompt, and only if they clearly agree, call the same tool again with the confirmationToken. " +
        "When the family makes a money decision, save it with remember_decision.",
    },
  );

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
      const related = findRelatedDecisions(household, `${item} ${category}`);
      const speech = related.length > 0 ? `${check.speech} Remember, on ${related[0].date} you decided: ${related[0].text}.` : check.speech;
      return {
        content: [{ type: "text", text: speech }],
        structuredContent: { ...check, speech, relatedDecisions: related },
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

  server.registerTool(
    "make_purchase",
    {
      title: "Make a purchase",
      description:
        "Buys something for the household and records it against the budget. Checks affordability first, " +
        "and asks the user to confirm anything over $50.",
      inputSchema: {
        item: z.string().min(1).max(100).describe("What to buy"),
        amountUsd: z.number().positive().max(100_000).describe("Price in US dollars"),
        category: z.enum(CATEGORIES).describe("Budget category"),
        merchant: z.string().min(1).max(100).optional().describe("Store, if known"),
        memberId: z.string().optional().describe("Who it's for; defaults to the first adult"),
        confirmationToken,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ item, amountUsd, category, merchant, memberId, confirmationToken }) => {
      const amount = toCents(amountUsd);
      const check = checkAffordability(household, { item, amount, category }, clock());
      if (check.verdict === "no") {
        return {
          content: [{ type: "text", text: check.speech }],
          structuredContent: { status: "refused", affordability: check },
        };
      }

      const outcome = await guards.purchases.check(
        server.server,
        {
          kind: "purchase",
          amount,
          summary: `Buy ${item} for ${formatUsd(amount)}? ${check.reasons.slice(1).join(" ")}`,
          details: { item, category, merchant: merchant ?? "" },
        },
        confirmationToken,
      );
      if (outcome.status !== "approved") {
        return {
          content: [{ type: "text", text: describeOutcome(outcome, `buy the ${item}`) }],
          structuredContent: { ...outcome, affordability: check },
        };
      }

      const result = recordExpense(household, { amount, category, merchant: merchant ?? item, memberId }, clock());
      const speech = `Done. I bought the ${item} for ${formatUsd(amount)}. ${category} has ${formatUsd(result.status.remaining)} left this month.`;
      return {
        content: [{ type: "text", text: speech }],
        structuredContent: { status: "purchased", via: outcome.via, transaction: result.transaction, category: result.status },
      };
    },
  );

  server.registerTool(
    "cancel_subscription",
    {
      title: "Cancel a subscription",
      description: "Cancels one subscription. Always asks the user to confirm first.",
      inputSchema: {
        name: z.string().min(1).max(100).describe("Subscription name, e.g. 'Disney+'"),
        confirmationToken,
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ name, confirmationToken }) => {
      const subscription = findSubscription(household, name);
      if (!subscription) {
        return {
          content: [{ type: "text", text: `I couldn't find a subscription called ${name}.` }],
          structuredContent: { status: "not_found" },
        };
      }

      const outcome = await guards.cancellations.check(
        server.server,
        {
          kind: "cancellation",
          amount: subscription.monthly,
          summary: `Cancel ${subscription.name}, which costs ${formatUsd(subscription.monthly)} a month?`,
          details: { name: subscription.name },
        },
        confirmationToken,
      );
      if (outcome.status !== "approved") {
        return {
          content: [{ type: "text", text: describeOutcome(outcome, `cancel ${subscription.name}`) }],
          structuredContent: { ...outcome },
        };
      }

      const speech = cancelSubscription(household, subscription);
      return {
        content: [{ type: "text", text: speech }],
        structuredContent: { status: "canceled", name: subscription.name, via: outcome.via },
      };
    },
  );

  server.registerTool(
    "remember_decision",
    {
      title: "Remember a family decision",
      description: 'Saves a money decision the family made, like "no new subscriptions until December", so later answers respect it.',
      inputSchema: {
        text: z.string().min(3).max(300).describe("The decision, in the family's words"),
        tags: z.array(z.string().max(30)).max(10).optional().describe("Topics like 'subscriptions' or 'dining'"),
        memberId: z.string().optional().describe("Who made the decision; defaults to the first adult"),
      },
      annotations: { readOnlyHint: false, idempotentHint: false },
    },
    async ({ text, tags, memberId }) => {
      const decision = rememberDecision(household, { text, tags, memberId }, clock());
      return {
        content: [{ type: "text", text: `Got it. I'll remember: ${decision.text}.` }],
        structuredContent: { decision },
      };
    },
  );

  server.registerTool(
    "recall_decisions",
    {
      title: "Recall family decisions",
      description: "Lists money decisions the family made earlier, optionally about one topic.",
      inputSchema: { topic: z.string().max(100).optional().describe("A topic like 'subscriptions'; leave out for all") },
      annotations: { readOnlyHint: true },
    },
    async ({ topic }) => {
      const decisions = topic ? findRelatedDecisions(household, topic) : household.decisions;
      return {
        content: [{ type: "text", text: describeDecisions(household, decisions) }],
        structuredContent: { decisions },
      };
    },
  );

  server.registerPrompt(
    "weekly_checkin",
    {
      title: "Weekly money check-in",
      description: "A short spoken review of the week: budget, subscriptions and past family decisions.",
    },
    () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              "Run our weekly money check-in. Call recall_decisions, budget_status and audit_subscriptions. " +
              "Then give a spoken summary under 60 words: one win, one thing to watch, and one suggested action. " +
              "Offer to do the action, but never buy or cancel anything without asking first.",
          },
        },
      ],
    }),
  );

  return server;
}
