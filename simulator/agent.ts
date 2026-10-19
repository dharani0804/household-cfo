// The "brain" of the Alexa+ simulator: a tool-use loop.
//
// 1. Send the conversation and the MCP server's tools to the model.
// 2. If the model asks for a tool, call it on the MCP server and send back the result.
// 3. Repeat until the model answers in words. That answer is what Alexa says.

import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type {
  ContentBlock,
  ConverseCommandInput,
  Message,
  StopReason,
  Tool,
  ToolInputSchema,
  ToolResultBlock,
} from "@aws-sdk/client-bedrock-runtime";

/** Bedrock's type for free-form JSON. */
type DocumentType = NonNullable<ToolInputSchema["json"]>;

/** One model call. Production passes Bedrock; tests pass a script of canned replies. */
export type Converse = (input: Pick<ConverseCommandInput, "system" | "messages" | "toolConfig">) => Promise<{
  message: Message;
  stopReason?: StopReason;
}>;

/** What the Echo Show screen draws: the last tool that ran and its structured result. */
export interface Card {
  tool: string;
  data: Record<string, unknown>;
}

export interface AlexaReply {
  speech: string;
  card?: Card;
}

const ALEXA_STYLE =
  "You are Alexa+, speaking out loud to a family at home. Answer in one to three short spoken sentences. " +
  "No markdown, lists or emoji. Use the Household CFO tools for anything about the family's money; never make up numbers.";

/** A tool-use loop that stops after this many model calls, so a confused model can't loop forever. */
const MAX_STEPS = 6;

export class AlexaAgent {
  private readonly conversation: Message[] = [];
  private tools: Tool[] = [];
  private system = ALEXA_STYLE;

  constructor(
    private readonly mcp: Client,
    private readonly converse: Converse,
  ) {}

  /** Reads the server's tools and instructions once, and turns them into Bedrock's format. */
  async start(): Promise<void> {
    const { tools } = await this.mcp.listTools();
    this.tools = tools.map((tool) => ({
      toolSpec: {
        name: tool.name,
        description: tool.description ?? tool.title ?? tool.name,
        inputSchema: { json: tool.inputSchema as unknown as DocumentType },
      },
    }));
    const instructions = this.mcp.getInstructions();
    this.system = instructions ? `${ALEXA_STYLE}\n\n${instructions}` : ALEXA_STYLE;
  }

  /** Forgets the conversation, like saying "Alexa, stop". */
  reset(): void {
    this.conversation.length = 0;
  }

  async ask(utterance: string): Promise<AlexaReply> {
    this.conversation.push({ role: "user", content: [{ text: utterance }] });
    let card: Card | undefined;

    for (let step = 0; step < MAX_STEPS; step++) {
      const { message, stopReason } = await this.converse({
        system: [{ text: this.system }],
        messages: this.conversation,
        toolConfig: { tools: this.tools },
      });
      this.conversation.push(message);

      const toolUses = (message.content ?? []).flatMap((block) => (block.toolUse ? [block.toolUse] : []));
      if (stopReason !== "tool_use" || toolUses.length === 0) {
        return { speech: textOf(message.content) || "Sorry, I didn't catch that.", card };
      }

      const results: ContentBlock[] = [];
      for (const toolUse of toolUses) {
        const name = toolUse.name ?? "";
        const result = await this.mcp.callTool({ name, arguments: toolUse.input as Record<string, unknown> });
        if (result.structuredContent) card = { tool: name, data: result.structuredContent as Record<string, unknown> };
        results.push({ toolResult: toBedrockResult(toolUse.toolUseId ?? "", result) });
      }
      this.conversation.push({ role: "user", content: results });
    }
    return { speech: "Sorry, that took too many steps. Could you ask again more simply?", card };
  }
}

function textOf(content: ContentBlock[] = []): string {
  return content
    .flatMap((block) => (block.text ? [block.text] : []))
    .join(" ")
    .trim();
}

type ToolCallResult = Awaited<ReturnType<Client["callTool"]>>;

/** MCP gives text plus structured data; the model gets both, so it can read numbers and tokens exactly. */
function toBedrockResult(toolUseId: string, result: ToolCallResult): ToolResultBlock {
  const text = (result.content as { type: string; text?: string }[])
    .flatMap((c) => (c.type === "text" && c.text ? [c.text] : []))
    .join("\n");
  const content: ToolResultBlock["content"] = [{ text: text || "(no text)" }];
  if (result.structuredContent) content.push({ json: result.structuredContent as DocumentType });
  return { toolUseId, content, status: result.isError ? "error" : "success" };
}
