export function parseWeekStartDay(raw: string | undefined): number {
  const n = parseInt(raw ?? "1", 10);
  return Math.max(0, Math.min(6, isNaN(n) ? 1 : n));
}
