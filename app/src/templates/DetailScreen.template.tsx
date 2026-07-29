/**
 * DETAIL SCREEN TEMPLATE
 * Use for: ExerciseDetail, HeartRateDetail, StepsDetail, ChallengeDetail,
 *          MedicationHistory, InsightDetail — any drill-down from a list or chip
 *
 * Pattern: Full-bleed hero stat at top (large number + label + delta),
 * then a chart, then detail cards below. Pushed onto the stack with a
 * back arrow — no bottom tabs visible. Header title is the item name.
 */

import React from "react";
import { ScrollView, View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { useCardBg } from "../theme/AppSettingsContext";
import { fonts } from "../theme/typography";

export function DetailScreenTemplate() {
  const { theme } = useTheme();
  const cardBg = useCardBg();

  return (
    <ScrollView
      style={{ backgroundColor: theme.page }}
      contentContainerStyle={styles.content}
    >
      {/* ── Hero stat ── */}
      <View style={[styles.hero, { backgroundColor: cardBg, borderColor: theme.cardBorder }]}>
        {/* Domain color accent bar */}
        <View style={[styles.accentBar, { backgroundColor: theme.teal.bar }]} />

        <View style={styles.heroBody}>
          <Text style={[styles.heroValue, { color: theme.textStrong }]}>8,412</Text>
          <Text style={[styles.heroUnit, { color: theme.textSoft }]}> steps today</Text>
        </View>

        <View style={styles.heroFooter}>
          <View style={[styles.deltaBadge, { backgroundColor: theme.green.bg }]}>
            <Ionicons name="arrow-up" size={12} color={theme.green.fg} />
            <Text style={[styles.deltaText, { color: theme.green.fg }]}>+12% vs last week</Text>
          </View>
          <Text style={[styles.heroTimestamp, { color: theme.textSoft }]}>Updated 4 min ago</Text>
        </View>
      </View>

      {/* ── Chart card ── */}
      <View style={[styles.card, { backgroundColor: cardBg, borderColor: theme.cardBorder }]}>
        {/* Time range tabs */}
        <View style={styles.rangeTabs}>
          {["Day", "Week", "Month"].map((range) => (
            <Pressable
              key={range}
              style={[
                styles.rangeTab,
                range === "Week" && { backgroundColor: theme.teal.bg, borderRadius: 8 },
              ]}
            >
              <Text
                style={[
                  styles.rangeTabText,
                  { color: range === "Week" ? theme.teal.fg : theme.textSoft },
                ]}
              >
                {range}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Chart placeholder */}
        <View style={[styles.chartArea, { backgroundColor: theme.surface }]}>
          <Text style={[styles.chartPlaceholder, { color: theme.textSoft }]}>
            Time-series chart renders here
          </Text>
        </View>
      </View>

      {/* ── Stats breakdown card ── */}
      <View style={[styles.card, { backgroundColor: cardBg, borderColor: theme.cardBorder }]}>
        <Text style={[styles.cardTitle, { color: theme.textStrong }]}>This week</Text>

        <View style={styles.statsGrid}>
          {[
            { label: "Best day",   value: "10,203" },
            { label: "Daily avg",  value: "7,840"  },
            { label: "Total",      value: "54,880" },
            { label: "Goal hit",   value: "4 / 7"  },
          ].map((s) => (
            <View key={s.label} style={[styles.statBox, { backgroundColor: theme.surface }]}>
              <Text style={[styles.statValue, { color: theme.textStrong }]}>{s.value}</Text>
              <Text style={[styles.statLabel, { color: theme.textSoft }]}>{s.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* ── Related observations ── */}
      <View style={[styles.card, { backgroundColor: cardBg, borderColor: theme.cardBorder }]}>
        <Text style={[styles.cardTitle, { color: theme.textStrong }]}>Patterns</Text>

        {[
          "Steps above 8k correlated with better sleep 4 of the last 5 days.",
          "Tuesday tends to be your lowest-step day.",
        ].map((obs, i) => (
          <View key={i} style={[styles.obsRow, { borderTopColor: theme.cardBorder, borderTopWidth: i > 0 ? 0.5 : 0 }]}>
            <Ionicons name="analytics-outline" size={16} color={theme.teal.bar} style={{ marginTop: 1 }} />
            <Text style={[styles.obsText, { color: theme.textSoft }]}>{obs}</Text>
          </View>
        ))}
      </View>

      {/* ── Action buttons ── */}
      <View style={styles.actions}>
        <Pressable style={[styles.primaryBtn, { backgroundColor: theme.teal.bar }]}>
          <Text style={styles.primaryBtnText}>Log manually</Text>
        </Pressable>
        <Pressable style={[styles.outlineBtn, { borderColor: theme.cardBorder }]}>
          <Text style={[styles.outlineBtnText, { color: theme.textSoft }]}>View full history</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 32 },

  hero: {
    borderRadius: 14,
    borderWidth: 0.5,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  accentBar: { height: 4, width: "100%" },
  heroBody: { flexDirection: "row", alignItems: "baseline", padding: 16, paddingBottom: 8 },
  heroValue: { fontSize: 42, fontWeight: "700", fontFamily: fonts.bold },
  heroUnit: { fontSize: 15, fontFamily: fonts.regular },
  heroFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingBottom: 14 },
  deltaBadge: { flexDirection: "row", alignItems: "center", gap: 3, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  deltaText: { fontSize: 12, fontFamily: fonts.regular },
  heroTimestamp: { fontSize: 11, fontFamily: fonts.regular },

  card: {
    borderRadius: 14,
    borderWidth: 0.5,
    padding: 16,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  cardTitle: { fontSize: 14, fontWeight: "600", fontFamily: fonts.semiBold },

  rangeTabs: { flexDirection: "row", gap: 4 },
  rangeTab: { paddingHorizontal: 12, paddingVertical: 6 },
  rangeTabText: { fontSize: 13, fontWeight: "600", fontFamily: fonts.semiBold },

  chartArea: { height: 120, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  chartPlaceholder: { fontSize: 12, fontFamily: fonts.regular },

  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statBox: { flex: 1, minWidth: "45%", borderRadius: 10, padding: 12, alignItems: "center", gap: 3 },
  statValue: { fontSize: 18, fontWeight: "700", fontFamily: fonts.bold },
  statLabel: { fontSize: 11, fontFamily: fonts.regular },

  obsRow: { flexDirection: "row", gap: 8, paddingTop: 8 },
  obsText: { flex: 1, fontSize: 13, lineHeight: 18, fontFamily: fonts.regular },

  actions: { gap: 8 },
  primaryBtn: { borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  primaryBtnText: { color: "#fff", fontSize: 15, fontWeight: "600", fontFamily: fonts.semiBold },
  outlineBtn: { borderWidth: 1.5, borderRadius: 14, paddingVertical: 13, alignItems: "center" },
  outlineBtnText: { fontSize: 14, fontWeight: "500", fontFamily: fonts.medium },
});
