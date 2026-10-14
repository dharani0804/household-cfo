import { CATEGORIES, type Category, type Household } from "../household.js";
import { type Cents, formatUsd } from "../money.js";
import { toIsoDate } from "../dates.js";

/** A category counts as "close to the limit" from this share of its budget. */
export const NEAR_LIMIT_PERCENT = 80;

export interface CategoryStatus {
  category: Category;
  budget: Cents;
  spent: Cents;
  remaining: Cents;
  percentUsed: number;
}

export interface BudgetSummary {
  month: string; // "YYYY-MM"
  totalBudget: Cents;
  totalSpent: Cents;
  categories: CategoryStatus[];
  overBudget: Category[];
  nearLimit: Category[];
  speech: string;
}

export function monthOf(date: Date): string {
  return toIsoDate(date).slice(0, 7);
}

export function categoryStatus(household: Household, category: Category, today: Date): CategoryStatus {
  const month = monthOf(today);
  const spent = household.transactions
    .filter((t) => t.category === category && t.date.startsWith(month))
    .reduce((sum, t) => sum + t.amount, 0);
  const budget = household.budgets[category];

  return {
    category,
    budget,
    spent,
    remaining: budget - spent,
    percentUsed: budget > 0 ? Math.round((spent / budget) * 100) : 0,
  };
}

export function summarizeBudget(household: Household, today: Date): BudgetSummary {
  const categories = CATEGORIES.map((c) => categoryStatus(household, c, today));
  const totalBudget = categories.reduce((sum, c) => sum + c.budget, 0);
  const totalSpent = categories.reduce((sum, c) => sum + c.spent, 0);
  const overBudget = categories.filter((c) => c.remaining < 0).map((c) => c.category);
  const nearLimit = categories
    .filter((c) => c.remaining >= 0 && c.percentUsed >= NEAR_LIMIT_PERCENT)
    .map((c) => c.category);

  return {
    month: monthOf(today),
    totalBudget,
    totalSpent,
    categories,
    overBudget,
    nearLimit,
    speech: describeBudget(totalSpent, totalBudget, categories, nearLimit),
  };
}

/** Builds the sentence the voice assistant reads aloud. */
function describeBudget(totalSpent: Cents, totalBudget: Cents, categories: CategoryStatus[], nearLimit: Category[]): string {
  const parts = [`You've spent ${formatUsd(totalSpent)} of ${formatUsd(totalBudget)} this month.`];
  const over = categories.filter((c) => c.remaining < 0);

  if (over.length > 0) {
    parts.push(`Over budget: ${over.map((c) => `${c.category} by ${formatUsd(-c.remaining)}`).join(", ")}.`);
  }
  if (nearLimit.length > 0) {
    parts.push(`Close to the limit: ${nearLimit.join(", ")}.`);
  }
  if (over.length === 0 && nearLimit.length === 0) {
    parts.push("Every category is on track.");
  }
  return parts.join(" ");
}