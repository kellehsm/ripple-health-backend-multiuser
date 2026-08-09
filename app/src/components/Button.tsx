import React, { useRef } from "react";
import { Animated, Pressable, Text, ActivityIndicator, StyleSheet, ViewStyle, TextStyle, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { FONT_SIZES, SPACING, RADIUS } from "../theme/tokens";
import { PRESS_SCALE } from "../theme/motion";
import { haptics } from "../lib/haptics";
import { useReducedMotion } from "../hooks/useReducedMotion";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "iconOnly";
type Size = "sm" | "md" | "lg";

interface ButtonProps {
  label?: string;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  fullWidth?: boolean;
  accessibilityLabel?: string;
  hapticFeedback?: "tap" | "pop" | "press" | "success" | "none";
}

export function Button({
  label,
  icon,
  onPress,
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  style,
  textStyle,
  fullWidth = false,
  accessibilityLabel,
  hapticFeedback = "pop",
}: ButtonProps) {
  const { theme } = useTheme();
  const reduced = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;

  const bg: Record<Variant, string> = {
    primary:   theme.primary,
    secondary: theme.card,
    ghost:     "transparent",
    danger:    theme.danger,
    iconOnly:  "transparent",
  };
  const textColor: Record<Variant, string> = {
    primary:   "#FFFFFF",
    secondary: theme.textStrong,
    ghost:     theme.primary,
    danger:    "#FFFFFF",
    iconOnly:  theme.textStrong,
  };
  const borderColor: Record<Variant, string | undefined> = {
    primary:   undefined,
    secondary: theme.cardBorder,
    ghost:     theme.primary,
    danger:    undefined,
    iconOnly:  undefined,
  };

  const padV: Record<Size, number> = { sm: SPACING.xs, md: SPACING.sm, lg: SPACING.md };
  const padH: Record<Size, number> = { sm: SPACING.md, md: SPACING.lg, lg: SPACING.xl };
  const fs:   Record<Size, number> = { sm: FONT_SIZES.caption, md: FONT_SIZES.body, lg: FONT_SIZES.subheading };
  const iconSize: Record<Size, number> = { sm: 16, md: 18, lg: 22 };

  const handlePress = () => {
    if (hapticFeedback !== "none") haptics[hapticFeedback]?.();
    onPress();
  };
  const onPressIn = () => {
    if (reduced) return;
    Animated.spring(scale, { toValue: PRESS_SCALE, useNativeDriver: true, speed: 300, bounciness: 4 }).start();
  };
  const onPressOut = () => {
    if (reduced) return;
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 300, bounciness: 4 }).start();
  };

  const isIconOnly = variant === "iconOnly" || (icon && !label);

  return (
    <Animated.View style={{ transform: [{ scale }], alignSelf: fullWidth ? "stretch" : "flex-start" }}>
      <Pressable
        onPress={handlePress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        disabled={disabled || loading}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label ?? icon}
        accessibilityState={{ disabled: disabled || loading, busy: loading }}
        hitSlop={isIconOnly ? 12 : 4}
        style={({ pressed }) => [
          styles.base,
          isIconOnly ? styles.iconOnlyBase : null,
          {
            backgroundColor: bg[variant],
            paddingVertical: isIconOnly ? 0 : padV[size],
            paddingHorizontal: isIconOnly ? 0 : padH[size],
            borderRadius: isIconOnly ? RADIUS.pill : RADIUS.md,
            borderWidth: borderColor[variant] ? 1.5 : 0,
            borderColor: borderColor[variant],
            opacity: pressed ? 0.9 : disabled ? 0.45 : 1,
          },
          style,
        ]}
      >
        {loading ? (
          <ActivityIndicator size="small" color={textColor[variant]} />
        ) : (
          <View style={styles.row}>
            {icon && <Ionicons name={icon} size={iconSize[size]} color={textColor[variant]} />}
            {label && (
              <Text style={[styles.label, { color: textColor[variant], fontSize: fs[size], fontWeight: "700", marginLeft: icon ? 6 : 0 }, textStyle]}>
                {label}
              </Text>
            )}
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base:  { alignItems: "center", justifyContent: "center" },
  iconOnlyBase: { width: 40, height: 40 },
  row:   { flexDirection: "row", alignItems: "center" },
  label: { letterSpacing: 0.2 },
});
