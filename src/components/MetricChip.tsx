import React, { ReactNode, useEffect, useRef } from "react";
import { View, Text, Pressable, Animated, StyleSheet, Dimensions } from "react-native";
import { layeredShadow } from "../theme/styleUtils";
import { useTheme } from "../theme/ThemeContext";
import { usePressScale } from "../hooks/usePressScale";
import { useReduceMotion } from "../hooks/useReduceMotion";

const SCREEN_WIDTH = Dimensions.get("window").width;
const CHIP_GAP = 8;
const CHIP_WIDTH = (SCREEN_WIDTH - 32 - CHIP_GAP * 2) / 3;
// Fixed height so chips across both rows of the wrap-grid always match — otherwise
// rows self-size to their tallest sibling and rows disagree with each other.
export const CHIP_HEIGHT = 120;

type Props = {
  borderColor: string;
  backgroundColor: string;
  label?: string;             // Bottom uppercase metric name
  labelColor?: string;
  onPress?: () => void;
  onLongPress?: () => void;
  accessibilityLabel?: string;
  overflow?: "hidden" | "visible";
  children: ReactNode;        // Content between top edge and label
};

export function MetricChip({
  borderColor, backgroundColor, label, labelColor, onPress, onLongPress, accessibilityLabel, overflow, children,
}: Props) {
  const { theme } = useTheme();
  const isDark = !!theme.isDark;
  const { scale, onPressIn, onPressOut } = usePressScale("chip");

  const chipStyle = [
    styles.chip,
    {
      borderColor,
      backgroundColor,
      overflow: overflow ?? "visible",
      ...layeredShadow("card", isDark),
    },
  ];

  const inner = (
    <>
      <View style={styles.contentSlot}>{children}</View>
      {label ? (
        <Text
          style={[styles.label, { color: labelColor ?? theme.textSoft }]}
          allowFontScaling
          maxFontSizeMultiplier={1.3}
        >
          {label}
        </Text>
      ) : null}
    </>
  );

  if (!onPress && !onLongPress) {
    return (
      <View style={chipStyle} accessible={!!accessibilityLabel} accessibilityLabel={accessibilityLabel}>
        {inner}
      </View>
    );
  }
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        style={chipStyle}
        onPress={onPress}
        onLongPress={onLongPress}
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

// Convenience Text styles for chip content — export so chip callers can share typography.
export const chipStyles = StyleSheet.create({
  val: { fontSize: 16, lineHeight: 19, fontWeight: "900", letterSpacing: -0.3 },
  sub: { fontSize: 9, lineHeight: 12, fontWeight: "800" },
});

export function MetricChipSkeleton({ borderColor, backgroundColor }: { borderColor: string; backgroundColor: string }) {
  const pulse = useRef(new Animated.Value(0.35)).current;
  const reduceMotion = useReduceMotion();
  useEffect(() => {
    if (reduceMotion) { pulse.setValue(0.55); return; } // static mid-value
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.75, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.35, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduceMotion]);
  return (
    <View style={[styles.chip, { borderColor, backgroundColor, opacity: 0.55 }]}>
      <Animated.View style={[styles.contentSlot, { opacity: pulse }]}>
        <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: borderColor }} />
        <View style={{ width: 40, height: 14, borderRadius: 4, backgroundColor: borderColor, marginTop: 4 }} />
        <View style={{ width: 28, height: 8, borderRadius: 3, backgroundColor: borderColor, opacity: 0.7, marginTop: 4 }} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    width: CHIP_WIDTH,
    height: CHIP_HEIGHT,
    borderRadius: 14,
    borderWidth: 3,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "space-between",
  },
  // Fills the vertical space between the top of the chip and the bottom label.
  // Centers whatever the caller passes so different content stacks stay balanced.
  contentSlot: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  label: { fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
});
