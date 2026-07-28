import React, { useRef, useEffect } from "react";
import { View, ViewStyle, StyleProp, Pressable, Animated, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../theme/ThemeContext";
import { useAppSettings } from "../theme/AppSettingsContext";
import { hexWithAlpha } from "../theme/colorUtils";
import { layeredShadow, hardOffset, ShadowSize } from "../theme/styleUtils";
import { ThemedSurface, useCardBackground, useTileBackground } from "../theme/pageTemplates";
import { SPRING_STANDARD } from "../theme/motion";

interface ShadowCardProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Controls offset + blur magnitude. Default "card". */
  size?: ShadowSize;
  /** Override card background (defaults to theme.card). */
  bg?: string;
  /** Optional accent color — adds a colored atmospheric glow. */
  accent?: string;
  /** Optional slight rotation in degrees for a confident, human feel. */
  rotate?: number;
  /** Border radius. Default 18. */
  radius?: number;
  /** Border color override (defaults to theme.ink). */
  borderColor?: string;
  /** Padding inside the card. Default 14. */
  padding?: number;
  /** When provided, wraps content in a Pressable with scale animation. */
  onPress?: () => void;
  /** When true, renders an animated shimmer placeholder instead of children. */
  skeleton?: boolean;
  /** Height of the skeleton placeholder. Default 80. */
  skeletonHeight?: number;
  /** When set, enables per-card background theming (image or color override). */
  cardId?: string;
  /** When set, enables per-tile background theming (image or color override). */
  tileId?: string;
  /** When true, skips the global card transparency (e.g. solid-color tiles where white text contrast must be preserved). */
  skipTransparency?: boolean;
}

/**
 * The design system's layered-shadow card.
 *
 * Renders three visual layers:
 *   1. Hard ink-colored offset View (absolutely positioned behind, creates the
 *      bold offset shadow that is the key design signature).
 *   2. The card View itself with soft iOS shadow + Android elevation for
 *      atmospheric depth.
 *   3. A 2.5px ink border for the Bold Outline look.
 *
 * Usage:
 *   <ShadowCard size="hero" accent={theme.berry.solid}>
 *     <Text>Glucose: 142</Text>
 *   </ShadowCard>
 */
export function ShadowCard({
  children,
  style,
  size = "card",
  bg,
  accent,
  rotate,
  radius = 18,
  borderColor,
  padding = 14,
  onPress,
  skeleton = false,
  skeletonHeight = 80,
  cardId,
  tileId,
  skipTransparency = false,
}: ShadowCardProps) {
  const { theme } = useTheme();
  const { shadowsEnabled, cardOpacity, perObjectOpacity } = useAppSettings();
  const objectId = cardId ?? tileId;
  const effectiveOpacity = objectId && perObjectOpacity[objectId] !== undefined
    ? perObjectOpacity[objectId]
    : cardOpacity;
  const cardBg = useCardBackground(cardId ?? "");
  const tileBg = useTileBackground(tileId ?? "");
  const bgOverride = cardId ? cardBg : (tileId ? tileBg : null);
  const hasImageBg = bgOverride?.type === "image" || bgOverride?.type === "uri";
  const ink = theme.ink;
  const isDark = theme.isDark;
  const offset = shadowsEnabled ? hardOffset(size) : 0;
  const softShadow = shadowsEnabled ? layeredShadow(size, isDark, accent) : {};

  // In dark mode the hard shadow uses a slightly lighter shade than the card
  // so it remains visible; in light mode it uses the ink color directly.
  const hardColor = isDark ? "rgba(0,0,0,0.75)" : ink;

  const transform = rotate !== undefined ? [{ rotate: `${rotate}deg` }] : undefined;

  // Press-scale animation
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.97,
      useNativeDriver: true,
      ...SPRING_STANDARD,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      ...SPRING_STANDARD,
    }).start();
  };

  // Skeleton shimmer animation
  const shimmerAnim = useRef(new Animated.Value(-300)).current;

  useEffect(() => {
    if (!skeleton) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, {
          toValue: 300,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(shimmerAnim, {
          toValue: -300,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [skeleton, shimmerAnim]);

  const skeletonContent = (
    <View
      style={{
        height: skeletonHeight,
        borderRadius: radius - 4,
        overflow: "hidden",
        backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.06)",
      }}
    >
      <Animated.View
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: 0,
          right: 0,
          transform: [{ translateX: shimmerAnim }],
        }}
      >
        <LinearGradient
          colors={[
            "transparent",
            isDark ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.55)",
            "transparent",
          ]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={{ flex: 1, width: 300 }}
        />
      </Animated.View>
    </View>
  );

  const cardContent = skeleton ? skeletonContent : children;

  const resolvedBg = skipTransparency
    ? (bg ?? theme.card)
    : hexWithAlpha(bg ?? theme.card, effectiveOpacity);

  const cardBody = (
    <View
      style={[
        {
          backgroundColor: resolvedBg,
          borderRadius: radius,
          borderWidth: 2.5,
          borderColor: borderColor ?? ink,
          padding,
          overflow: (cardId || tileId) ? "hidden" : undefined,
          ...softShadow,
        },
        style,
      ]}
    >
      {(cardId || tileId) && (
        <ThemedSurface
          elementId={(cardId ?? tileId)!}
          kind={cardId ? "card" : "tile"}
          style={StyleSheet.absoluteFill}
          imageOpacity={0.85}
        />
      )}
      {cardContent}
    </View>
  );

  const innerContent = onPress ? (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={{ borderRadius: radius }}
    >
      <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
        {cardBody}
      </Animated.View>
    </Pressable>
  ) : (
    cardBody
  );

  return (
    <View
      style={[
        {
          marginBottom: offset,
          marginRight: offset,
        },
        transform ? { transform } : undefined,
      ]}
    >
      {/* Layer 1: Hard ink offset shadow — hidden when shadows are disabled */}
      {shadowsEnabled && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: offset,
            left: offset,
            right: -offset,
            bottom: -offset,
            backgroundColor: hardColor,
            borderRadius: radius,
            opacity: isDark ? 0.7 : 1,
          }}
        />
      )}

      {/* Layer 2 + 3: Card body with soft atmospheric shadow + border */}
      {innerContent}
    </View>
  );
}
