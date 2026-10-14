import type { Household, Subscription } from "../household.js";
import { type Cents, formatUsd } from "../money.js";

/** A subscription not opened for this many days counts as unused. */
export const UNUSED_AFTER_DAYS = 30;

/** Paying for this many services of the same kind counts as overlap. */
export const OVERLAP_COUNT = 3;

const MS_PER_DAY = 86_400_000;

export type FindingKind = "unused" | "overlap" | "price_increase";

export interface Finding {
  name: string;
  monthly: Cents;
  kind: FindingKind;
  detail: string;
}

export interface SubscriptionAudit {
  totalMonthly: Cents;
  findings: Finding[];
  suggestedCancellations: string[];
  annualSavings: Cents;
  speech: string;
}

export function auditSubscriptions(household: Household, today: Date): SubscriptionAudit {
  const subs = household.subscriptions;
  const daysSinceUsed = (s: Subscription) => Math.floor((today.getTime() - Date.parse(s.lastUsed)) / MS_PER_DAY);

  const findings: Finding[] = [];
  for (const s of subs) {
    const days = daysSinceUsed(s);
    if (days > UNUSED_AFTER_DAYS) {
      findings.push({ name: s.name, monthly: s.monthly, kind: "unused", detail: `Not used in ${days} days.` });
    }
    if (s.previousMonthly !== undefined && s.monthly > s.previousMonthly) {
      findings.push({
        name: s.name,
        monthly: s.monthly,
        kind: "price_increase",
        detail: `Went up from ${formatUsd(s.previousMonthly)} to ${formatUsd(s.monthly)} a month.`,
      });
    }
  }

  // Too many of one kind (say, 3 streaming services): flag the least used one.
  for (const [kind, group] of Map.groupBy(subs, (s) => s.kind)) {
    if (group.length < OVERLAP_COUNT) continue;
    const leastUsed = group.reduce((a, b) => (daysSinceUsed(a) >= daysSinceUsed(b) ? a : b));
    const alreadyFlagged = findings.some((f) => f.name === leastUsed.name && f.kind === "unused");
    if (!alreadyFlagged) {
      findings.push({
        name: leastUsed.name,
        monthly: leastUsed.monthly,
        kind: "overlap",
        detail: `You pay for ${group.length} ${kind} services, and this is the least used.`,
      });
    }
  }

  // A price increase alone isn't a reason to cancel, so it's reported but not suggested.
  const suggestedCancellations = [...new Set(findings.filter((f) => f.kind !== "price_increase").map((f) => f.name))];
  const monthlySavings = subs.filter((s) => suggestedCancellations.includes(s.name)).reduce((sum, s) => sum + s.monthly, 0);
  const totalMonthly = subs.reduce((sum, s) => sum + s.monthly, 0);

  const speech =
    suggestedCancellations.length > 0
      ? `You spend ${formatUsd(totalMonthly)} a month on subscriptions. Canceling ${joinNames(suggestedCancellations)} would save ${formatUsd(monthlySavings * 12)} a year.`
      : `Your ${subs.length} subscriptions all look used. You spend ${formatUsd(totalMonthly)} a month on them.`;

  return { totalMonthly, findings, suggestedCancellations, annualSavings: monthlySavings * 12, speech };
}

/** ["A"] -> "A", ["A", "B"] -> "A and B", ["A", "B", "C"] -> "A, B and C" */
function joinNames(names: string[]): string {
  return names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}
/** Finds a subscription by name, ignoring case: Alexa may say "peloton app". */
export function findSubscription(household: Household, name: string): Subscription | undefined {
  const wanted = name.trim().toLowerCase();
  return household.subscriptions.find((s) => s.name.toLowerCase() === wanted);
}

export function cancelSubscription(household: Household, subscription: Subscription): string {
  household.subscriptions = household.subscriptions.filter((s) => s !== subscription);
  return `Canceled ${subscription.name}. That saves ${formatUsd(subscription.monthly * 12)} a year.`;
}
