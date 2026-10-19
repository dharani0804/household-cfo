// Streamable HTTP transport: how Alexa+ (or any remote MCP client) reaches the server.
//
// Each client gets its own MCP session, identified by the `mcp-session-id` header.
// Sessions are kept open so the server can ask for confirmation in the middle of a
// tool call. Each new session loads the household from the store, and every change
// is saved back, so a decision saved in one conversation is there in the next.

import { randomUUID } from "node:crypto";
import type { Express, Request, Response } from "express";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { type Guards, createGuards, createServer } from "./server.js";
import type { HouseholdStore } from "./store.js";

export interface HttpOptions {
  /** "127.0.0.1" for your laptop. A container sets "0.0.0.0" so outside traffic can reach it. */
  host: string;
  store: HouseholdStore;
  clock: () => Date;
  guards?: Guards;
}

export function createHttpApp({ host, store, clock, guards = createGuards(clock) }: HttpOptions): Express {
  const sessions = new Map<string, StreamableHTTPServerTransport>();
  // Turns on DNS rebinding protection when bound to localhost.
  const app = createMcpExpressApp({ host });

  app.post("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.header("mcp-session-id");
    const existing = sessionId ? sessions.get(sessionId) : undefined;
    if (existing) {
      await existing.handleRequest(req, res, req.body);
      return;
    }
    if (!isInitializeRequest(req.body)) {
      if (sessionId) sendError(res, 404, "Unknown or expired session. Start a new one with initialize.");
      else sendError(res, 400, "The first request must be initialize.");
      return;
    }

    const transport = new StreamableHTTPServerTransport({
      // Hosts like AgentCore may assign the session ID themselves and send it with
      // initialize. Reuse it so their routing and ours agree; otherwise make one.
      sessionIdGenerator: () => sessionId ?? randomUUID(),
      onsessioninitialized: (id) => {
        sessions.set(id, transport);
      },
    });
    transport.onclose = () => {
      if (transport.sessionId) sessions.delete(transport.sessionId);
    };

    const household = await store.load();
    const server = createServer({ household, clock, guards, persist: (changed) => store.save(changed) });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  // GET opens a stream for server-to-client messages. DELETE ends the session.
  const forwardToSession = async (req: Request, res: Response) => {
    const transport = sessions.get(req.header("mcp-session-id") ?? "");
    if (!transport) {
      sendError(res, 404, "Unknown or expired session.");
      return;
    }
    await transport.handleRequest(req, res);
  };
  app.get("/mcp", forwardToSession);
  app.delete("/mcp", forwardToSession);

  // Health check for load balancers and AgentCore.
  app.get("/ping", (_req: Request, res: Response) => {
    res.json({ status: "Healthy" });
  });

  return app;
}

function sendError(res: Response, httpStatus: number, message: string): void {
  res.status(httpStatus).json({ jsonrpc: "2.0", error: { code: -32000, message }, id: null });
}
