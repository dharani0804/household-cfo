import type { Category, Household } from "../household.js";
import { type Cents, formatUsd } from "../money.js";
import { toIsoDate } from "../dates.js";
import { categoryStatus } from "./budget.js";
import { SAFETY_BUFFER, type UpcomingBill, billsDueBeforePayday, nextPayday, safeToSpend } from "./cashflow.js";

/**
 * yes:     fits the category budget and is safe to spend.
 * stretch: safe to spend, but puts the category over budget.
 * no:      would eat into bills or the safety cushion.
 */
export type Verdict = "yes" | "stretch" | "no";

/** Categories we can suggest borrowing from. Essentials like groceries are never raided. */
const FLEXIBLE_CATEGORIES: readonly Category[] = ["shopping", "entertainment", "dining", "home", "other"];

export interface PurchaseRequest {
  item: string;
  amount: Cents;
  category: Category;
}

export interface AffordabilityCheck {
  verdict: Verdict;
  request: PurchaseRequest;
  categoryRemaining: Cents;
  safeToSpend: Cents;
  billsDue: UpcomingBill[];
  coverFrom?: { category: Category; remaining: Cents };
  reasons: string[];
  speech: string;
}

export function checkAffordability(household: Household, request: PurchaseRequest, today: Date): AffordabilityCheck {
  const { amount, category } = request;
  const remaining = categoryStatus(household, category, today).remaining;
  const safe = safeToSpend(household, today);
  const billsDue = billsDueBeforePayday(household, today);
  const billsTotal = billsDue.reduce((sum, b) => sum + b.amount, 0);

  const reasons = [
    `${formatUsd(billsTotal)} in bills are due before payday, so ${formatUsd(Math.max(safe, 0))} is safe to spend after a ${formatUsd(SAFETY_BUFFER)} cushion.`,
  ];
  let verdict: Verdict;
  let coverFrom: AffordabilityCheck["coverFrom"];

  if (amount > safe) {
    verdict = "no";
    reasons.push(`${formatUsd(amount)} is ${formatUsd(amount - safe)} more than is safe to spend before payday.`);
  } else if (amount <= remaining) {
    verdict = "yes";
    reasons.push(`It fits in the ${category} budget, leaving ${formatUsd(remaining - amount)}.`);
  } else {
    verdict = "stretch";
    const shortBy = amount - Math.max(remaining, 0);
    reasons.push(`It puts ${category} over budget by ${formatUsd(shortBy)}.`);
    coverFrom = findCategoryToCover(household, category, shortBy, today);
    if (coverFrom) {
      reasons.push(`You could cover the gap from ${coverFrom.category}, which has ${formatUsd(coverFrom.remaining)} left.`);
    }
  }

  const check = { verdict, request, categoryRemaining: remaining, safeToSpend: safe, billsDue, coverFrom, reasons };
  return { ...check, speech: describeCheck(check, household, today) };
}

/** The flexible category with the most money left that can absorb the gap. */
function findCategoryToCover(household: Household, exclude: Category, shortBy: Cents, today: Date) {
  return FLEXIBLE_CATEGORIES.filter((c) => c !== exclude)
    .map((c) => categoryStatus(household, c, today))
    .filter((s) => s.remaining >= shortBy)
    .sort((a, b) => b.remaining - a.remaining)
    .map((s) => ({ category: s.category, remaining: s.remaining }))[0];
}

function describeCheck(check: Omit<AffordabilityCheck, "speech">, household: Household, today: Date): string {
  const { verdict, request, categoryRemaining, reasons } = check;
  switch (verdict) {
    case "yes":
      return `Yes, you can afford the ${request.item}. You'd still have ${formatUsd(categoryRemaining - request.amount)} left for ${request.category} this month.`;
    case "stretch":
      return `You can, but it's a stretch. ${reasons.slice(1).join(" ")}`;
    case "no":
      return `I'd hold off. ${reasons[1]} Payday is ${toIsoDate(nextPayday(household, today))}.`;
  }
}
