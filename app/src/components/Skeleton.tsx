/**
 * Skeleton primitives.
 *
 * A single, consistent shimmer/pulse used by every loading state instead of
 * ActivityIndicator + inline skeleton definitions. Respects Reduce Motion
 * (falls back to a static grey block).
 */

import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View, ViewStyle } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { useReducedMotion } from "../hooks/useReducedMotion";

interface Props {
  width?: ViewStyle["width"];
  height?: number;
  radius?: number;
  style?: ViewStyle;
}

export function Skeleton({ width = "100%", height = 14, radius = 8, style }: Props) {
  const { theme } = useTheme();
  const reduced = useReducedMotion();
  const opacity = useRef(new Animated.Value(0.55)).current;

  useEffect(() => {
    if (reduced) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.85, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.55, duration: 700, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [reduced, opacity]);

  return (
    <Animated.View
      style={[
        { width, height, borderRadius: radius, backgroundColor: theme.cardBorder ?? "#DAD5CB", opacity: reduced ? 0.6 : opacity },
        style,
      ]}
    />
  );
}

/** Full-card skeleton — matches the insight/metric card silhouette. */
export function SkeletonCard() {
  const { theme } = useTheme();
  return (
    <View style={[styles.card, { borderColor: theme.cardBorder ?? "#E0E0E0", backgroundColor: theme.card ?? "#F5F5F5" }]}>
      <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
        <Skeleton width={30} height={30} radius={12} />
        <View style={{ flex: 1, gap: 6 }}>
          <Skeleton height={14} width="70%" />
          <Skeleton height={10} width="40%" />
        </View>
      </View>
      <Skeleton height={13} width="95%" />
      <Skeleton height={13} width="80%" />
    </View>
  );
}

/** Row skeleton — for list items in History, Meals, etc. */
export function SkeletonRow() {
  return (
    <View style={styles.row}>
      <Skeleton width={36} height={36} radius={18} />
      <View style={{ flex: 1, gap: 6 }}>
        <Skeleton height={12} width="50%" />
        <Skeleton height={10} width="30%" />
      </View>
      <Skeleton width={40} height={12} />
    </View>
  );
}

/** Chart skeleton — for the trend/detail screens. */
export function SkeletonChart({ height = 180 }: { height?: number }) {
  return (
    <View style={[styles.chart, { height }]}>
      <Skeleton width="100%" height={height - 20} radius={12} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10, padding: 14, borderRadius: 22, borderWidth: 2, marginVertical: 4 },
  row:  { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  chart: { paddingVertical: 8 },
});
