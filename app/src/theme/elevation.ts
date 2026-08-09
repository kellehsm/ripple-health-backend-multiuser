/**
 * Semantic elevation ladder.
 *
 * Retires the ad-hoc shadow numbers scattered through the app. Every card,
 * modal, sheet, and floating element should pick a level 0–4 so surface
 * depth stays consistent.
 *
 * Level 0 = flat with page (no shadow)
 * Level 1 = tiles resting on the page
 * Level 2 = cards that expand or float slightly (default for InsightCard)
 * Level 3 = sheets / picker modals
 * Level 4 = alerts / celebratory overlays
 */

import { Platform } from "react-native";
import type { ViewStyle } from "react-native";

interface ElevationStyle extends ViewStyle {
  shadowColor?: string;
  shadowOffset?: { width: number; height: number };
  shadowOpacity?: number;
  shadowRadius?: number;
  elevation?: number;
}

const ios = (offY: number, radius: number, opacity: number): ElevationStyle => ({
  shadowColor: "rgba(60,40,20,0.4)",
  shadowOffset: { width: 0, height: offY },
  shadowOpacity: opacity,
  shadowRadius: radius,
});

const android = (elev: number): ElevationStyle => ({ elevation: elev });

function pick(iosStyle: ElevationStyle, androidStyle: ElevationStyle): ElevationStyle {
  return Platform.OS === "ios" ? iosStyle : androidStyle;
}

export const ELEVATION = {
  0: {},
  1: pick(ios(2,  4,  0.08), android(2)),
  2: pick(ios(6,  10, 0.12), android(5)),
  3: pick(ios(14, 22, 0.18), android(10)),
  4: pick(ios(24, 36, 0.24), android(18)),
} as const satisfies Record<0 | 1 | 2 | 3 | 4, ElevationStyle>;

export type ElevationLevel = 0 | 1 | 2 | 3 | 4;
