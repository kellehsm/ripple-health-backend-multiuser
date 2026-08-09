import React, { ReactNode } from "react";
import { View, Text, Pressable, Animated, StyleSheet, Dimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { layeredShadow } from "../theme/styleUtils";
import { useTheme } from "../theme/ThemeContext";
import { usePressScale } from "../hooks/usePressScale";

const SCREEN_WIDTH = Dimensions.get("window").width;
const CHIP_GAP = 8;
const CHIP_WIDTH = (SCREEN_WIDTH - 32 - CHIP_GAP * 2) / 3;

export type MetricChipProps = {
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  value: string;
  sub?: string;
  borderColor: string;
  backgroundColor: string;
  fgColor: string;
  subColor?: string;
  onPress?: () => void;
  accessibilityLabel?: string;
  children?: ReactNode; // for custom content like sparklines or animated water counters
  overflow?: "hidden" | "visible";
};

export function MetricChip(props: MetricChipProps) {
  const { onPress, accessibilityLabel } = props;
  const { isDark } = useTheme();
  const { scale, onPressIn, onPressOut } = usePressScale("chip");

  const chipStyle = [
    styles.chip,
    {
      borderColor: props.borderColor,
      backgroundColor: props.backgroundColor,
      overflow: props.overflow ?? "visible",
      ...layeredShadow("card", isDark),
    },
  ];

  const inner = (
    <>
      {props.icon ? <Ionicons name={props.icon} size={20} color={props.iconColor ?? props.fgColor} /> : null}
      <Text
        style={[styles.val, { color: props.fgColor }]}
        allowFontScaling
        maxFontSizeMultiplier={1.3}
        numberOfLines={1}
      >
        {props.value}
      </Text>
      {props.sub ? (
        <Text
          style={[styles.sub, { color: props.subColor ?? props.fgColor }]}
          allowFontScaling
          maxFontSizeMultiplier={1.3}
          numberOfLines={1}
        >
          {props.sub}
        </Text>
      ) : null}
      {props.children}
    </>
  );

  if (!onPress) {
    return <View style={chipStyle} accessible accessibilityLabel={accessibilityLabel}>{inner}</View>;
  }
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        style={chipStyle}
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        hitSlop={4}
      >
        {inner}
      </Pressable>
    </Animated.View>
  );
}

// Skeleton placeholder for when a chip is still loading — same footprint so layout doesn't jump.
export function MetricChipSkeleton({ borderColor, backgroundColor }: { borderColor: string; backgroundColor: string }) {
  return (
    <View style={[styles.chip, { borderColor, backgroundColor, opacity: 0.55 }]}>
      <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: borderColor, opacity: 0.35 }} />
      <View style={{ width: 40, height: 14, borderRadius: 4, backgroundColor: borderColor, opacity: 0.35, marginTop: 4 }} />
      <View style={{ width: 28, height: 8, borderRadius: 3, backgroundColor: borderColor, opacity: 0.25, marginTop: 4 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    width: CHIP_WIDTH,
    borderRadius: 14,
    borderWidth: 2.5,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: "center",
    gap: 3,
  },
  val: { fontSize: 16, fontWeight: "900", letterSpacing: -0.3 },
  sub: { fontSize: 9, fontWeight: "800" },
});
