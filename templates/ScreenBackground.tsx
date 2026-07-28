import React from "react";
import { useTheme } from "../theme/ThemeContext";
import { ThemedBackground } from "../theme/backgrounds";

interface ScreenBackgroundProps {
  /**
   * Page ID from PAGE_TEMPLATES (e.g. "overview", "meals").
   * Used to look up theme.pageBackgrounds overrides for premium themes.
   * Falls back to the palette SVG scene when no override is set.
   */
  pageId?: string;
  /** Optional opacity override. Default 1 (uses the scene's built-in opacity). */
  opacity?: number;
}

/**
 * Drop-in decorative background for any screen.
 * Must be the first child inside the root View/LinearGradient so content
 * appears on top. Uses pointerEvents="none" internally so it never
 * intercepts touches.
 *
 *   <View style={{ flex: 1 }}>
 *     <ScreenBackground pageId="overview" />
 *     <ScrollView>...</ScrollView>
 *   </View>
 */
export function ScreenBackground({ pageId = "", opacity }: ScreenBackgroundProps) {
  return <ThemedBackground pageId={pageId} opacity={opacity} />;
}
