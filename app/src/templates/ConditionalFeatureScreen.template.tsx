/**
 * CONDITIONAL FEATURE SCREEN TEMPLATE
 * Use for: MedCycleScreen, HealthTabScreen, any screen whose content
 *          depends on which optional modules the user has enabled
 *
 * Pattern: Read feature flags from FeaturesContext (or equivalent).
 * Each section only renders if its feature is on. When the screen has
 * zero active features, show the EmptyStateScreenTemplate with a link
 * to Settings → Features.
 *
 * Use this pattern — not separate screens — when two features share
 * a tab slot and differ only in icon/title (see RootTabs.tsx).
 */

import React from "react";
import { ScrollView, View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTheme } from "../theme/ThemeContext";
import { useCardBg } from "../theme/AppSettingsContext";
import { fonts } from "../theme/typography";
import { useFeatures } from "../context/FeaturesContext";
import { RootStackParamList } from "../navigation/types";

export function ConditionalFeatureScreenTemplate() {
  const { theme } = useTheme();
  const cardBg = useCardBg();
  const { medsEnabled, cycleEnabled } = useFeatures();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const nothingEnabled = !medsEnabled && !cycleEnabled;

  // ── Nothing enabled: prompt the user to turn something on ──
  if (nothingEnabled) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: theme.page }]}>
        <View style={[styles.emptyIcon, { backgroundColor: theme.pink.bg }]}>
          <Ionicons name="apps-outline" size={40} color={theme.pink.fg} />
        </View>
        <Text style={[styles.emptyTitle, { color: theme.textStrong }]}>No modules active</Text>
        <Text style={[styles.emptyBody, { color: theme.textSoft }]}>
          Enable Medications or Cycle Tracking in Settings to use this tab.
        </Text>
        <Pressable
          onPress={() => navigation.navigate("SettingsFeatures")}
          style={[styles.settingsBtn, { backgroundColor: theme.pink.bg, borderColor: theme.pink.fg }]}
        >
          <Ionicons name="settings-outline" size={16} color={theme.pink.fg} />
          <Text style={[styles.settingsBtnText, { color: theme.pink.fg }]}>Open Settings → Features</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: theme.page }}
      contentContainerStyle={styles.content}
    >
      {/* ── Medications section (only when medsEnabled) ── */}
      {medsEnabled && (
        <View style={[styles.card, { backgroundColor: cardBg, borderColor: theme.cardBorder }]}>
          <View style={styles.cardHeader}>
            <View style={[styles.sectionIcon, { backgroundColor: theme.pink.bg }]}>
              <Ionicons name="medical" size={18} color={theme.pink.fg} />
            </View>
            <Text style={[styles.cardTitle, { color: theme.textStrong }]}>Medications</Text>
            <Pressable style={[styles.addBtn, { backgroundColor: theme.pink.bg }]}>
              <Ionicons name="add" size={16} color={theme.pink.fg} />
            </Pressable>
          </View>

          {/* Today's schedule row */}
          <View style={[styles.scheduleRow, { borderTopColor: theme.cardBorder }]}>
            <View style={[styles.doseTime, { backgroundColor: theme.pink.bg }]}>
              <Text style={[styles.doseTimeText, { color: theme.pink.fg }]}>8 AM</Text>
            </View>
            <Text style={[styles.medName, { color: theme.textStrong }]}>Medication name</Text>
            <Text style={[styles.medDose, { color: theme.textSoft }]}>100 mg</Text>
            <Pressable style={[styles.takenBtn, { borderColor: theme.pink.fg }]}>
              <Text style={[styles.takenBtnText, { color: theme.pink.fg }]}>Mark taken</Text>
            </Pressable>
          </View>

          <Text style={[styles.emptySub, { color: theme.textSoft }]}>
            Add your medications to see today's schedule here.
          </Text>
        </View>
      )}

      {/* ── Cycle tracking section (only when cycleEnabled) ── */}
      {cycleEnabled && (
        <View style={[styles.card, { backgroundColor: cardBg, borderColor: theme.cardBorder }]}>
          <View style={styles.cardHeader}>
            <View style={[styles.sectionIcon, { backgroundColor: theme.pink.bg }]}>
              <Ionicons name="sync-circle" size={18} color={theme.pink.fg} />
            </View>
            <Text style={[styles.cardTitle, { color: theme.textStrong }]}>Cycle</Text>
          </View>

          {/* Cycle phase indicator */}
          <View style={[styles.phaseRow, { backgroundColor: theme.surface, borderColor: theme.cardBorder }]}>
            <Text style={[styles.phaseLabel, { color: theme.textSoft }]}>Current phase</Text>
            <Text style={[styles.phaseValue, { color: theme.textStrong }]}>Follicular · Day 8</Text>
          </View>

          {/* Mini symptom log */}
          <View style={styles.symptomRow}>
            {["Energy", "Mood", "Cramps"].map((s) => (
              <View key={s} style={[styles.symptomChip, { backgroundColor: theme.pink.bg }]}>
                <Text style={[styles.symptomText, { color: theme.pink.fg }]}>{s}</Text>
              </View>
            ))}
            <Pressable style={[styles.symptomChip, { backgroundColor: theme.surface, borderColor: theme.cardBorder, borderWidth: 1 }]}>
              <Ionicons name="add" size={14} color={theme.textSoft} />
            </Pressable>
          </View>
        </View>
      )}

      {/* ── Combined insight (only shown when both are on) ── */}
      {medsEnabled && cycleEnabled && (
        <View style={[styles.insightCard, { backgroundColor: "#9B59B610", borderColor: "#9B59B6" }]}>
          <Ionicons name="heart" size={18} color="#9B59B6" />
          <Text style={[styles.insightText, { color: "#9B59B6" }]}>
            Some medications interact with cycle phase — Ripple will flag any
            patterns it notices across your combined data.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 32 },

  emptyContainer: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40, gap: 14 },
  emptyIcon: { width: 90, height: 90, borderRadius: 45, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 20, fontWeight: "700", textAlign: "center", fontFamily: fonts.bold },
  emptyBody: { fontSize: 14, textAlign: "center", lineHeight: 20, fontFamily: fonts.regular },
  settingsBtn: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 14, borderWidth: 1.5, paddingVertical: 12, paddingHorizontal: 18 },
  settingsBtnText: { fontSize: 14, fontWeight: "600", fontFamily: fonts.semiBold },

  card: {
    borderRadius: 14,
    borderWidth: 0.5,
    padding: 16,
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  sectionIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  cardTitle: { flex: 1, fontSize: 14, fontWeight: "600", fontFamily: fonts.semiBold },
  addBtn: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },

  scheduleRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 10, borderTopWidth: 0.5 },
  doseTime: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  doseTimeText: { fontSize: 11, fontWeight: "700", fontFamily: fonts.bold },
  medName: { flex: 1, fontSize: 14, fontFamily: fonts.regular },
  medDose: { fontSize: 12, fontFamily: fonts.regular },
  takenBtn: { borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  takenBtnText: { fontSize: 12, fontWeight: "600", fontFamily: fonts.semiBold },
  emptySub: { fontSize: 12, fontFamily: fonts.regular },

  phaseRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderRadius: 10, borderWidth: 0.5, padding: 12 },
  phaseLabel: { fontSize: 12, fontFamily: fonts.regular },
  phaseValue: { fontSize: 14, fontWeight: "600", fontFamily: fonts.semiBold },

  symptomRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  symptomChip: { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  symptomText: { fontSize: 12, fontWeight: "600", fontFamily: fonts.semiBold },

  insightCard: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderRadius: 14, borderWidth: 1.5, padding: 14 },
  insightText: { flex: 1, fontSize: 13, lineHeight: 18, fontFamily: fonts.regular },
});
