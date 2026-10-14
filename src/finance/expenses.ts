import type { Category, Household, Transaction } from "../household.js";
import { type Cents, formatUsd } from "../money.js";
import { toIsoDate } from "../dates.js";
import { type CategoryStatus, NEAR_LIMIT_PERCENT, categoryStatus } from "./budget.js";

export interface ExpenseInput {
  amount: Cents;
  category: Category;
  merchant: string;
  memberId?: string;
}

export interface ExpenseResult {
  transaction: Transaction;
  status: CategoryStatus;
  speech: string;
}

/**
 * Records money already spent. This is the one place that changes the household's
 * transactions and balance, so every write goes through the same rules.
 */
export function recordExpense(household: Household, input: ExpenseInput, today: Date): ExpenseResult {
  const transaction: Transaction = {
    id: `t${household.transactions.length + 1}`,
    date: toIsoDate(today),
    amount: input.amount,
    category: input.category,
    merchant: input.merchant,
    memberId: resolveMember(household, input.memberId),
  };

  household.transactions.push(transaction);
  household.checkingBalance -= input.amount;

  const status = categoryStatus(household, input.category, today);
  return { transaction, status, speech: describeExpense(transaction, status) };
}

/** Unknown or missing member ids fall back to the first adult, so a typo never loses an expense. */
export function resolveMember(household: Household, memberId?: string): string {
  const member = household.members.find((m) => m.id === memberId) ?? household.members.find((m) => m.role === "adult");
  if (!member) throw new Error("Household has no adults.");
  return member.id;
}

function describeExpense(t: Transaction, status: CategoryStatus): string {
  const logged = `Logged ${formatUsd(t.amount)} at ${t.merchant}.`;
  if (status.remaining < 0) {
    return `${logged} That puts ${t.category} over budget by ${formatUsd(-status.remaining)}.`;
  }
  const left = `${formatUsd(status.remaining)} left for ${t.category} this month.`;
  if (status.percentUsed >= NEAR_LIMIT_PERCENT) {
    return `${logged} ${left} Heads up, that's ${status.percentUsed}% of the budget.`;
  }
  return `${logged} ${left}`;
}
