/**
 * Font system for Ripple Wellness.
 *
 * Font families: constrained to cross-platform system fonts that are
 * verified available on both Android (API 21+) and iOS 14+.
 * No external font files are loaded — all entries use Platform.select
 * to pick the closest equivalent on each platform.
 *
 * Font size scale: a multiplier applied to the base FONT_SIZES token
 * values. Works IN ADDITION TO (not instead of) system accessibility
 * font scaling — the two multiply together so users who have large
 * system fonts still benefit from their preference.
 *
 * Usage:
 *   const { body, heading } = useFontSizes();
 *   <Text style={{ fontSize: body }}>...</Text>
 *
 *   const ff = useFontFamily();
 *   <Text style={{ fontFamily: ff }}>...</Text>
 */

import { FONT_SIZES } from "./tokens";
import { useAppSettings } from "./AppSettingsContext";

export {
  FONT_FAMILIES,
  type FontFamilyKey,
  FONT_FAMILY_KEYS,
  FONT_FAMILY_LABELS,
  DEFAULT_FONT_FAMILY,
  NUNITO_WEIGHT_MAP,
  resolveFontForWeight,
  FONT_SCALE_PRESETS,
  type FontScalePreset,
  FONT_SCALE_KEYS,
  FONT_SCALE_LABELS,
  DEFAULT_FONT_SCALE,
} from "./fontFamilies";
import { FONT_FAMILIES, DEFAULT_FONT_FAMILY, FONT_SCALE_PRESETS, DEFAULT_FONT_SCALE } from "./fontFamilies";

// ─── Hooks ────────────────────────────────────────────────────────────────────

/**
 * Returns FONT_SIZES with every value multiplied by the current scale setting.
 * This scales IN ADDITION TO the OS font accessibility scale — they compound.
 *
 * Example:
 *   User has OS accessibility scale 1.2 (large text setting)
 *   App scale preset "large" = 1.125
 *   Effective scale on body text: 14 * 1.125 = 15.75 → rendered at ~18.9px after OS scale
 */
export function useFontSizes(): { readonly [K in keyof typeof FONT_SIZES]: number } {
  const { fontSizeScale } = useAppSettings();
  const mult = FONT_SCALE_PRESETS[fontSizeScale ?? DEFAULT_FONT_SCALE];
  if (mult === 1.0) return FONT_SIZES; // fast path — avoid object allocation

  return {
    micro:      Math.round(FONT_SIZES.micro      * mult),
    caption:    Math.round(FONT_SIZES.caption    * mult),
    label:      Math.round(FONT_SIZES.label      * mult),
    body:       Math.round(FONT_SIZES.body       * mult),
    subheading: Math.round(FONT_SIZES.subheading * mult),
    heading:    Math.round(FONT_SIZES.heading    * mult),
    title:      Math.round(FONT_SIZES.title      * mult),
    display:    Math.round(FONT_SIZES.display    * mult),
  };
}

/**
 * Returns the resolved fontFamily string for the current theme setting.
 * Pass directly to a Text or TextInput's fontFamily style prop.
 * Returns undefined for "System" (React Native default).
 */
export function useFontFamily(): string | undefined {
  const { fontFamily } = useAppSettings();
  return FONT_FAMILIES[fontFamily ?? DEFAULT_FONT_FAMILY];
}
