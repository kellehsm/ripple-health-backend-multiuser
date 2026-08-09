/**
 * Number, currency, and time formatters.
 *
 * WHY: Formatting was inconsistent — 18 sites used `toLocaleString` in
 * different ways, some hard-coded "$", relative times were computed inline
 * everywhere. Route everything through here so units, precision, and
 * locale changes are one-line edits.
 */

const numFmt = new Intl.NumberFormat();

/** 1234 → "1,234"   /   12.567 → "12.6" */
export function formatNumber(v: number | null | undefined, digits = 0): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (digits > 0) return v.toFixed(digits);
  return Math.round(v).toLocaleString();
}

export function formatCurrency(v: number | null | undefined, currency = "USD"): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(v);
}

export function formatPercent(v: number | null | undefined, digits = 0): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(digits)}%`;
}

/** With user's chosen unit — e.g. "72 bpm", "8,432 steps", "185 mg/dL" */
export function formatWithUnit(v: number | null | undefined, unit: string, digits = 0): string {
  return `${formatNumber(v, digits)} ${unit}`;
}

/** "1h 23m" / "45m" / "12s" */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "—";
  const s = Math.round(seconds);
  if (s < 60)  return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60)  return `${m}m`;
  const h = Math.floor(m / 60);
  const mr = m % 60;
  return mr === 0 ? `${h}h` : `${h}h ${mr}m`;
}

/** Relative time — "just now" / "3 min ago" / "yesterday" / "3 days ago" */
export function formatRelativeTime(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const then = typeof iso === "string" ? new Date(iso).getTime() : iso.getTime();
  const now = Date.now();
  const diffSec = Math.round((now - then) / 1000);
  if (diffSec < 0)  return "in the future";
  if (diffSec < 30) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day === 1) return "yesterday";
  if (day < 7)   return `${day} days ago`;
  const wk = Math.floor(day / 7);
  if (wk < 5)    return `${wk}w ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12)   return `${mo}mo ago`;
  return `${Math.floor(day / 365)}y ago`;
}

/** "Mon Aug 4" — used by chart tooltips and history rows. */
export function formatShortDate(iso: string | Date | null | undefined): string {
  if (!iso) return "";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

/** "8:43 AM" — used inline for events. */
export function formatTime(iso: string | Date | null | undefined): string {
  if (!iso) return "";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
