/**
 * DASHBOARD SCREEN TEMPLATE
 * Use for: Overview/Home screen, any multi-domain summary view
 *
 * Pattern: Greeting header → metric chip row → stacked section cards.
 * Each section card is a self-contained data widget. The header button
 * opens the editor that controls which sections appear and their order.
 */

import React from "react";
import { ScrollView, View, Text, Pressable, StyleSheet, RefreshControl } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { useCardBg } from "../theme/AppSettingsContext";
import { fonts } from "../theme/typography";
import { MetricCard } from "../components/MetricCard";

export function DashboardScreenTemplate() {
  const { theme } = useTheme();
  const cardBg = useCardBg();

  return (
    <ScrollView
      style={{ backgroundColor: theme.page }}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={false} onRefresh={() => {}} tintColor={theme.teal.bar} />}
    >
      {/* ── Greeting ── */}
      <View style={styles.greetingRow}>
        <View>
          <Text style={[styles.greeting, { color: theme.textStrong }]}>Good morning</Text>
          <Text style={[styles.date, { color: theme.textSoft }]}>Friday · Jul 25</Text>
        </View>
        {/* Streak or summary badge */}
        <View style={[styles.streakBadge, { backgroundColor: theme.amber.bg }]}>
          <Ionicons name="flame" size={14} color={theme.amber.fg} />
          <Text style={[styles.streakText, { color: theme.amber.fg }]}>7 days</Text>
        </View>
      </View>

      {/* ── Metric chip grid — quick stats across all domains ── */}
      <View style={styles.chipGrid}>
        <MetricCard label="Steps"  value="8,412" icon="walk"       colorKey="teal"  />
        <MetricCard label="Sleep"  value="7h 12m" icon="moon"      colorKey="amber" />
        <MetricCard label="Spend"  value="$42"    icon="wallet"    colorKey="coral" />
        <MetricCard label="Meals"  value="3 / 3"  icon="restaurant" colorKey="green" />
      </View>

      {/* ── Section card: Today's pattern / timeline ── */}
      <View style={[styles.card, { backgroundColor: cardBg, borderColor: theme.cardBorder }]}>
        <View style={styles.cardHeader}>
          <Text style={[styles.cardTitle, { color: theme.textStrong }]}>Today's pattern</Text>
          {/* Expand / detail link */}
          <Pressable>
            <Text style={[styles.seeAll, { color: theme.teal.bar }]}>See all</Text>
          </Pressable>
        </View>
        {/* Timeline placeholder — replace with actual chart component */}
        <View style={[styles.chartPlaceholder, { backgroundColor: theme.surface }]}>
          <Text style={[styles.placeholderText, { color: theme.textSoft }]}>
            Timeline chart renders here
          </Text>
        </View>
      </View>

      {/* ── Section card: Top insight ── */}
      <View style={[styles.card, { backgroundColor: cardBg, borderColor: theme.cardBorder }]}>
        <View style={styles.cardHeader}>
          <Text style={[styles.cardTitle, { color: theme.textStrong }]}>Top insight</Text>
          <View style={[styles.insightBadge, { backgroundColor: theme.teal.bg }]}>
            <Text style={[styles.insightBadgeText, { color: theme.teal.fg }]}>New</Text>
          </View>
        </View>
        <Text style={[styles.insightBody, { color: theme.textSoft }]}>
          Your sleep on days with 8,000+ steps averaged 41 minutes longer over
          the past 2 weeks.
        </Text>
        <Pressable style={[styles.outlineBtn, { borderColor: theme.teal.bar }]}>
          <Text style={[styles.outlineBtnText, { color: theme.teal.bar }]}>View details</Text>
        </Pressable>
      </View>

      {/* ── Section card: Weekly review ── */}
      <View style={[styles.card, { backgroundColor: cardBg, borderColor: theme.cardBorder }]}>
        <Text style={[styles.cardTitle, { color: theme.textStrong }]}>This week</Text>

        {/* Stat row — repeat for each domain summary */}
        {[
          { label: "Avg steps",  value: "7,840",  delta: "+12%", up: true,  colorKey: "teal"  as const },
          { label: "Avg sleep",  value: "7h 3m",  delta: "−4%",  up: false, colorKey: "amber" as const },
          { label: "Spending",   value: "$214",   delta: "+8%",  up: false, colorKey: "coral" as const },
        ].map((row) => (
          <View key={row.label} style={[styles.statRow, { borderTopColor: theme.cardBorder }]}>
            <Text style={[styles.statLabel, { color: theme.textSoft }]}>{row.label}</Text>
            <Text style={[styles.statValue, { color: theme.textStrong }]}>{row.value}</Text>
            <Text style={[styles.statDelta, { color: row.up ? theme.green.fg : theme.red.fg }]}>
              {row.delta}
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 32 },

  greetingRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  greeting: { fontSize: 22, fontWeight: "700", fontFamily: fonts.bold },
  date: { fontSize: 13, marginTop: 2, fontFamily: fonts.regular },
  streakBadge: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 },
  streakText: { fontSize: 12, fontWeight: "600", fontFamily: fonts.semiBold },

  chipGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },

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
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardTitle: { fontSize: 14, fontWeight: "600", fontFamily: fonts.semiBold },
  seeAll: { fontSize: 12, fontWeight: "600", fontFamily: fonts.semiBold },

  chartPlaceholder: { height: 80, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  placeholderText: { fontSize: 12, fontFamily: fonts.regular },

  insightBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  insightBadgeText: { fontSize: 11, fontWeight: "700", fontFamily: fonts.bold },
  insightBody: { fontSize: 13, lineHeight: 19, fontFamily: fonts.regular },
  outlineBtn: { borderWidth: 1.5, borderRadius: 10, paddingVertical: 9, alignItems: "center" },
  outlineBtnText: { fontSize: 13, fontWeight: "600", fontFamily: fonts.semiBold },

  statRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderTopWidth: 0.5 },
  statLabel: { flex: 1, fontSize: 13, fontFamily: fonts.regular },
  statValue: { fontSize: 14, fontWeight: "600", fontFamily: fonts.semiBold, marginRight: 10 },
  statDelta: { fontSize: 12, fontWeight: "600", fontFamily: fonts.semiBold, minWidth: 40, textAlign: "right" },
});
