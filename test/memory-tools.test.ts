import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";
import { createDemoHousehold } from "../src/household.js";

const today = new Date("2026-10-13T12:00:00Z");

async function connect() {
  const server = createServer({ household: createDemoHousehold(today), clock: () => today });
  const client = new Client({ name: "test-client", version: "1.0.0" });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  return client;
}

const textOf = (result: Awaited<ReturnType<Client["callTool"]>>) => (result.content as { text: string }[])[0].text;

describe("family memory", () => {
  it("brings up an earlier decision when checking a related purchase", async () => {
    const client = await connect();
    await client.callTool({ name: "remember_decision", arguments: { text: "No new subscriptions until December" } });
    const result = await client.callTool({
      name: "can_we_afford",
      arguments: { item: "Hulu subscription", amountUsd: 18, category: "subscriptions" },
    });
    expect(textOf(result)).toContain("Remember, on 2026-10-13 you decided: No new subscriptions until December.");
  });

  it("recalls decisions by topic", async () => {
    const client = await connect();
    await client.callTool({ name: "remember_decision", arguments: { text: "Cap eating out at twice a week", tags: ["dining"] } });
    const result = await client.callTool({ name: "recall_decisions", arguments: { topic: "dining" } });
    expect(textOf(result)).toBe("On 2026-10-13, Dharani decided: Cap eating out at twice a week.");
  });

  it("offers the weekly check-in prompt", async () => {
    const client = await connect();
    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name)).toContain("weekly_checkin");
    const prompt = await client.getPrompt({ name: "weekly_checkin" });
    expect(prompt.messages[0].content).toMatchObject({ type: "text", text: expect.stringContaining("recall_decisions") });
  });
});
