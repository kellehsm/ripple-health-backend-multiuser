// ─── Date Utilities ──────────────────────────────────────────────────────────
// Canonical date/time helpers extracted from screen files.

/** Returns today's date as a YYYY-MM-DD string (local time). */
export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Returns a YYYY-MM-DD string for a Date object, using local time components.
 * Use this instead of `.toISOString().slice(0,10)` when you need the *local* date.
 */
export function formatDateLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + d;
}

/**
 * Adds `n` days to a YYYY-MM-DD string and returns the resulting YYYY-MM-DD string.
 * Uses ISO math (UTC) — safe for arithmetic where local-midnight drift doesn't matter.
 */
export function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Adds `n` days to a Date object and returns a new Date.
 */
export function addDaysToDate(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Returns the Monday-anchored start of the current week as YYYY-MM-DD.
 * (Uses Sunday as start-of-week to match leaderboard/existing behavior.)
 */
export function getWeekStart(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().slice(0, 10);
}

/**
 * Formats a YYYY-MM-DD date string as "Mon Jan 1" style, with "Today" / "Yesterday" substitution.
 * Equivalent to FinanceScreen's `formatDayHeader`.
 */
export function formatDayHeader(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.getTime() === today.getTime()) return "Today";
  if (date.getTime() === yesterday.getTime()) return "Yesterday";
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/**
 * Formats an ISO datetime string as a time string: "HH:MM" (24-hour, zero-padded).
 * Used in OverviewScreen for glucose/event time display.
 */
export function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.getHours().toString().padStart(2, "0") + ":" + d.getMinutes().toString().padStart(2, "0");
}

/**
 * Formats an ISO datetime string as a 12-hour time with AM/PM: e.g. "3:45 PM".
 * Used in FinanceScreen for transaction time display.
 */
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/**
 * Formats an ISO date string as "Jan 1" (month + day, no year).
 * Used in ExperimentScreen, HealthTabScreen.
 */
export function fmtDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Formats a start+end date pair as "Jan 1 – Jan 7".
 */
export function fmtDateRange(start: string, end: string): string {
  return fmtDate(start) + " – " + fmtDate(end);
}

/**
 * Formats an ISO date string as "Jan 1, 2025" (month + day + year).
 * Used in HistoryScreen, CompletedScreen, BanksSettingsScreen.
 */
export function formatDate(str: string): string {
  return new Date(str).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Formats an ISO datetime string as "Jan 1, 2025 02:30 PM".
 * Used in MedicationHistoryScreen.
 */
export function formatDateWithTime(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
    " " +
    d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
  );
}

/**
 * Returns the abbreviated day-of-week label for a YYYY-MM-DD string.
 * Uses noon to avoid DST edge cases: "Sun","Mon","Tue","Wed","Thu","Fri","Sat".
 */
export function fmtDayLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
}

/**
 * Formats a duration in seconds as "Xh Ym" or "--" for zero/negative.
 * Used in OverviewScreen for sleep display.
 */
export function fmtSleep(seconds: number): string {
  if (seconds <= 0) return "--";
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (m === 0) return h + "h";
  return h + "h " + m + "m";
}

/**
 * Full expanded day name lookup (Mon→Monday, etc.).
 * Used in StepsDetailScreen.
 */
export const DAY_NAMES: Record<string, string> = {
  Mon: "Monday",
  Tue: "Tuesday",
  Wed: "Wednesday",
  Thu: "Thursday",
  Fri: "Friday",
  Sat: "Saturday",
  Sun: "Sunday",
};
