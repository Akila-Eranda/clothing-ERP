/**
 * The shop's business day starts at 03:00, not at midnight (the API's shopDateString / shopDayBounds use the same
 * hour). Sales rung up at 01:00 belong to the day the shop opened, so "today" on screen must stay on that date
 * until 03:00. Uses the terminal's local clock; shop terminals run in the shop's timezone.
 */
export const BUSINESS_DAY_START_HOUR = 3;

export function businessDay(now: Date = new Date()): string {
  const shifted = new Date(now.getTime() - BUSINESS_DAY_START_HOUR * 60 * 60 * 1000);
  const y = shifted.getFullYear();
  const m = String(shifted.getMonth() + 1).padStart(2, "0");
  const d = String(shifted.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
