import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { FONT_SIZES, SPACING, RADIUS } from "../theme/tokens";

interface EmptyStateProps {
  /** Emoji icon to display above the title. */
  icon?: string;
  /** @deprecated Use `icon` instead. */
  emoji?: string;
  title: string;
  /** Optional descriptive subtitle below the title. */
  subtitle?: string;
  /** @deprecated Use `subtitle` instead. */
  message?: string;
  /** Optional call-to-action button. */
  action?: { label: string; onPress: () => void };
  /** @deprecated Use `action` instead. */
  actionLabel?: string;
  /** @deprecated Use `action` instead. */
  onAction?: () => void;
}

export function EmptyState({
  icon,
  emoji,
  title,
  subtitle,
  message,
  action,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  const { theme } = useTheme();

  // Resolve props — new API takes precedence over legacy names
  const resolvedIcon = icon ?? emoji ?? "📭";
  const resolvedSubtitle = subtitle ?? message;
  const resolvedAction = action ?? (actionLabel && onAction ? { label: actionLabel, onPress: onAction } : undefined);

  return (
    <View style={[styles.container]}>
      <Text style={styles.icon}>{resolvedIcon}</Text>
      <Text style={[styles.title, { color: theme.textStrong }]}>{title}</Text>
      {resolvedSubtitle ? (
        <Text style={[styles.subtitle, { color: theme.textSoft }]}>{resolvedSubtitle}</Text>
      ) : null}
      {resolvedAction ? (
        <Pressable
          onPress={resolvedAction.onPress}
          style={({ pressed }) => [
            styles.actionBtn,
            { backgroundColor: theme.primary, opacity: pressed ? 0.82 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={resolvedAction.label}
        >
          <Text style={styles.actionText}>{resolvedAction.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: SPACING.xxl,
    paddingHorizontal: SPACING.xl,
    gap: SPACING.sm,
  },
  icon: {
    fontSize: 44,
    marginBottom: SPACING.xs,
  },
  title: {
    fontSize: FONT_SIZES.subheading,
    fontWeight: "800",
    textAlign: "center",
    letterSpacing: 0.1,
  },
  subtitle: {
    fontSize: FONT_SIZES.body,
    lineHeight: 20,
    textAlign: "center",
    marginTop: SPACING.xs,
  },
  actionBtn: {
    marginTop: SPACING.md,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.sm,
  },
  actionText: {
    fontSize: FONT_SIZES.body,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 0.2,
  },
});
