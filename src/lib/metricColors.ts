// Single source of truth for value-threshold coloring of health metrics.
// Extend here rather than inlining new threshold logic at call sites.

type Palette = { fg: string; bg: string; border: string };

export type MetricKind = "glucose" | "heartRate" | "sleep";

type ThemeLike = {
  berry: { solid: string; bg: string; sub: string };
  amber?: { solid: string; bg: string; sub: string };
  red?: { solid: string; bg: string; sub: string };
};

const GLUCOSE_IN_RANGE:  Palette = { fg: "#27AE60", bg: "#EAF7EE", border: "#27AE60" };
const GLUCOSE_WARN:      Palette = { fg: "#E67E22", bg: "#FEF5E7", border: "#E67E22" };
const GLUCOSE_ALERT:     Palette = { fg: "#C0392B", bg: "#FDEDEC", border: "#C0392B" };

function glucosePalette(mgDl: number | null, theme: ThemeLike): Palette {
  if (mgDl === null) return { fg: theme.berry.solid, bg: theme.berry.bg, border: theme.berry.solid };
  if (mgDl < 70 || mgDl > 180) return GLUCOSE_ALERT;
  if (mgDl <= 140) return GLUCOSE_IN_RANGE;
  return GLUCOSE_WARN;
}

// Heart rate coloring: neutral berry by default; if bpm > 180 or < 40 flag as alert.
function heartRatePalette(bpm: number | null, theme: ThemeLike): Palette {
  if (bpm === null) return { fg: theme.berry.solid, bg: theme.berry.bg, border: theme.berry.solid };
  if (bpm > 180 || bpm < 40) return GLUCOSE_ALERT;
  return { fg: theme.berry.solid, bg: theme.berry.bg, border: theme.berry.sub };
}

// Sleep coloring: uses theme's indigo/sleep palette if provided; degrades to berry.
function sleepPalette(_hours: number | null, theme: ThemeLike): Palette {
  return { fg: theme.berry.solid, bg: theme.berry.bg, border: theme.berry.sub };
}

export function getMetricPalette(kind: MetricKind, value: number | null, theme: ThemeLike): Palette {
  switch (kind) {
    case "glucose":   return glucosePalette(value, theme);
    case "heartRate": return heartRatePalette(value, theme);
    case "sleep":     return sleepPalette(value, theme);
  }
}
