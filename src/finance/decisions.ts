import type { Decision, Household } from "../household.js";
import { toIsoDate } from "../dates.js";
import { resolveMember } from "./expenses.js";

export interface DecisionInput {
  text: string;
  tags?: string[];
  memberId?: string;
}

/** Common words that would make every decision look related to every question. */
const IGNORED_WORDS = new Set(["about", "after", "before", "from", "have", "that", "them", "they", "this", "until", "what", "when", "with", "will", "would"]);

/** Saves a family money decision so later answers can respect it. */
export function rememberDecision(household: Household, input: DecisionInput, today: Date): Decision {
  const decision: Decision = {
    id: `d${household.decisions.length + 1}`,
    date: toIsoDate(today),
    memberId: resolveMember(household, input.memberId),
    text: input.text.trim(),
    tags: (input.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean),
  };
  household.decisions.push(decision);
  return decision;
}

/**
 * Decisions that share a meaningful word with the topic, newest first.
 * Simple keyword matching is predictable and easy to test. Step 10 can swap in AI matching.
 */
export function findRelatedDecisions(household: Household, topic: string): Decision[] {
  const topicWords = keywords(topic);
  if (topicWords.size === 0) return [];
  return household.decisions
    .filter((d) => [...keywords(`${d.text} ${d.tags.join(" ")}`)].some((w) => topicWords.has(w)))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function describeDecisions(household: Household, decisions: Decision[]): string {
  if (decisions.length === 0) return "I don't have any family decisions saved about that.";
  return decisions
    .map((d) => `On ${d.date}, ${memberName(household, d.memberId)} decided: ${d.text}.`)
    .join(" ");
}

/** Lowercase words of 4+ letters, with a trailing "s" dropped so "subscriptions" matches "subscription". */
function keywords(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4 && !IGNORED_WORDS.has(w))
    .map((w) => (w.endsWith("s") ? w.slice(0, -1) : w));
  return new Set(words);
}

function memberName(household: Household, memberId: string): string {
  return household.members.find((m) => m.id === memberId)?.name ?? "someone";
}
