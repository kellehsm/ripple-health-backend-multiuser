/**
 * Converts a hex color + 0-1 alpha into an rgba() string.
 * Accepts 3- or 6-digit hex (#RGB or #RRGGBB). Falls back gracefully
 * if the input is already rgba or cannot be parsed.
 */
export function hexWithAlpha(hex: string, alpha: number): string {
  if (alpha >= 1) return hex;
  const clean = hex.replace("#", "");
  const full = clean.length === 3
    ? clean.split("").map((c) => c + c).join("")
    : clean;
  if (full.length !== 6) return hex; // already rgba or malformed — return as-is
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha.toFixed(2)})`;
}

/**
 * Blends a hex color toward white by `fraction` (0=original, 1=white).
 * Used to simulate frosted-glass lightening on card backgrounds.
 */
export function blendWithWhite(hex: string, fraction: number): string {
  const clean = hex.replace("#", "");
  const full = clean.length === 3
    ? clean.split("").map((c) => c + c).join("")
    : clean;
  if (full.length !== 6) return hex;
  const r = Math.round(parseInt(full.slice(0, 2), 16) + (255 - parseInt(full.slice(0, 2), 16)) * fraction);
  const g = Math.round(parseInt(full.slice(2, 4), 16) + (255 - parseInt(full.slice(2, 4), 16)) * fraction);
  const b = Math.round(parseInt(full.slice(4, 6), 16) + (255 - parseInt(full.slice(4, 6), 16)) * fraction);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

/** Returns "#ffffff" or "#1A1A1A" — whichever has better contrast against hex background. */
export function onSolid(hex: string): "#ffffff" | "#1A1A1A" {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.45 ? "#1A1A1A" : "#ffffff";
}
