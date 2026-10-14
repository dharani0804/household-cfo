
/**
 * Money is stored as integer cents everywhere in the app.
 * Floating point dollars drift: 0.1 + 0.2 === 0.30000000000000004.
 */
export type Cents = number;

export function toCents(usd: number): Cents {
  return Math.round(usd * 100);
}

const usdFormat = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** Formats cents for speech and display: 24000 -> "$240", 151889 -> "$1,518.89". */
export function formatUsd(cents: Cents): string {
  const text = usdFormat.format(cents / 100);
  return text.endsWith(".00") ? text.slice(0, -3) : text;
}