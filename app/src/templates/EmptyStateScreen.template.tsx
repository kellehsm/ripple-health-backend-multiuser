/**
 * EMPTY STATE / PLACEHOLDER SCREEN TEMPLATE
 * Use for: CompletedScreen, MindfulnessScreen, any screen whose feature
 *          isn't built yet, or a domain screen with no data loaded
 *
 * Three variants:
 *   "placeholder" — feature coming soon, shown to all users
 *   "empty"       — feature exists but user has no data yet (first use)
 *   "error"       — data failed to load, offer retry
 *
 * The empty/placeholder states should feel intentional, not broken.
 * Use the domain color and a relevant icon; never just show raw text.
 */

import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { fonts } from "../theme/typography";

type Variant = "placeholder" | "empty" | "error";

type Props = {
  variant?: Variant;
  icon?: keyof typeof Ionicons.glyphMap;
  title?: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function EmptyStateScreenTemplate({
  variant = "empty",
  icon = "leaf-outline",
  title,
  body,
  actionLabel,
  onAction,
}: Props) {
  const { theme } = useTheme();

  const defaults: Record<Variant, { icon: keyof typeof Ionicons.glyphMap; title: string; body: string; action: string }> = {
    placeholder: {
      icon: "construct-outline",
      title: "Coming soon",
      body: "This feature is on the roadmap. Check back in a future update.",
      action: "",
    },
    empty: {
      icon: "add-circle-outline",
      title: "Nothing here yet",
      body: "Log your first entry to start seeing your data and patterns.",
      action: "Get started",
    },
    error: {
      icon: "cloud-offline-outline",
      title: "Couldn't load data",
      body: "Check your connection and try again. Your offline data is still safe.",
      action: "Try again",
    },
  };

  const d = defaults[variant];
  const resolvedIcon   = icon        || d.icon;
  const resolvedTitle  = title       || d.title;
  const resolvedBody   = body        || d.body;
  const resolvedAction = actionLabel || d.action;

  const accentColor = variant === "error" ? theme.red.fg
    : variant === "placeholder" ? theme.amber.fg
    : theme.teal.fg;

  const accentBg = variant === "error" ? theme.red.bg
    : variant === "placeholder" ? theme.amber.bg
    : theme.teal.bg;

  return (
    <View style={[styles.container, { backgroundColor: theme.page }]}>
      {/* Icon in a soft circle */}
      <View style={[styles.iconCircle, { backgroundColor: accentBg }]}>
        <Ionicons name={resolvedIcon} size={42} color={accentColor} />
      </View>

      <Text style={[styles.title, { color: theme.textStrong }]}>{resolvedTitle}</Text>
      <Text style={[styles.body, { color: theme.textSoft }]}>{resolvedBody}</Text>

      {resolvedAction ? (
        <Pressable
          onPress={onAction}
          style={[styles.btn, { backgroundColor: variant === "error" ? theme.red.sub ?? theme.red.fg : theme.teal.bar }]}
        >
          <Text style={styles.btnText}>{resolvedAction}</Text>
        </Pressable>
      ) : null}

      {/* Placeholder variant: optional "notify me" link */}
      {variant === "placeholder" && (
        <Pressable style={{ marginTop: 8 }}>
          <Text style={[styles.ghostLink, { color: theme.textSoft }]}>
            Notify me when it's ready
          </Text>
        </Pressable>
      )}
    </View>
  );
}

// ── Inline empty state — use inside a card when a section has no data ──
export function InlineEmptyState({
  icon = "list-outline",
  message = "Nothing logged yet.",
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  message?: string;
}) {
  const { theme } = useTheme();
  return (
    <View style={styles.inlineEmpty}>
      <Ionicons name={icon} size={22} color={theme.textSoft} />
      <Text style={[styles.inlineText, { color: theme.textSoft }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40, gap: 14 },
  iconCircle: { width: 96, height: 96, borderRadius: 48, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  title: { fontSize: 20, fontWeight: "700", textAlign: "center", fontFamily: fonts.bold },
  body: { fontSize: 14, textAlign: "center", lineHeight: 20, fontFamily: fonts.regular, maxWidth: 280 },
  btn: { borderRadius: 14, paddingVertical: 13, paddingHorizontal: 32, marginTop: 4 },
  btnText: { color: "#fff", fontSize: 15, fontWeight: "600", fontFamily: fonts.semiBold },
  ghostLink: { fontSize: 13, textDecorationLine: "underline", fontFamily: fonts.regular },

  inlineEmpty: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 16, justifyContent: "center" },
  inlineText: { fontSize: 13, fontFamily: fonts.regular },
});
