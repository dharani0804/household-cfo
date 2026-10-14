import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
import { createDemoHousehold } from "./household.js";

// stdout carries the MCP messages, so never console.log here. Use console.error for logs.
const server = createServer({
  household: createDemoHousehold(new Date()),
  clock: () => new Date(),
});

await server.connect(new StdioServerTransport());
console.error("Household CFO is running on stdio");
