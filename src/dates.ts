/** Dates are plain "YYYY-MM-DD" strings in UTC so they compare and sort as text. */
export type IsoDate = string;

export function toIsoDate(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

export function daysBefore(date: Date, days: number): IsoDate {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() - days);
  return toIsoDate(copy);
}