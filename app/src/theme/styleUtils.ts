import { Platform } from "react-native";

export type ShadowSize = "hero" | "card" | "tile";

// Hard-offset amounts by size (the ink-colored offset layer lives in ShadowCard)
const HARD: Record<ShadowSize, number> = { hero: 10, card: 7, tile: 4 };

// Soft (atmospheric) shadow params per size
const SOFT: Record<ShadowSize, { oy: number; r: number; opacity: number }> = {
  hero: { oy: 20, r: 36, opacity: 0.32 },
  card: { oy: 14, r: 24, opacity: 0.28 },
  tile: { oy: 8,  r: 14, opacity: 0.22 },
};

const ELEVATION: Record<ShadowSize, number> = { hero: 24, card: 14, tile: 7 };

/**
 * Soft/atmospheric shadow layer styles (used directly on View or via ShadowCard).
 * accentColor: pass a hex color for a colored glow instead of neutral black.
 */
export function layeredShadow(
  size: ShadowSize = "card",
  isDark: boolean = false,
  accentColor?: string,
) {
  const { oy, r, opacity } = SOFT[size];
  const el = ELEVATION[size];
  const sc = accentColor ?? "#000000";
  const op = accentColor ? 0.45 : isDark ? opacity * 0.55 : opacity;

  return Platform.select({
    ios:     { shadowColor: sc, shadowOffset: { width: 0, height: oy }, shadowOpacity: op, shadowRadius: r },
    android: { elevation: el, shadowColor: sc },
    default: { shadowColor: sc, shadowOffset: { width: 0, height: oy }, shadowOpacity: op, shadowRadius: r, elevation: el },
  })!;
}

/** Pixel offset for the hard ink shadow layer (consumed by ShadowCard). */
export function hardOffset(size: ShadowSize = "card"): number {
  return HARD[size];
}

// Legacy — kept for backward compat.
export function coloredShadow(color: string, intensity: number = 1) {
  return {
    shadowColor: color,
    shadowOffset: { width: 0, height: Math.round(6 * intensity) },
    shadowOpacity: 0.18 * intensity,
    shadowRadius: 12 * intensity,
    elevation: Math.round(6 * intensity),
  };
}
