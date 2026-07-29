const TZ = 'America/New_York';
const FMT = new Intl.DateTimeFormat('en-CA', { timeZone: TZ });

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
