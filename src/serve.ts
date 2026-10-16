import { createHttpApp } from "./http.js";
import { createDemoHousehold } from "./household.js";

const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? 8000);

const app = createHttpApp({ host, household: createDemoHousehold(new Date()), clock: () => new Date() });

app.listen(port, host, () => {
  console.log(`Household CFO MCP server listening on http://${host}:${port}/mcp`);
});

