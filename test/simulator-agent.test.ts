import { describe, expect, it } from "vitest";
import type { Message } from "@aws-sdk/client-bedrock-runtime";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";
import { createDemoHousehold } from "../src/household.js";
import { AlexaAgent, type Converse } from "../simulator/agent.js";

const today = new Date("2026-10-13T12:00:00Z");

/**
 * A pretend model that gives these replies in order, and keeps what it was sent.
 * A reply can be a function, for when it depends on something only known later.
 */
function scriptedModel(replies: (Message | (() => Message))[]) {
  const calls: Parameters<Converse>[0][] = [];
  const converse: Converse = async (input) => {
    calls.push(structuredClone(input));
    const next = replies.shift();
    if (!next) throw new Error("The model was called more times than the test expected");
    const message = typeof next === "function" ? next() : next;
    const usesTool = message.content?.some((block) => block.toolUse) ?? false;
    return { message, stopReason: usesTool ? "tool_use" : "end_turn" };
  };
  return { converse, calls };
}

async function connectAgent(converse: Converse) {
  const server = createServer({ household: createDemoHousehold(today), clock: () => today });
  const client = new Client({ name: "simulator-test", version: "1.0.0" });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  const agent = new AlexaAgent(client, converse);
  await agent.start();
  return agent;
}

const callTool = (name: string, input: { [key: string]: string | number }): Message => ({
  role: "assistant",
  content: [{ toolUse: { toolUseId: "t1", name, input } }],
});
const say = (text: string): Message => ({ role: "assistant", content: [{ text }] });

describe("Alexa simulator agent", () => {
  it("gives the model the server's five tools and its instructions", async () => {
    const model = scriptedModel([say("Hi!")]);
    const agent = await connectAgent(model.converse);
    await agent.ask("Hello");

    const tools = model.calls[0].toolConfig?.tools?.map((t) => t.toolSpec?.name).sort();
    expect(tools).toEqual(["budget_status", "can_we_afford", "cancel_subscription", "make_purchase", "remember_decision"]);
    expect(model.calls[0].system?.[0].text).toContain("Purchases and cancellations need the user's confirmation");
  });

  it("calls the tool the model picks and returns its answer with a card", async () => {
    const model = scriptedModel([callTool("budget_status", {}), say("You've spent about half your budget.")]);
    const agent = await connectAgent(model.converse);

    const reply = await agent.ask("How are we doing?");
    expect(reply.speech).toBe("You've spent about half your budget.");
    expect(reply.card?.tool).toBe("budget_status");
    expect(reply.card?.data).toHaveProperty("totalBudget");

    // The second model call saw the tool's real answer.
    const toolResult = model.calls[1].messages?.at(-1)?.content?.[0].toolResult;
    expect(toolResult?.content?.[0].text).toContain("You've spent");
  });

  it("carries a purchase confirmation across two turns", async () => {
    const purchase = { item: "soccer cleats", amountUsd: 80, category: "kids" };
    let token = "";
    const model = scriptedModel([
      callTool("make_purchase", purchase),
      say("Buy soccer cleats for $80? Should I go ahead?"),
      () => callTool("make_purchase", { ...purchase, confirmationToken: token }),
      say("Done. I bought the soccer cleats."),
    ]);
    const agent = await connectAgent(model.converse);

    const first = await agent.ask("Buy soccer cleats for 80 dollars");
    expect(first.card?.data.status).toBe("needs_confirmation");
    token = first.card?.data.confirmationToken as string;

    const second = await agent.ask("Yes");
    expect(second.card?.data.status).toBe("purchased");
    // On the second turn, the model still saw the first one.
    expect(model.calls[2].messages?.[0].content?.[0].text).toBe("Buy soccer cleats for 80 dollars");
  });

  it("stops a model that keeps calling tools", async () => {
    const model = scriptedModel(Array.from({ length: 6 }, () => callTool("budget_status", {})));
    const agent = await connectAgent(model.converse);
    const reply = await agent.ask("Loop forever");
    expect(reply.speech).toContain("too many steps");
  });
});
