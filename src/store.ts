// Where the household lives between conversations.
//
// AgentCore runs each MCP session in its own small VM, so memory inside the
// process is gone when the session ends. A store loads the household when a
// session starts and saves it after every change.

import { type DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import type { Household } from "./household.js";

export interface HouseholdStore {
  load(): Promise<Household>;
  save(household: Household): Promise<void>;
}

/**
 * Keeps the household in this process. Used for tests and local runs.
 * It stores a JSON copy, like a real database would, so a caller can never
 * change the saved data without calling save().
 */
export class MemoryStore implements HouseholdStore {
  private snapshot: string;

  constructor(initial: Household) {
    this.snapshot = JSON.stringify(initial);
  }

  async load(): Promise<Household> {
    return JSON.parse(this.snapshot) as Household;
  }

  async save(household: Household): Promise<void> {
    this.snapshot = JSON.stringify(household);
  }
}

export interface DynamoStoreOptions {
  client: DynamoDBDocumentClient;
  tableName: string;
  /** Creates the starting household the first time, when the table has none. */
  seed: () => Household;
  householdId?: string;
}

/**
 * Keeps each household as one DynamoDB item: { pk: "household#demo", data: "<JSON>" }.
 * The whole household is small (well under DynamoDB's 400 KB item limit), so
 * reading and writing it in one piece keeps the code simple.
 */
export class DynamoStore implements HouseholdStore {
  private readonly client: DynamoDBDocumentClient;
  private readonly tableName: string;
  private readonly seed: () => Household;
  private readonly key: { pk: string };

  constructor({ client, tableName, seed, householdId = "demo" }: DynamoStoreOptions) {
    this.client = client;
    this.tableName = tableName;
    this.seed = seed;
    this.key = { pk: `household#${householdId}` };
  }

  async load(): Promise<Household> {
    const { Item } = await this.client.send(new GetCommand({ TableName: this.tableName, Key: this.key }));
    if (typeof Item?.data === "string") {
      return JSON.parse(Item.data) as Household;
    }
    const household = this.seed();
    await this.save(household);
    return household;
  }

  async save(household: Household): Promise<void> {
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: { ...this.key, data: JSON.stringify(household), updatedAt: new Date().toISOString() },
      }),
    );
  }
}
