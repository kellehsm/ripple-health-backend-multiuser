const TZ = 'America/New_York';
const FMT = new Intl.DateTimeFormat('en-CA', { timeZone: TZ });
const DOW_FMT = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' });
const DOW_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Returns YYYY-MM-DD for today in EST. */
export function estToday(): string {
  return FMT.format(new Date());
}

/** Returns YYYY-MM-DD for yesterday in EST. */
export function estYesterday(): string {
  return FMT.format(new Date(Date.now() - 86400000));
}

/** Returns YYYY-MM-DD for N days ago in EST. */
export function estDaysAgo(n: number): string {
  return FMT.format(new Date(Date.now() - n * 86400000));
}

/** Day-of-week index (0=Sun..6=Sat) in EST for the given Date or ISO string. */
export function estDayOfWeek(d: Date | string): number {
  const date = d instanceof Date ? d : new Date(d);
  return DOW_INDEX[DOW_FMT.format(date)] ?? 0;
}

/** Day-of-week index (0=Sun..6=Sat) in EST for a YYYY-MM-DD string, anchored at EST noon. */
export function estDayOfWeekForDayStr(dayStr: string): number {
  // Parse as UTC noon then read the EST weekday — avoids server-tz drift.
  return estDayOfWeek(new Date(dayStr + "T16:00:00Z"));
}
