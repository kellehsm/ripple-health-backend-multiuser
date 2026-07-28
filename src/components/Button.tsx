import React from "react";
import { Pressable, Text, ActivityIndicator, StyleSheet, ViewStyle, TextStyle } from "react-native";
import * as Haptics from "expo-haptics";
import { useTheme } from "../theme/ThemeContext";
import { FONT_SIZES, SPACING, RADIUS } from "../theme/tokens";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export function Button({ label, onPress, variant = "primary", size = "md", loading = false, disabled = false, style, textStyle }: ButtonProps) {
  const { theme } = useTheme();

  const bg: Record<Variant, string> = {
    primary:   theme.primary,
    secondary: theme.card,
    ghost:     "transparent",
    danger:    theme.danger,
  };
  const textColor: Record<Variant, string> = {
    primary:   "#FFFFFF",
    secondary: theme.textStrong,
    ghost:     theme.primary,
    danger:    "#FFFFFF",
  };
  const borderColor: Record<Variant, string | undefined> = {
    primary:   undefined,
    secondary: theme.cardBorder,
    ghost:     theme.primary,
    danger:    undefined,
  };

  const padV: Record<Size, number> = { sm: SPACING.xs, md: SPACING.sm, lg: SPACING.md };
  const padH: Record<Size, number> = { sm: SPACING.md, md: SPACING.lg, lg: SPACING.xl };
  const fs: Record<Size, number>   = { sm: FONT_SIZES.caption, md: FONT_SIZES.body, lg: FONT_SIZES.subheading };

  const handlePress = () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: bg[variant],
          paddingVertical: padV[size],
          paddingHorizontal: padH[size],
          borderRadius: RADIUS.md,
          borderWidth: borderColor[variant] ? 1.5 : 0,
          borderColor: borderColor[variant],
          opacity: pressed ? 0.82 : disabled ? 0.45 : 1,
        },
        style,
      ]}
    >
      {loading
        ? <ActivityIndicator size="small" color={textColor[variant]} />
        : <Text style={[styles.label, { color: textColor[variant], fontSize: fs[size], fontWeight: "700" }, textStyle]}>{label}</Text>
      }
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base:  { alignItems: "center", justifyContent: "center" },
  label: { letterSpacing: 0.2 },
});
