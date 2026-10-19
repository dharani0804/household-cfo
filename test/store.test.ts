import { describe, expect, it } from "vitest";
import { type DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createDemoHousehold, type Household } from "../src/household.js";
import { createServer } from "../src/server.js";
import { DynamoStore, MemoryStore } from "../src/store.js";

const today = new Date("2026-10-13T12:00:00Z");

/** A stand-in for DynamoDB: one Map, and it records every command it receives. */
function fakeDynamo() {
  const items = new Map<string, Record<string, unknown>>();
  const commands: string[] = [];
  const client = {
    async send(command: GetCommand | PutCommand) {
      commands.push(command.constructor.name);
      if (command instanceof GetCommand) {
        return { Item: items.get(command.input.Key?.pk as string) };
      }
      const item = command.input.Item ?? {};
      items.set(item.pk as string, item);
      return {};
    },
  };
  return { client: client as unknown as DynamoDBDocumentClient, items, commands };
}

describe("MemoryStore", () => {
  it("only keeps changes that were saved", async () => {
    const store = new MemoryStore(createDemoHousehold(today));
    const household = await store.load();
    household.checkingBalance = 0;
    expect((await store.load()).checkingBalance).not.toBe(0);

    await store.save(household);
    expect((await store.load()).checkingBalance).toBe(0);
  });
});

describe("DynamoStore", () => {
  it("creates the demo household the first time and saves it", async () => {
    const dynamo = fakeDynamo();
    const store = new DynamoStore({ client: dynamo.client, tableName: "household-cfo", seed: () => createDemoHousehold(today) });

    const household = await store.load();
    expect(household.name).toBe(createDemoHousehold(today).name);
    expect(dynamo.commands).toEqual(["GetCommand", "PutCommand"]);
    expect(dynamo.items.has("household#demo")).toBe(true);
  });

  it("returns what was saved, in a new store like a new session would", async () => {
    const dynamo = fakeDynamo();
    const options = { client: dynamo.client, tableName: "household-cfo", seed: () => createDemoHousehold(today) };
    const monday = new DynamoStore(options);
    const household = await monday.load();
    household.decisions.push({ id: "d1", date: "2026-10-13", memberId: "m1", text: "No takeout on weeknights", tags: [] });
    await monday.save(household);

    const thursday = new DynamoStore(options);
    const loaded = await thursday.load();
    expect(loaded.decisions.map((d) => d.text)).toEqual(["No takeout on weeknights"]);
  });
});

describe("saving from tools", () => {
  async function connect() {
    const saved: Household[] = [];
    const server = createServer({
      household: createDemoHousehold(today),
      clock: () => today,
      persist: async (household) => {
        saved.push(household);
      },
    });
    const client = new Client({ name: "test-client", version: "1.0.0" });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
    return { client, saved };
  }

  it("saves after a tool changes the household", async () => {
    const { client, saved } = await connect();
    await client.callTool({ name: "remember_decision", arguments: { text: "No new subscriptions until December" } });
    expect(saved).toHaveLength(1);
    expect(saved[0].decisions.at(-1)?.text).toBe("No new subscriptions until December");
  });

  it("doesn't save when a tool only reads", async () => {
    const { client, saved } = await connect();
    await client.callTool({ name: "budget_status", arguments: {} });
    expect(saved).toHaveLength(0);
  });
});
