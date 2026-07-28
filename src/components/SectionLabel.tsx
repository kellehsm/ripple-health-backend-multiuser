import React from "react";
import { View, Text, Pressable, StyleSheet, ViewStyle } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { FONT_SIZES, SPACING } from "../theme/tokens";

interface SectionLabelProps {
  text: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: ViewStyle;
  color?: string;
}

export function SectionLabel({ text, actionLabel, onAction, style, color }: SectionLabelProps) {
  const { theme } = useTheme();
  const labelColor = color ?? theme.textSoft;
  return (
    <View style={[styles.row, style]}>
      <Text style={[styles.label, { color: labelColor }]}>{text.toUpperCase()}</Text>
      {actionLabel && onAction && (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={[styles.action, { color: theme.primary }]}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row:    { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  label:  { fontSize: FONT_SIZES.micro, fontWeight: "800", letterSpacing: 0.8 },
  action: { fontSize: FONT_SIZES.caption, fontWeight: "600" },
});
