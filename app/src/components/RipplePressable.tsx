/**
 * Ripple-branded Pressable.
 *
 * Wraps any content in a tappable surface that:
 *   - shrinks slightly on press (spring, respects Reduce Motion)
 *   - fires a haptic pulse
 *   - emits a soft expanding ring (the "ripple" that matches the brand name)
 *   - reports full a11y state
 *
 * Use in place of raw Pressable anywhere a tap is a meaningful action.
 */

import React, { useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, StyleProp, ViewStyle, PressableProps } from "react-native";
import { PRESS_SCALE, MOTION } from "../theme/motion";
import { haptics } from "../lib/haptics";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { useTheme } from "../theme/ThemeContext";

interface RipplePressableProps extends Omit<PressableProps, "style"> {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  hapticFeedback?: "tap" | "pop" | "press" | "success" | "none";
  disableScale?: boolean;
  disableRipple?: boolean;
  rippleColor?: string;
}

export function RipplePressable({
  children,
  style,
  hapticFeedback = "tap",
  disableScale = false,
  disableRipple = false,
  rippleColor,
  onPress,
  onPressIn,
  onPressOut,
  ...rest
}: RipplePressableProps) {
  const { theme } = useTheme();
  const reduced = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const rippleOpacity = useRef(new Animated.Value(0)).current;
  const rippleScale = useRef(new Animated.Value(0.5)).current;

  const ring = rippleColor ?? theme.primary + "33";

  const handlePress = (e: any) => {
    if (hapticFeedback !== "none") haptics[hapticFeedback]?.();
    if (!disableRipple && !reduced) {
      rippleOpacity.setValue(0.35);
      rippleScale.setValue(0.5);
      Animated.parallel([
        Animated.timing(rippleOpacity, { toValue: 0,   duration: MOTION.standard, useNativeDriver: true, easing: Easing.out(Easing.quad) }),
        Animated.timing(rippleScale,   { toValue: 1.6, duration: MOTION.standard, useNativeDriver: true, easing: Easing.out(Easing.quad) }),
      ]).start();
    }
    onPress?.(e);
  };

  const handlePressIn = (e: any) => {
    if (!disableScale && !reduced) {
      Animated.spring(scale, { toValue: PRESS_SCALE, useNativeDriver: true, speed: 320, bounciness: 4 }).start();
    }
    onPressIn?.(e);
  };
  const handlePressOut = (e: any) => {
    if (!disableScale && !reduced) {
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 320, bounciness: 4 }).start();
    }
    onPressOut?.(e);
  };

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <Pressable
        {...rest}
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={styles.wrap}
      >
        {children}
        {!disableRipple && (
          <Animated.View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              styles.ring,
              { backgroundColor: ring, opacity: rippleOpacity, transform: [{ scale: rippleScale }] },
            ]}
          />
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: "hidden", borderRadius: 12 },
  ring: { borderRadius: 999 },
});
