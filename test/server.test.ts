import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";
import { createDemoHousehold } from "../src/household.js";

const today = new Date("2026-10-13T12:00:00Z");

/** Connects a real MCP client to the server in memory, like Alexa+ would over the network. */
async function connect() {
  const server = createServer({ household: createDemoHousehold(today), clock: () => today });
  const client = new Client({ name: "test-client", version: "1.0.0" });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  return client;
}

describe("MCP server", () => {
  it("lists the budget_status tool", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toContain("budget_status");
  });

  it("answers budget_status with a spoken summary", async () => {
    const client = await connect();
    const result = await client.callTool({ name: "budget_status", arguments: {} });
    expect(result.structuredContent).toMatchObject({ month: "2026-10" });
    expect(result.content).toEqual([{ type: "text", text: expect.stringMatching(/^You've spent \$\d+/) }]);
  });
});
