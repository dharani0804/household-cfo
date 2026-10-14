import type { Household } from "../household.js";
import { type Cents, toCents } from "../money.js";
import { type IsoDate, toIsoDate } from "../dates.js";

/** Cash we never plan to spend, so a "yes" always leaves a cushion. */
export const SAFETY_BUFFER: Cents = toCents(500);

export interface UpcomingBill {
  name: string;
  amount: Cents;
  date: IsoDate;
}

/** The next payday strictly after today. */
export function nextPayday(household: Household, today: Date): Date {
  const payday = utcDate(today.getUTCFullYear(), today.getUTCMonth(), household.paydayDayOfMonth);
  if (payday <= today) payday.setUTCMonth(payday.getUTCMonth() + 1);
  return payday;
}

/**
 * Bills that leave the account after today and before the next payday.
 * A bill due on payday itself is paid from the new paycheck, so it is excluded.
 */
export function billsDueBeforePayday(household: Household, today: Date): UpcomingBill[] {
  const payday = nextPayday(household, today);
  const due: UpcomingBill[] = [];

  for (const bill of household.bills) {
    // Check this month's and next month's due date, since payday can fall in either.
    for (const monthOffset of [0, 1]) {
      const dueDate = utcDate(today.getUTCFullYear(), today.getUTCMonth() + monthOffset, bill.dayOfMonth);
      if (dueDate > today && dueDate < payday) {
        due.push({ name: bill.name, amount: bill.amount, date: toIsoDate(dueDate) });
      }
    }
  }
  return due.sort((a, b) => a.date.localeCompare(b.date));
}

/** What can be spent before payday without touching bills or the safety cushion. */
export function safeToSpend(household: Household, today: Date): Cents {
  const billsTotal = billsDueBeforePayday(household, today).reduce((sum, b) => sum + b.amount, 0);
  return household.checkingBalance - billsTotal - SAFETY_BUFFER;
}

/** Date.UTC rolls over months and years for us: month 12 becomes January of next year. */
function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day));
}