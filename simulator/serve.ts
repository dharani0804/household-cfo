// A local Alexa+ simulator: a web page with a mic, backed by Claude on Amazon Bedrock,
// that uses your Household CFO MCP server (local or on AgentCore) for every money question.
//
//   npm run simulator   then open http://localhost:3000

import { fileURLToPath } from "node:url";
import express, { type Request, type Response } from "express";
import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { AlexaAgent, type Converse } from "./agent.js";

const mcpUrl = process.env.MCP_URL ?? "http://127.0.0.1:8000/mcp";
const bearerToken = process.env.BEARER_TOKEN;
const modelId = process.env.BEDROCK_MODEL_ID;
const region = process.env.AWS_REGION ?? "us-east-2";
const port = Number(process.env.SIMULATOR_PORT ?? 3000);

if (!modelId) {
  console.error("Set BEDROCK_MODEL_ID to a Claude inference profile, e.g. from `aws bedrock list-inference-profiles`.");
  process.exit(1);
}

// The model: Claude on Bedrock, through the Converse API.
const bedrock = new BedrockRuntimeClient({ region });
const converse: Converse = async (input) => {
  const output = await bedrock.send(new ConverseCommand({ modelId, ...input, inferenceConfig: { maxTokens: 400 } }));
  return { message: output.output?.message ?? { role: "assistant", content: [] }, stopReason: output.stopReason };
};

// The tools: your MCP server. AgentCore needs the Cognito token on every request.
//
// After connecting, MCP clients also open a long-lived GET stream for messages the
// server might send on its own. Our server never does that, and AgentCore handles one
// request per session at a time, so an open GET would block every tool call behind it.
// Answering GET with "405 Not Allowed" tells the SDK to skip that stream, as the spec allows.
const skipGetStream: typeof fetch = (url, init) =>
  init?.method === "GET" ? Promise.resolve(new Response(null, { status: 405 })) : fetch(url, init);

const mcp = new Client({ name: "alexa-simulator", version: "1.0.0" });
console.log(`Connecting to MCP server ${mcpUrl} ...`);
await mcp.connect(
  new StreamableHTTPClientTransport(new URL(mcpUrl), {
    requestInit: { headers: bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {} },
    fetch: skipGetStream,
  }),
  { timeout: 60_000 },
);
const agent = new AlexaAgent(mcp, converse);
await agent.start();
console.log("Connected. Loaded the server's tools.");

const app = express();
app.use(express.json());
app.use(express.static(fileURLToPath(new URL("./public", import.meta.url))));

app.post("/api/ask", async (req: Request, res: Response) => {
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  if (!text) {
    res.status(400).json({ error: "Say something first." });
    return;
  }
  try {
    res.json(await agent.ask(text));
  } catch (error) {
    console.error(error);
    res.status(500).json({ speech: "Sorry, something went wrong. Check the terminal for details." });
  }
});

app.post("/api/reset", (_req: Request, res: Response) => {
  agent.reset();
  res.json({ ok: true });
});

app.listen(port, "127.0.0.1", () => {
  console.log(`Alexa+ simulator on http://localhost:${port}`);
  console.log(`Using MCP server ${mcpUrl} and model ${modelId}`);
});
