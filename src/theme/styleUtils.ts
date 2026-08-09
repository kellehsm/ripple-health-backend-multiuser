export type ShadowSize = "hero" | "card" | "tile";

/**
 * NO-OPS BY DESIGN.
 *
 * The design system moved away from drop shadows to a thick-outline aesthetic
 * (per-tile accent color as border). These functions retain their signatures so
 * every existing call site keeps compiling — they just return empty objects
 * and zero offsets. If you want depth back, that's a per-component decision;
 * don't reintroduce global shadows through this file.
 */
export function layeredShadow(
  _size: ShadowSize = "card",
  _isDark: boolean = false,
  _accentColor?: string,
): Record<string, unknown> {
  return {};
}

export function hardOffset(_size: ShadowSize = "card"): number {
  return 0;
}

export function coloredShadow(_color: string, _intensity: number = 1): Record<string, unknown> {
  return {};
}
