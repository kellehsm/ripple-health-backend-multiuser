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

/**
 * Feature-specific empty-state presets. Import + use directly:
 *   <EmptyState {...EMPTY_STATES.insights(regenerateFn)} />
 *
 * Each preset teaches — it explains why the surface is empty and the
 * fastest action to fill it.
 */
export const EMPTY_STATES = {
  insights: (onLog?: () => void) => ({
    icon: "🌱",
    title: "Building your profile",
    subtitle: "Keep logging meals, mood, and activity. Patterns start appearing after 2–3 weeks of data.",
    action: onLog ? { label: "Log something now", onPress: onLog } : undefined,
  }),
  meals: (onAdd?: () => void) => ({
    icon: "🍽️",
    title: "No meals logged yet",
    subtitle: "Add your first meal to start tracking how food affects your glucose and mood.",
    action: onAdd ? { label: "Log a meal", onPress: onAdd } : undefined,
  }),
  glucose: () => ({
    icon: "📉",
    title: "No glucose readings",
    subtitle: "Connect a CGM in Settings, or add readings manually to see your daily patterns.",
  }),
  history: () => ({
    icon: "📅",
    title: "Nothing here yet",
    subtitle: "Once you log a few days of data, your history will fill in automatically.",
  }),
  experiments: (onStart?: () => void) => ({
    icon: "🧪",
    title: "No experiments yet",
    subtitle: "Try running a 2-week self-experiment triggered from any actionable insight.",
    action: onStart ? { label: "Browse insights", onPress: onStart } : undefined,
  }),
  friends: (onInvite?: () => void) => ({
    icon: "👋",
    title: "No friends yet",
    subtitle: "Invite friends to share progress and cheer each other on.",
    action: onInvite ? { label: "Invite a friend", onPress: onInvite } : undefined,
  }),
  medications: (onAdd?: () => void) => ({
    icon: "💊",
    title: "No medications tracked",
    subtitle: "Add a medication to track adherence and see how it affects your patterns.",
    action: onAdd ? { label: "Add medication", onPress: onAdd } : undefined,
  }),
  offline: () => ({
    icon: "📡",
    title: "You're offline",
    subtitle: "Recent data is cached, but new logs will sync once you reconnect.",
  }),
  error: (onRetry?: () => void) => ({
    icon: "⚠️",
    title: "Something went wrong",
    subtitle: "This screen couldn't load. Please try again.",
    action: onRetry ? { label: "Retry", onPress: onRetry } : undefined,
  }),
};

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
