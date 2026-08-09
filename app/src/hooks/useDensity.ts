/**
 * Density mode + Dynamic Type multiplier.
 *
 * Density is a user Setting: "compact" | "comfortable" | "spacious".
 * `scale(px)` returns the pixel value adjusted for both density AND the
 * OS font-scale (Dynamic Type). Wrap any hard-coded size in `scale(...)`
 * to make the app respect both.
 */

import { PixelRatio, useWindowDimensions } from "react-native";
import { useAppSettings } from "../theme/AppSettingsContext";

const DENSITY_MULT: Record<string, number> = {
  compact: 0.9,
  comfortable: 1.0,
  spacious: 1.12,
};

export function useDensity() {
  const settings = useAppSettings() as any;
  const density: string = settings?.density ?? "comfortable";
  const dMult = DENSITY_MULT[density] ?? 1;

  // OS font scale — capped so 200% doesn't blow layouts up entirely.
  const fontScale = Math.min(1.6, PixelRatio.getFontScale());

  return {
    density,
    /** scale a numeric size by density × font scale */
    scale: (px: number) => Math.round(px * dMult * fontScale),
    /** for spacing that should NOT scale with font — dividers, gaps */
    space: (px: number) => Math.round(px * dMult),
    /** for text sizes specifically */
    text: (px: number) => Math.round(px * dMult * fontScale),
  };
}

export function useWindowSize() {
  const { width, height } = useWindowDimensions();
  return {
    width,
    height,
    isSmall: width < 380,
    isTablet: width >= 720,
    orientation: width > height ? ("landscape" as const) : ("portrait" as const),
  };
}
