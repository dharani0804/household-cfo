import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ElicitRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createServer } from "../src/server.js";
import { createDemoHousehold } from "../src/household.js";

const today = new Date("2026-10-13T12:00:00Z");
type Answer = { action: "accept" | "decline" | "cancel"; confirm?: boolean };

/**
 * Connects a client. With `answer`, the client supports elicitation and replies to
 * every confirm form with it, like a user tapping a button on an Echo Show.
 */
async function connect(answer?: Answer) {
  const household = createDemoHousehold(today);
  const server = createServer({ household, clock: () => today });
  const client = new Client({ name: "test-client", version: "1.0.0" }, { capabilities: answer ? { elicitation: { form: {} } } : {} });

  const prompts: string[] = [];
  if (answer) {
    client.setRequestHandler(ElicitRequestSchema, async (request) => {
      prompts.push(request.params.message);
      return { action: answer.action, content: answer.action === "accept" ? { confirm: answer.confirm ?? true } : undefined };
    });
  }

  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  const call = async (name: string, args: Record<string, unknown>) =>
    (await client.callTool({ name, arguments: args })).structuredContent as Record<string, unknown>;
  return { household, call, prompts };
}

const camp = { item: "soccer camp", amountUsd: 240, category: "kids" };

describe("make_purchase", () => {
  it("asks for confirmation, then buys", async () => {
    const { household, call, prompts } = await connect({ action: "accept" });
    const before = household.checkingBalance;
    const result = await call("make_purchase", camp);
    expect(prompts[0]).toMatch(/^Buy soccer camp for \$240\?/);
    expect(result).toMatchObject({ status: "purchased", via: "elicitation" });
    expect(household.checkingBalance).toBe(before - 24_000);
  });

  it("buys nothing when the user says no", async () => {
    const { household, call } = await connect({ action: "decline" });
    const count = household.transactions.length;
    expect(await call("make_purchase", camp)).toMatchObject({ status: "declined" });
    expect(household.transactions).toHaveLength(count);
  });

  it("uses a one-time token when the client can't show a form", async () => {
    const { call } = await connect();
    const first = await call("make_purchase", camp);
    expect(first.status).toBe("needs_confirmation");
    const second = await call("make_purchase", { ...camp, confirmationToken: first.confirmationToken });
    expect(second).toMatchObject({ status: "purchased", via: "token" });
  });

  it("buys small things without asking", async () => {
    const { call, prompts } = await connect({ action: "accept" });
    expect(await call("make_purchase", { item: "milk", amountUsd: 6, category: "groceries" })).toMatchObject({ via: "auto" });
    expect(prompts).toHaveLength(0);
  });

  it("refuses what the family can't afford, before asking anyone", async () => {
    const { call, prompts } = await connect({ action: "accept" });
    expect(await call("make_purchase", { item: "TV", amountUsd: 3000, category: "shopping" })).toMatchObject({ status: "refused" });
    expect(prompts).toHaveLength(0);
  });
});

describe("cancel_subscription", () => {
  it("always confirms, even for a cheap subscription", async () => {
    const { household, call, prompts } = await connect({ action: "accept" });
    expect(await call("cancel_subscription", { name: "peloton app" })).toMatchObject({ status: "canceled" });
    expect(prompts[0]).toBe("Cancel Peloton App, which costs $24 a month? Not used in 74 days.");
    expect(household.subscriptions.some((s) => s.name === "Peloton App")).toBe(false);
  });

  it("suggests what to cancel when the name isn't found", async () => {
    const { call } = await connect({ action: "accept" });
    expect(await call("cancel_subscription", { name: "Hulu" })).toMatchObject({
      status: "not_found",
      suggestedCancellations: ["Disney+", "Peloton App"],
    });
  });
});
