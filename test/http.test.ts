import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createHttpApp } from "../src/http.js";
import { createDemoHousehold } from "../src/household.js";
import { MemoryStore } from "../src/store.js";

const today = new Date("2026-10-13T12:00:00Z");
let httpServer: Server;
let url: URL;

// Starts the real HTTP server on a free port (port 0), like it runs in production.
beforeAll(async () => {
  const app = createHttpApp({ host: "127.0.0.1", store: new MemoryStore(createDemoHousehold(today)), clock: () => today });
  httpServer = await new Promise<Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  url = new URL(`http://127.0.0.1:${(httpServer.address() as AddressInfo).port}/mcp`);
});

afterAll(() => {
  httpServer.close();
});

async function connect() {
  const client = new Client({ name: "http-test", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(url));
  return client;
}

describe("HTTP server", () => {
  it("answers health checks", async () => {
    const res = await fetch(new URL("/ping", url));
    expect(await res.json()).toEqual({ status: "Healthy" });
  });

  it("serves MCP over HTTP on protocol 2025-11-25", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toContain("can_we_afford");
    expect(client.getServerVersion()?.name).toBe("household-cfo");
    await client.close();
  });

  it("shares family memory between separate sessions", async () => {
    const monday = await connect();
    await monday.callTool({ name: "remember_decision", arguments: { text: "No new subscriptions until December" } });
    await monday.close();

    const thursday = await connect();
    const result = await thursday.callTool({
      name: "can_we_afford",
      arguments: { item: "Hulu subscription", amountUsd: 18, category: "subscriptions" },
    });
    expect((result.content as { text: string }[])[0].text).toContain("No new subscriptions until December");
    await thursday.close();
  });

  it("rejects requests that don't start with initialize", async () => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    expect(res.status).toBe(400);
  });

  it("accepts a session ID chosen by the host, as AgentCore does", async () => {
    const headers = { "content-type": "application/json", accept: "application/json, text/event-stream" };
    const init = await fetch(url, {
      method: "POST",
      headers: { ...headers, "mcp-session-id": "platform-session-123" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "host", version: "1" } },
      }),
    });
    expect(init.status).toBe(200);
    expect(init.headers.get("mcp-session-id")).toBe("platform-session-123");

    const list = await fetch(url, {
      method: "POST",
      headers: { ...headers, "mcp-session-id": "platform-session-123", "mcp-protocol-version": "2025-11-25" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
    });
    expect(list.status).toBe(200);
    expect(await list.text()).toContain("budget_status");
  });
});
