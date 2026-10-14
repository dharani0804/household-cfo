import { type Cents, toCents } from "./money.js";
import { type IsoDate, daysBefore } from "./dates.js";

/** The single list of budget categories. The Category type is derived from it. */
export const CATEGORIES = [
  "groceries",
  "dining",
  "kids",
  "transport",
  "entertainment",
  "shopping",
  "health",
  "home",
  "subscriptions",
  "other",
] as const;

export type Category = (typeof CATEGORIES)[number];

export interface Member {
  id: string;
  name: string;
  role: "adult" | "child";
}

export interface Transaction {
  id: string;
  date: IsoDate;
  amount: Cents; // positive means money spent
  category: Category;
  merchant: string;
  memberId: string;
  note?: string;
}

export interface Bill {
  name: string;
  amount: Cents;
  dayOfMonth: number;
}

export interface Subscription {
  name: string;
  monthly: Cents;
  kind: "streaming" | "music" | "fitness" | "news" | "software" | "kids";
  lastUsed: IsoDate;
  previousMonthly?: Cents; // set when the price went up recently
}

export interface Goal {
  name: string;
  target: Cents;
  saved: Cents;
  monthlyContribution: Cents;
}

export interface Decision {
  id: string;
  date: IsoDate;
  memberId: string;
  text: string;
  tags: string[];
}

export interface Household {
  name: string;
  members: Member[];
  checkingBalance: Cents;
  monthlyIncome: Cents;
  paydayDayOfMonth: number;
  budgets: Record<Category, Cents>;
  bills: Bill[];
  subscriptions: Subscription[];
  goals: Goal[];
  transactions: Transaction[];
  decisions: Decision[];
}

/**
 * A believable family of four with spending spread over the current month.
 * Dates are relative to `today`, so the demo always looks current.
 */
export function createDemoHousehold(today: Date): Household {
  const dayOfMonth = today.getUTCDate();
  let nextId = 1;

  // Keeps every demo transaction inside the current month, even early in the month.
  const spent = (daysAgo: number, usd: number, category: Category, merchant: string, memberId: string): Transaction => ({
    id: `t${nextId++}`,
    date: daysBefore(today, Math.min(daysAgo, dayOfMonth - 1)),
    amount: toCents(usd),
    category,
    merchant,
    memberId,
  });

  return {
    name: "The Rao family",
    members: [
      { id: "dharani", name: "Dharani", role: "adult" },
      { id: "priya", name: "Priya", role: "adult" },
      { id: "anika", name: "Anika", role: "child" },
      { id: "dev", name: "Dev", role: "child" },
    ],
    checkingBalance: toCents(3840),
    monthlyIncome: toCents(9200),
    paydayDayOfMonth: 1,
    budgets: {
      groceries: toCents(1100),
      dining: toCents(350),
      kids: toCents(400),
      transport: toCents(300),
      entertainment: toCents(150),
      shopping: toCents(300),
      health: toCents(150),
      home: toCents(200),
      subscriptions: toCents(120),
      other: toCents(100),
    },
    bills: [
      { name: "Rent", amount: toCents(2600), dayOfMonth: 1 },
      { name: "Car payment", amount: toCents(410), dayOfMonth: 15 },
      { name: "Electric", amount: toCents(140), dayOfMonth: 20 },
      { name: "Internet", amount: toCents(70), dayOfMonth: 22 },
      { name: "Phone plan", amount: toCents(95), dayOfMonth: 25 },
    ],
    subscriptions: [
      { name: "Netflix", monthly: toCents(17.99), kind: "streaming", lastUsed: daysBefore(today, 2) },
      { name: "Disney+", monthly: toCents(13.99), kind: "streaming", lastUsed: daysBefore(today, 61) },
      { name: "Max", monthly: toCents(16.99), kind: "streaming", lastUsed: daysBefore(today, 9), previousMonthly: toCents(15.99) },
      { name: "Spotify Family", monthly: toCents(19.99), kind: "music", lastUsed: daysBefore(today, 0) },
      { name: "Peloton App", monthly: toCents(24), kind: "fitness", lastUsed: daysBefore(today, 74) },
      { name: "ABCmouse", monthly: toCents(12.99), kind: "kids", lastUsed: daysBefore(today, 3) },
    ],
    goals: [
      { name: "Emergency fund", target: toCents(15000), saved: toCents(8200), monthlyContribution: toCents(500) },
      { name: "Hyderabad trip", target: toCents(6000), saved: toCents(2150), monthlyContribution: toCents(400) },
    ],
    transactions: [
      spent(10, 186.4, "groceries", "Costco", "priya"),
      spent(8, 92.15, "groceries", "Trader Joe's", "dharani"),
      spent(3, 141.3, "groceries", "Whole Foods", "priya"),
      spent(9, 64.2, "dining", "Chipotle", "dharani"),
      spent(5, 118.75, "dining", "Paradise Biryani", "priya"),
      spent(1, 46.9, "dining", "Pizza night", "dharani"),
      spent(7, 220, "kids", "Swim lessons", "priya"),
      spent(4, 38.5, "kids", "School supplies", "dharani"),
      spent(6, 58.4, "transport", "Shell", "dharani"),
      spent(2, 61.1, "transport", "Chevron", "priya"),
      spent(6, 72, "entertainment", "AMC tickets", "priya"),
      spent(4, 129.99, "shopping", "Target", "priya"),
      spent(2, 84, "shopping", "Amazon", "dharani"),
      spent(5, 35, "health", "CVS", "priya"),
      spent(3, 64.25, "home", "Home Depot", "dharani"),
      spent(9, 105.95, "subscriptions", "Monthly subscriptions", "dharani"),
    ],
       decisions: [],
  };
}
