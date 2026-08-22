// Leaf module: font constants only, no app imports. Breaks the require cycle
// fontSystem → AppSettingsContext → globalFont → fontSystem, which crashed the
// web bundle with a TDZ error.
import { Platform } from "react-native";

export const FONT_FAMILIES = {
  Nunito: "Nunito_400Regular",
  System: undefined,
  Serif: Platform.select({ ios: "Georgia", android: "serif", default: "serif" }),
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

export function resolveFontForWeight(
  key: FontFamilyKey,
  weight?: string | number,
): string | undefined {
  if (key === "Nunito") {
    return NUNITO_WEIGHT_MAP[String(weight ?? "400")] ?? "Nunito_400Regular";
  }
  return FONT_FAMILIES[key];
}

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
