/**
 * AnimatedProgressRing — SVG circle that sweeps from 0 → progress on mount.
 *
 * Uses react-native-svg's Animated-compatible Circle + Animated.Value so the
 * native driver is NOT required (strokeDashoffset is a layout prop).
 *
 * Falls back to a static ring when OS reduce-motion is enabled.
 *
 * Props:
 *   size        — outer diameter (default 58)
 *   strokeWidth — ring thickness (default 4)
 *   progress    — 0–1 fill fraction
 *   color       — stroke color
 *   trackColor  — background ring color (default color + "22")
 *   duration    — sweep duration in ms (default 500)
 *   children    — centre content (number label, icon…)
 */
import React, { useEffect, useRef } from "react";
import { Animated, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { useReduceMotion } from "../hooks/useReduceMotion";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type Props = {
  size?: number;
  strokeWidth?: number;
  progress: number;          // 0–1
  color: string;
  trackColor?: string;
  duration?: number;
  children?: React.ReactNode;
};

export function AnimatedProgressRing({
  size = 58,
  strokeWidth = 4,
  progress,
  color,
  trackColor,
  duration = 500,
  children,
}: Props) {
  const reduceMotion = useReduceMotion();
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clampedProgress = Math.min(1, Math.max(0, isFinite(progress) ? progress : 0));

  // animatedProgress goes 0 → clampedProgress
  const animProgress = useRef(new Animated.Value(reduceMotion ? clampedProgress : 0)).current;

  useEffect(() => {
    if (reduceMotion) {
      animProgress.setValue(clampedProgress);
      return;
    }
    animProgress.setValue(0);
    Animated.timing(animProgress, {
      toValue: clampedProgress,
      duration,
      useNativeDriver: false,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clampedProgress, reduceMotion]);

  // strokeDashoffset: full circumference (no fill) → offset for clampedProgress
  const dashOffset = animProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference, circumference * (1 - 1)], // 0 offset = full ring
    // We want: offset = circumference * (1 - progress)
    // At progress=0 → offset=circumference (invisible), progress=1 → offset=0 (full)
  });

  // Re-derive correctly:
  const strokeDashoffset = animProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference, 0],
  });

  const cx = size / 2;
  const cy = size / 2;
  const track = trackColor ?? color + "22";
  const strokeLinecap = "round" as const;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} style={{ position: "absolute", top: 0, left: 0 }}>
        {/* Track ring */}
        <Circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke={track}
          strokeWidth={strokeWidth}
        />
        {/* Animated fill ring — rotated so it starts at 12 o'clock */}
        <AnimatedCircle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap={strokeLinecap}
          transform={`rotate(-90, ${cx}, ${cy})`}
        />
      </Svg>
      {/* Centre slot */}
      <View
        style={{
          position: "absolute",
          top: 0, left: 0, right: 0, bottom: 0,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {children}
      </View>
    </View>
  );
}
