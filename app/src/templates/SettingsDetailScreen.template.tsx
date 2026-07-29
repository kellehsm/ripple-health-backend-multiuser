/**
 * SETTINGS DETAIL SCREEN TEMPLATE
 * Use for: AppearanceSettings, NotificationsSettings, TrackingSettings,
 *          SecuritySettings, PreferencesSettings, SocialSettings, DexcomSettings,
 *          HealthConnectSettings, BanksSettings, ExportBackupSettings, FeaturesScreen
 *
 * Pattern: Grouped config cards. Each card covers one functional area.
 * Inside a card: section title, body copy, then toggle rows or choice rows.
 * Toggles use Switch; choices use radio-style Pressable rows.
 * Destructive actions go in a separate card at the bottom, styled in red.
 */

import React, { useState } from "react";
import { ScrollView, View, Text, Switch, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { useCardBg } from "../theme/AppSettingsContext";
import { fonts } from "../theme/typography";

export function SettingsDetailScreenTemplate() {
  const { theme } = useTheme();
  const cardBg = useCardBg();
  const [toggle1, setToggle1] = useState(true);
  const [toggle2, setToggle2] = useState(false);
  const [choice, setChoice] = useState<"a" | "b">("a");

  return (
    <ScrollView
      style={{ backgroundColor: theme.page }}
      contentContainerStyle={styles.content}
    >
      {/* ── Config card: Toggle switches ── */}
      <View style={[styles.card, { backgroundColor: cardBg, borderColor: theme.cardBorder }]}>
        <Text style={[styles.cardTitle, { color: theme.textStrong }]}>Feature toggles</Text>
        <Text style={[styles.cardBody, { color: theme.textSoft }]}>
          Short explanation of what these toggles control and why they matter.
        </Text>

        {/* Toggle row — use for boolean on/off settings */}
        <View style={[styles.toggleRow, { borderTopColor: theme.cardBorder }]}>
          <View style={styles.toggleText}>
            <Text style={[styles.toggleLabel, { color: theme.textStrong }]}>Setting name</Text>
            <Text style={[styles.toggleSub, { color: theme.textSoft }]}>One-line description of this setting</Text>
          </View>
          <Switch
            value={toggle1}
            onValueChange={setToggle1}
            trackColor={{ false: theme.cardBorder, true: theme.teal.bg }}
            thumbColor={toggle1 ? theme.teal.bar : theme.textSoft}
          />
        </View>

        <View style={[styles.toggleRow, { borderTopColor: theme.cardBorder }]}>
          <View style={styles.toggleText}>
            <Text style={[styles.toggleLabel, { color: theme.textStrong }]}>Another setting</Text>
            <Text style={[styles.toggleSub, { color: theme.textSoft }]}>Short description goes here</Text>
          </View>
          <Switch
            value={toggle2}
            onValueChange={setToggle2}
            trackColor={{ false: theme.cardBorder, true: theme.teal.bg }}
            thumbColor={toggle2 ? theme.teal.bar : theme.textSoft}
          />
        </View>
      </View>

      {/* ── Config card: Radio choice ── */}
      <View style={[styles.card, { backgroundColor: cardBg, borderColor: theme.cardBorder }]}>
        <Text style={[styles.cardTitle, { color: theme.textStrong }]}>Choose an option</Text>

        {(["a", "b"] as const).map((opt) => (
          <Pressable
            key={opt}
            onPress={() => setChoice(opt)}
            style={[
              styles.choiceRow,
              {
                borderColor: choice === opt ? theme.teal.bar : theme.cardBorder,
                backgroundColor: choice === opt ? theme.teal.bg : "transparent",
              },
            ]}
          >
            <Ionicons
              name={choice === opt ? "radio-button-on" : "radio-button-off"}
              size={20}
              color={choice === opt ? theme.teal.bar : theme.textSoft}
            />
            <View style={{ flex: 1 }}>
              <Text style={[styles.choiceTitle, { color: choice === opt ? theme.teal.fg : theme.textStrong }]}>
                Option {opt.toUpperCase()}
              </Text>
              <Text style={[styles.choiceBody, { color: theme.textSoft }]}>
                Brief description of what this option does when selected.
              </Text>
            </View>
          </Pressable>
        ))}
      </View>

      {/* ── Status / info card (read-only) ── */}
      <View style={[styles.card, { backgroundColor: cardBg, borderColor: theme.cardBorder }]}>
        <Text style={[styles.cardTitle, { color: theme.textStrong }]}>Connection status</Text>

        <View style={[styles.statusRow, { borderTopColor: theme.cardBorder }]}>
          <Ionicons name="checkmark-circle" size={18} color={theme.green.fg} />
          <Text style={[styles.statusLabel, { color: theme.textStrong }]}>Service name</Text>
          <Text style={[styles.statusValue, { color: theme.green.fg }]}>Connected</Text>
        </View>

        <View style={[styles.statusRow, { borderTopColor: theme.cardBorder }]}>
          <Ionicons name="alert-circle-outline" size={18} color={theme.amber.fg} />
          <Text style={[styles.statusLabel, { color: theme.textStrong }]}>Another service</Text>
          <Text style={[styles.statusValue, { color: theme.amber.fg }]}>Needs setup</Text>
        </View>

        <Pressable style={[styles.outlineBtn, { borderColor: theme.teal.bar }]}>
          <Text style={[styles.outlineBtnText, { color: theme.teal.bar }]}>Connect</Text>
        </Pressable>
      </View>

      {/* ── Hint badge (success / warning / info) ── */}
      {toggle1 && (
        <View style={[styles.hintBadge, { backgroundColor: theme.teal.bg, borderColor: theme.teal.fg }]}>
          <Ionicons name="information-circle" size={15} color={theme.teal.fg} />
          <Text style={[styles.hintText, { color: theme.teal.fg }]}>
            A consequence of enabling this setting is described here.
          </Text>
        </View>
      )}

      {/* ── Destructive actions card — always last, always red ── */}
      <View style={[styles.card, { backgroundColor: cardBg, borderColor: theme.cardBorder }]}>
        <Text style={[styles.cardTitle, { color: theme.red.fg }]}>Danger zone</Text>

        <Pressable style={[styles.destructiveBtn, { borderColor: theme.red.fg }]}>
          <Ionicons name="trash-outline" size={16} color={theme.red.fg} />
          <Text style={[styles.destructiveBtnText, { color: theme.red.fg }]}>Delete all data</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 32 },

  card: {
    borderRadius: 14,
    borderWidth: 0.5,
    padding: 16,
    gap: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  cardTitle: { fontSize: 15, fontWeight: "600", fontFamily: fonts.semiBold, marginBottom: 2 },
  cardBody: { fontSize: 13, lineHeight: 18, fontFamily: fonts.regular, marginBottom: 6 },

  toggleRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderTopWidth: 0.5, gap: 12 },
  toggleText: { flex: 1 },
  toggleLabel: { fontSize: 15, fontWeight: "600", fontFamily: fonts.semiBold },
  toggleSub: { fontSize: 12, marginTop: 2, fontFamily: fonts.regular },

  choiceRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, borderRadius: 12, borderWidth: 1.5, padding: 14 },
  choiceTitle: { fontSize: 14, fontWeight: "600", fontFamily: fonts.semiBold },
  choiceBody: { fontSize: 13, lineHeight: 18, marginTop: 2, fontFamily: fonts.regular },

  statusRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, borderTopWidth: 0.5 },
  statusLabel: { flex: 1, fontSize: 14, fontFamily: fonts.regular },
  statusValue: { fontSize: 13, fontWeight: "600", fontFamily: fonts.semiBold },

  outlineBtn: { borderWidth: 1.5, borderRadius: 10, paddingVertical: 10, alignItems: "center", marginTop: 4 },
  outlineBtnText: { fontSize: 14, fontWeight: "600", fontFamily: fonts.semiBold },

  hintBadge: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderRadius: 12, borderWidth: 1, padding: 12 },
  hintText: { flex: 1, fontSize: 13, lineHeight: 18, fontFamily: fonts.regular },

  destructiveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1.5, borderRadius: 10, paddingVertical: 12 },
  destructiveBtnText: { fontSize: 14, fontWeight: "600", fontFamily: fonts.semiBold },
});
