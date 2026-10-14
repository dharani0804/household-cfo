import { describe, expect, it } from "vitest";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { ActionGuard, type GuardedAction } from "../src/guardrails/action-guard.js";

/** A stand-in for the MCP server: just the two methods the guard uses. */
function fakeServer(answer?: { action: "accept" | "decline" | "cancel"; confirm?: boolean }) {
  return {
    getClientCapabilities: () => (answer ? { elicitation: { form: {} } } : {}),
    elicitInput: async () => ({ action: answer!.action, content: { confirm: answer!.confirm ?? true } }),
  } as unknown as Server;
}

const policy = { autoApproveBelow: 5_000, hardLimit: 200_000, tokenTtlMs: 60_000 };
const camp: GuardedAction = { kind: "purchase", amount: 24_000, summary: "Buy soccer camp for $240?", details: { item: "soccer camp" } };

describe("ActionGuard", () => {
  it("blocks anything over the hard limit, even with a yes", async () => {
    const guard = new ActionGuard(policy);
    const outcome = await guard.check(fakeServer({ action: "accept" }), { ...camp, amount: 300_000 });
    expect(outcome.status).toBe("blocked");
  });

  it("approves small actions without asking", async () => {
    const guard = new ActionGuard(policy);
    expect(await guard.check(fakeServer(), { ...camp, amount: 600 })).toEqual({ status: "approved", via: "auto" });
  });

  it("asks through elicitation when the client supports it", async () => {
    const guard = new ActionGuard(policy);
    expect(await guard.check(fakeServer({ action: "accept", confirm: true }), camp)).toEqual({ status: "approved", via: "elicitation" });
    expect((await guard.check(fakeServer({ action: "accept", confirm: false }), camp)).status).toBe("declined");
    expect((await guard.check(fakeServer({ action: "decline" }), camp)).status).toBe("declined");
    expect((await guard.check(fakeServer({ action: "cancel" }), camp)).status).toBe("cancelled");
  });

  it("issues a one-time token when the client can't show a form", async () => {
    const guard = new ActionGuard(policy);
    const first = await guard.check(fakeServer(), camp);
    expect(first.status).toBe("needs_confirmation");
    if (first.status !== "needs_confirmation") return;

    expect(await guard.check(fakeServer(), camp, first.confirmationToken)).toEqual({ status: "approved", via: "token" });
    // Using the same token twice doesn't work.
    expect((await guard.check(fakeServer(), camp, first.confirmationToken)).status).toBe("needs_confirmation");
  });

  it("won't accept a token for a different action", async () => {
    const guard = new ActionGuard(policy);
    const first = await guard.check(fakeServer(), camp);
    if (first.status !== "needs_confirmation") throw new Error("expected a token");
    const pricier = { ...camp, amount: 90_000 };
    expect((await guard.check(fakeServer(), pricier, first.confirmationToken)).status).toBe("needs_confirmation");
  });

  it("won't accept an expired token", async () => {
    let now = 0;
    const guard = new ActionGuard(policy, () => now);
    const first = await guard.check(fakeServer(), camp);
    if (first.status !== "needs_confirmation") throw new Error("expected a token");
    now = 61_000;
    expect((await guard.check(fakeServer(), camp, first.confirmationToken)).status).toBe("needs_confirmation");
  });

  it("writes every decision to the audit log", async () => {
    const guard = new ActionGuard(policy);
    await guard.check(fakeServer(), { ...camp, amount: 600 });
    await guard.check(fakeServer({ action: "decline" }), camp);
    expect(guard.auditLog.map((e) => e.outcome)).toEqual(["approved", "declined"]);
  });
});