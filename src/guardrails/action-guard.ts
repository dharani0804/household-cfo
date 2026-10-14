// Confirm-before-act guardrails for any MCP server that can spend money or take
// actions that are hard to undo. Nothing in this folder knows about households,
// so it can be published on its own later as `mcp-guardrails`.

import { randomUUID } from "node:crypto";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";

export interface GuardPolicy {
  /** Actions below this amount (in cents) run without asking. Use 0 to always ask. */
  autoApproveBelow: number;
  /** Actions above this amount are refused outright. */
  hardLimit: number;
  /** How long a confirmation token stays valid. Defaults to 5 minutes. */
  tokenTtlMs?: number;
}

export interface GuardedAction {
  kind: string;
  amount: number;
  /** One sentence the user hears or reads before agreeing. */
  summary: string;
  /** Fields that identify this exact action, so a token can't be reused for a different one. */
  details?: Record<string, string | number | boolean>;
}

export type GuardOutcome =
  | { status: "approved"; via: "auto" | "elicitation" | "token" }
  | { status: "declined" }
  | { status: "cancelled" }
  | { status: "blocked"; reason: string }
  | { status: "needs_confirmation"; confirmationToken: string; prompt: string; expiresAt: string };

export interface AuditEntry {
  at: string;
  action: GuardedAction;
  outcome: GuardOutcome["status"];
}

const DEFAULT_TOKEN_TTL_MS = 5 * 60_000;

/**
 * Decides whether an action may run:
 *   over the hard limit         -> blocked
 *   under the auto-approve line -> approved
 *   carries a valid token       -> approved (the user already said yes out loud)
 *   client supports elicitation -> ask the user with a confirm form
 *   otherwise                   -> needs_confirmation with a one-time token
 * Every decision is written to the audit log.
 */
export class ActionGuard {
  readonly auditLog: AuditEntry[] = [];
  private readonly pendingTokens = new Map<string, { fingerprint: string; expiresAt: number }>();

  constructor(
    private readonly policy: GuardPolicy,
    private readonly now: () => number = Date.now,
  ) {}

  async check(server: Server, action: GuardedAction, confirmationToken?: string): Promise<GuardOutcome> {
    const outcome = await this.decide(server, action, confirmationToken);
    this.auditLog.push({ at: new Date(this.now()).toISOString(), action, outcome: outcome.status });
    return outcome;
  }

  private async decide(server: Server, action: GuardedAction, token?: string): Promise<GuardOutcome> {
    if (action.amount > this.policy.hardLimit) {
      return { status: "blocked", reason: `That's over the limit for a single ${action.kind}.` };
    }
    if (action.amount < this.policy.autoApproveBelow) {
      return { status: "approved", via: "auto" };
    }
    if (token && this.redeemToken(token, action)) {
      return { status: "approved", via: "token" };
    }
    if (server.getClientCapabilities()?.elicitation) {
      return this.askWithElicitation(server, action);
    }
    return this.issueToken(action);
  }

  private async askWithElicitation(server: Server, action: GuardedAction): Promise<GuardOutcome> {
    const result = await server.elicitInput({
      mode: "form",
      message: action.summary,
      requestedSchema: {
        type: "object",
        properties: {
          confirm: { type: "boolean", title: "Go ahead?", description: action.summary, default: false },
        },
        required: ["confirm"],
      },
    });

    if (result.action === "accept") {
      return result.content?.confirm === true ? { status: "approved", via: "elicitation" } : { status: "declined" };
    }
    return result.action === "decline" ? { status: "declined" } : { status: "cancelled" };
  }

  private issueToken(action: GuardedAction): GuardOutcome {
    const confirmationToken = randomUUID();
    const expiresAt = this.now() + (this.policy.tokenTtlMs ?? DEFAULT_TOKEN_TTL_MS);
    this.pendingTokens.set(confirmationToken, { fingerprint: fingerprint(action), expiresAt });
    return {
      status: "needs_confirmation",
      confirmationToken,
      prompt: `${action.summary} Should I go ahead?`,
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  /** Tokens are single use: they're removed on first try, whether or not they match. */
  private redeemToken(token: string, action: GuardedAction): boolean {
    const pending = this.pendingTokens.get(token);
    this.pendingTokens.delete(token);
    return pending !== undefined && pending.fingerprint === fingerprint(action) && pending.expiresAt > this.now();
  }
}

/** A stable string for "this exact action", independent of the order of detail keys. */
function fingerprint(action: GuardedAction): string {
  const details = Object.entries(action.details ?? {}).sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify([action.kind, action.amount, details]);
}