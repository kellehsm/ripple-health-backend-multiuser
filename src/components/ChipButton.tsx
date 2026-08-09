import React, { ReactNode } from "react";
import { Text, Pressable, Animated, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { usePressScale } from "../hooks/usePressScale";

type Props = {
  label: string;
  selected: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  color?: string;      // active-state background (default: theme.teal.solid)
  textColor?: string;  // override text color when unselected
  icon?: keyof typeof Ionicons.glyphMap;
  size?: "sm" | "md";  // sm ≈ 32px height, md ≈ 40px height
  accessibilityHint?: string;
  right?: ReactNode;   // extra content to the right of the label (e.g. count badge)
};

export function ChipButton({
  label, selected, onPress, onLongPress, color, textColor,
  icon, size = "md", accessibilityHint, right,
}: Props) {
  const { theme } = useTheme();
  const { scale, onPressIn, onPressOut } = usePressScale("chip");
  const activeBg = color ?? theme.teal.solid;
  const inactiveBg = theme.card;
  const ink = theme.ink;
  const sz = size === "sm" ? styles.sm : styles.md;

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ selected }}
        style={[
          styles.base,
          sz,
          {
            backgroundColor: selected ? activeBg : inactiveBg,
            borderColor: selected ? activeBg : ink,
          },
        ]}
        hitSlop={4}
      >
        {icon ? (
          <Ionicons name={icon} size={size === "sm" ? 12 : 14} color={selected ? "#fff" : (textColor ?? ink)} style={{ marginRight: 4 }} />
        ) : null}
        <Text
          style={[
            size === "sm" ? styles.textSm : styles.textMd,
            { color: selected ? "#fff" : (textColor ?? ink) },
          ]}
          numberOfLines={1}
          allowFontScaling
          maxFontSizeMultiplier={1.3}
        >
          {label}
        </Text>
        {right}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderWidth: 2,
    flexDirection: "row",
    alignItems: "center",
  },
  sm: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5, minHeight: 32 },
  md: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8, minHeight: 40 },
  textSm: { fontSize: 11, fontWeight: "800", letterSpacing: 0.3 },
  textMd: { fontSize: 13, fontWeight: "700" },
});
