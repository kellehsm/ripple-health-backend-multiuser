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

import { Platform } from "react-native";
import { FONT_SIZES } from "./tokens";
import { useAppSettings } from "./AppSettingsContext";

// ─── Font families ────────────────────────────────────────────────────────────

/**
 * Each entry is a cross-platform safe system font.
 * Values are verified present on:
 *   iOS 14+:     System (SF Pro), Georgia, Palatino, Courier New
 *   Android 5+:  System (Roboto), serif (generic), monospace (generic)
 *
 * "System" maps to undefined (RN uses the platform default — SF Pro / Roboto).
 */
export const FONT_FAMILIES = {
  /** Rounded — Nunito, loaded at splash via @expo-google-fonts/nunito. */
  Nunito: "Nunito_400Regular",

  /** Platform default — SF Pro on iOS, Roboto on Android. */
  System: undefined,

  /**
   * Serif — Georgia on iOS (universally available since iOS 2).
   * Android's "serif" generic maps to Noto Serif on most devices.
   */
  Serif: Platform.select({ ios: "Georgia", android: "serif", default: "serif" }),

  /**
   * Monospace — Courier New on iOS, "monospace" (Droid Mono / Noto Mono) on Android.
   * Use sparingly — primarily for numeric readouts or code-style displays.
   */
  Monospace: Platform.select({ ios: "Courier New", android: "monospace", default: "monospace" }),
} as const;

export type FontFamilyKey = keyof typeof FONT_FAMILIES;

export const FONT_FAMILY_KEYS: FontFamilyKey[] = ["Nunito", "System", "Serif", "Monospace"];

export const FONT_FAMILY_LABELS: Record<FontFamilyKey, string> = {
  Nunito:    "Rounded (Nunito)",
  System:    "System Default",
  Serif:     "Serif (Georgia)",
  Monospace: "Monospace",
};

export const DEFAULT_FONT_FAMILY: FontFamilyKey = "Nunito";

/**
 * Nunito ships one static file per weight, each registered under its own
 * family name. Map a style's fontWeight to the correct file so text gets a
 * true drawn weight instead of Android/iOS synthetic bolding.
 */
export const NUNITO_WEIGHT_MAP: Record<string, string> = {
  "100": "Nunito_400Regular",
  "200": "Nunito_400Regular",
  "300": "Nunito_400Regular",
  "400": "Nunito_400Regular",
  normal: "Nunito_400Regular",
  "500": "Nunito_500Medium",
  "600": "Nunito_600SemiBold",
  "700": "Nunito_700Bold",
  bold:  "Nunito_700Bold",
  "800": "Nunito_800ExtraBold",
  "900": "Nunito_800ExtraBold",
};

/** Resolve the concrete fontFamily for a family key + optional fontWeight. */
export function resolveFontForWeight(
  key: FontFamilyKey,
  weight?: string | number,
): string | undefined {
  if (key === "Nunito") {
    return NUNITO_WEIGHT_MAP[String(weight ?? "400")] ?? "Nunito_400Regular";
  }
  return FONT_FAMILIES[key];
}

// ─── Font size scale ─────────────────────────────────────────────────────────

export const FONT_SCALE_PRESETS = {
  compact: 0.875,
  default: 1.0,
  large:   1.125,
  xlarge:  1.25,
} as const;

export type FontScalePreset = keyof typeof FONT_SCALE_PRESETS;

export const FONT_SCALE_KEYS: FontScalePreset[] = ["compact", "default", "large", "xlarge"];

export const FONT_SCALE_LABELS: Record<FontScalePreset, string> = {
  compact: "Compact",
  default: "Default",
  large:   "Large",
  xlarge:  "Extra Large",
};

export const DEFAULT_FONT_SCALE: FontScalePreset = "default";

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
