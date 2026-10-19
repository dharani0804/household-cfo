import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { createHttpApp } from "./http.js";
import { createDemoHousehold } from "./household.js";
import { DynamoStore, type HouseholdStore, MemoryStore } from "./store.js";

const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? 8000);
const tableName = process.env.TABLE_NAME;
const clock = () => new Date();

// With TABLE_NAME set (in AWS), the household lives in DynamoDB. Without it (on
// your laptop), it lives in memory and resets when the server restarts.
const store: HouseholdStore = tableName
  ? new DynamoStore({
      client: DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION ?? "us-east-2" })),
      tableName,
      seed: () => createDemoHousehold(clock()),
    })
  : new MemoryStore(createDemoHousehold(clock()));

const app = createHttpApp({ host, store, clock });

app.listen(port, host, () => {
  console.log(`Household CFO MCP server listening on http://${host}:${port}/mcp`);
  console.log(tableName ? `Saving data to DynamoDB table ${tableName}` : "Keeping data in memory (set TABLE_NAME to use DynamoDB)");
})