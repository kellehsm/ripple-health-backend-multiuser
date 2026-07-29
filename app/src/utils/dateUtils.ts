/**
 * Shared date/time utility functions.
 */

const EST_TZ = 'America/New_York';

/** Returns YYYY-MM-DD for today in EST. */
export function todayEST(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: EST_TZ }).format(new Date());
}

/** Returns the ISO date string (YYYY-MM-DD) of Sunday of the current week in EST. */
export function getWeekStartISO(): string {
  const today = todayEST();
  const d = new Date(today + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().slice(0, 10);
}

/**
 * Formats an ISO date string for display.
 * Shows "Today" or "Yesterday" for recent dates, otherwise "Mon D".
 */
export function formatDisplayDate(iso: string): string {
  const today = todayEST();
  const yesterday = new Intl.DateTimeFormat('en-CA', { timeZone: EST_TZ }).format(new Date(Date.now() - 86400000));
  if (iso.slice(0, 10) === today) return 'Today';
  if (iso.slice(0, 10) === yesterday) return 'Yesterday';
  const d = new Date(iso + 'T12:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: EST_TZ });
}

/** Formats a duration in seconds as "Xh Ym" or "Ym". */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** Formats a duration in seconds as "H:MM:SS" or "MM:SS". */
export function formatSecs(totalSecs: number): string {
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
