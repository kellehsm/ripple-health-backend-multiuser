import React, { useEffect, useRef } from "react";
import { Animated, View, StyleSheet } from "react-native";
import { RippleLoader, RippleLoaderSize } from "./RippleLoader";
import { useTheme } from "../theme/ThemeContext";

type Props = {
  loading: boolean;
  size?: RippleLoaderSize;
  // Opacity of the veil layer over the card content while loading.
  veilOpacity?: number;
};

/**
 * Absolute-positioned overlay that fades in a translucent veil + the branded
 * <RippleLoader /> whenever `loading` flips true. Drop it as the last child
 * of any card / tile / chart that has an async refresh.
 *
 * Wrapper container must have `position: 'relative'` (Views default is relative
 * anyway, so just placing this inside works).
 */
export function CardLoadingOverlay({ loading, size = "small", veilOpacity = 0.55 }: Props) {
  const { theme } = useTheme();
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fade, {
      toValue: loading ? 1 : 0,
      duration: loading ? 180 : 220,
      useNativeDriver: true,
    }).start();
  }, [loading, fade]);

  // Fully hide from the accessibility tree once faded out so it doesn't intercept touches.
  return (
    <Animated.View
      pointerEvents={loading ? "auto" : "none"}
      style={[styles.overlay, { opacity: fade }]}
      accessibilityElementsHidden={!loading}
      importantForAccessibility={loading ? "yes" : "no-hide-descendants"}
    >
      <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.card, opacity: veilOpacity }]} />
      <RippleLoader size={size} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
    borderRadius: 22,
    overflow: "hidden",
  },
});
