/**
 * SETTINGS LIST SCREEN TEMPLATE
 * Use for: SettingsScreen (the nav menu), TabPreferencesScreen,
 *          any screen that is a menu of navigation options
 *
 * Pattern: Grouped rows of Pressable navigation items, each with a
 * colored icon, label, subtitle, and a right chevron. Tap navigates
 * to a detail screen. Use colorKey to signal category.
 */

import React from "react";
import { ScrollView, View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { fonts } from "../theme/typography";

type RowConfig = {
  label: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  colorKey: "teal" | "blue" | "amber" | "pink" | "green" | "red" | "coral";
  badge?: string;
};

const GROUPS: { heading?: string; rows: RowConfig[] }[] = [
  {
    rows: [
      { label: "Account",        subtitle: "Profile, login, delete account",           icon: "person-outline",             colorKey: "blue"  },
      { label: "Appearance",     subtitle: "Theme, background, fonts",                 icon: "color-palette-outline",      colorKey: "teal"  },
    ],
  },
  {
    heading: "Notifications",
    rows: [
      { label: "Reminders",      subtitle: "Check-in timing, quiet hours",             icon: "notifications-outline",      colorKey: "amber" },
      { label: "Integrations",   subtitle: "Dexcom, Health Connect, Google Drive",     icon: "link-outline",               colorKey: "pink", badge: "3" },
    ],
  },
  {
    heading: "Data",
    rows: [
      { label: "Data & Backup",  subtitle: "Export, backup, week-start",               icon: "server-outline",             colorKey: "green" },
      { label: "Privacy",        subtitle: "Biometric lock, sharing prefs",            icon: "shield-outline",             colorKey: "red"   },
      { label: "Help & About",   subtitle: "FAQ, version, changelog",                  icon: "information-circle-outline", colorKey: "teal"  },
    ],
  },
];

export function SettingsListScreenTemplate() {
  const { theme } = useTheme();

  return (
    <ScrollView
      style={{ backgroundColor: theme.page }}
      contentContainerStyle={styles.content}
    >
      {GROUPS.map((group, gi) => (
        <View key={gi} style={styles.group}>
          {group.heading && (
            <Text style={[styles.groupHeading, { color: theme.textSoft }]}>
              {group.heading.toUpperCase()}
            </Text>
          )}

          {group.rows.map((row, ri) => {
            const c = theme[row.colorKey];
            return (
              <Pressable
                key={row.label}
                style={({ pressed }) => [
                  styles.row,
                  {
                    backgroundColor: theme.card,
                    borderColor: theme.cardBorder,
                    opacity: pressed ? 0.75 : 1,
                    // Rounded corners: top-only for first, bottom-only for last in a group
                    borderTopLeftRadius: ri === 0 ? 14 : 4,
                    borderTopRightRadius: ri === 0 ? 14 : 4,
                    borderBottomLeftRadius: ri === group.rows.length - 1 ? 14 : 4,
                    borderBottomRightRadius: ri === group.rows.length - 1 ? 14 : 4,
                  },
                ]}
              >
                {/* Colored icon */}
                <View style={[styles.iconWrap, { backgroundColor: c.bg }]}>
                  <Ionicons name={row.icon} size={20} color={c.fg} />
                </View>

                {/* Text */}
                <View style={styles.rowText}>
                  <Text style={[styles.rowLabel, { color: theme.textStrong }]}>{row.label}</Text>
                  <Text style={[styles.rowSubtitle, { color: theme.textSoft }]} numberOfLines={1}>
                    {row.subtitle}
                  </Text>
                </View>

                {/* Optional badge */}
                {row.badge && (
                  <View style={[styles.badgeWrap, { backgroundColor: theme.red.bar ?? theme.red.sub }]}>
                    <Text style={styles.badgeText}>{row.badge}</Text>
                  </View>
                )}

                <Ionicons name="chevron-forward" size={16} color={theme.textSoft} />
              </Pressable>
            );
          })}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 8, paddingBottom: 32 },

  group: { gap: 1 },
  groupHeading: { fontSize: 11, fontWeight: "700", letterSpacing: 0.8, marginBottom: 6, marginLeft: 4, fontFamily: fonts.bold },

  row: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 0.5,
    padding: 14,
    gap: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  iconWrap: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 15, fontWeight: "600", fontFamily: fonts.semiBold },
  rowSubtitle: { fontSize: 12, marginTop: 3, fontFamily: fonts.regular },
  badgeWrap: { borderRadius: 10, minWidth: 20, height: 20, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "700", fontFamily: fonts.bold },
});
