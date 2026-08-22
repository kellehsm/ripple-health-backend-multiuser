import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { hexWithAlpha } from "../theme/colorUtils";
import { FONT_SIZES, SPACING, RADIUS } from "../theme/tokens";

interface GhostRowProps {
  /** What's missing, e.g. "No meals logged yet". */
  label: string;
  /** Optional inline CTA, e.g. { label: "Log one", onPress }. */
  action?: { label: string; onPress: () => void };
  /** Optional leading emoji or short glyph. */
  icon?: string;
}

/**
 * Slim dashed placeholder row for empty data. Replaces full-size tiles/cards
 * showing junk values ("0 exercises · 0m", "--") per the no-junk-data rule.
 */
export function GhostRow({ label, action, icon }: GhostRowProps) {
  const { theme } = useTheme();
  return (
    <View
      style={[
        styles.row,
        {
          borderColor: hexWithAlpha(theme.textSoft, 0.35),
          backgroundColor: hexWithAlpha(theme.textSoft, 0.05),
        },
      ]}
    >
      {icon ? <Text style={styles.icon}>{icon}</Text> : null}
      <Text style={[styles.label, { color: theme.textSoft }]} numberOfLines={1}>
        {label}
      </Text>
      {action ? (
        <Pressable onPress={action.onPress} hitSlop={8} accessibilityRole="button">
          <Text style={[styles.action, { color: theme.primary }]}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
  },
  icon: { fontSize: FONT_SIZES.body },
  label: { flex: 1, fontSize: FONT_SIZES.label, fontWeight: "600" },
  action: { fontSize: FONT_SIZES.label, fontWeight: "800" },
});
