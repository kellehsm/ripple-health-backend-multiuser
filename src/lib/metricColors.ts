// Single source of truth for value-threshold coloring of health metrics.
// Extend here rather than inlining new threshold logic at call sites.

type Palette = { fg: string; bg: string; border: string };

export type MetricKind = "glucose" | "heartRate" | "sleep";

type ThemeLike = {
  berry: { solid: string; bg: string; sub: string };
  amber?: { solid: string; bg: string; sub: string };
  red?: { solid: string; bg: string; sub: string };
  success?: string;
  warning?: string;
  danger?: string;
};

function glucosePalette(mgDl: number | null, theme: ThemeLike): Palette {
  if (mgDl === null) return { fg: theme.berry.solid, bg: theme.berry.bg, border: theme.berry.solid };
  const successColor = theme.success ?? "#1A9870";
  const warningColor = theme.warning ?? "#B88820";
  const dangerColor  = theme.danger  ?? "#C02840";
  if (mgDl < 70 || mgDl > 180) return { fg: dangerColor,  bg: dangerColor  + "18", border: dangerColor  };
  if (mgDl <= 140)              return { fg: successColor, bg: successColor + "18", border: successColor };
  return                               { fg: warningColor, bg: warningColor + "18", border: warningColor };
}

// Heart rate coloring: neutral berry by default; if bpm > 180 or < 40 flag as alert.
function heartRatePalette(bpm: number | null, theme: ThemeLike): Palette {
  if (bpm === null) return { fg: theme.berry.solid, bg: theme.berry.bg, border: theme.berry.solid };
  const dangerColor = theme.danger ?? "#C02840";
  if (bpm > 180 || bpm < 40) return { fg: dangerColor, bg: dangerColor + "18", border: dangerColor };
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
