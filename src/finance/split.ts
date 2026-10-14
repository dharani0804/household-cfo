import { type Cents, formatUsd } from "../money.js";

export interface Share {
  name: string;
  amount: Cents;
}

export interface SplitResult {
  total: Cents;
  tip: Cents;
  shares: Share[];
  speech: string;
}

/**
 * Splits a bill evenly. Leftover cents go one each to the first people in the list,
 * so the shares always add up to the exact total.
 */
export function splitBill(amount: Cents, people: string[], tipPercent = 0): SplitResult {
  if (people.length === 0) throw new Error("Need at least one person to split with.");

  const total = Math.round(amount * (1 + tipPercent / 100));
  const base = Math.floor(total / people.length);
  const leftover = total - base * people.length;
  const shares = people.map((name, i) => ({ name, amount: base + (i < leftover ? 1 : 0) }));

  const tipText = tipPercent > 0 ? `, including a ${tipPercent}% tip` : "";
  const each = leftover === 0 ? `${formatUsd(base)} each` : `about ${formatUsd(base)} each`;
  return {
    total,
    tip: total - amount,
    shares,
    speech: `${formatUsd(total)} split ${people.length} ways is ${each}${tipText}.`,
  };
}
