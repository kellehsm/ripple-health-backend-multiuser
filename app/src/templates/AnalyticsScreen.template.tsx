/**
 * ANALYTICS / INSIGHTS SCREEN TEMPLATE
 * Use for: InsightsScreen, TrendsScreen, InsightsTrendsScreen,
 *          ExperimentScreen, HistoryScreen charts view, HeartRateDetail charts
 *
 * Pattern: Domain tabs or time-range selector at top → featured insight card
 * → chart grid → interpretation cards. Charts never contain medical advice —
 * always use observational language ("tends to", "on days when", "4 of 5 days").
 */

import React, { useState } from "react";
import { ScrollView, View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { fonts } from "../theme/typography";

const DOMAINS = ["Overview", "Sleep", "Steps", "Mood", "Glucose"] as const;
const RANGES  = ["7d", "30d", "90d"] as const;

type Domain = typeof DOMAINS[number];
type Range  = typeof RANGES[number];

export function AnalyticsScreenTemplate() {
  const { theme } = useTheme();
  const [domain, setDomain] = useState<Domain>("Overview");
  const [range,  setRange]  = useState<Range>("7d");

  return (
    <ScrollView
      style={{ backgroundColor: theme.page }}
      contentContainerStyle={styles.content}
    >
      {/* ── Domain tab row ── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroll}>
        <View style={styles.tabRow}>
          {DOMAINS.map((d) => (
            <Pressable
              key={d}
              onPress={() => setDomain(d)}
              style={[
                styles.tab,
                d === domain
                  ? { backgroundColor: theme.teal.bg, borderColor: theme.teal.bar }
                  : { backgroundColor: theme.card, borderColor: theme.cardBorder },
              ]}
            >
              <Text style={[styles.tabText, { color: d === domain ? theme.teal.fg : theme.textSoft }]}>
                {d}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      {/* ── Time range selector ── */}
      <View style={[styles.rangeRow, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        {RANGES.map((r) => (
          <Pressable
            key={r}
            onPress={() => setRange(r)}
            style={[
              styles.rangeBtn,
              r === range && { backgroundColor: theme.teal.bg },
            ]}
          >
            <Text style={[styles.rangeBtnText, { color: r === range ? theme.teal.fg : theme.textSoft }]}>
              {r}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* ── Featured insight card ── */}
      <View style={[styles.featuredCard, { backgroundColor: theme.teal.bg, borderColor: theme.teal.bar }]}>
        <View style={styles.featuredHeader}>
          <Ionicons name="bulb-outline" size={18} color={theme.teal.fg} />
          <Text style={[styles.featuredLabel, { color: theme.teal.fg }]}>Top pattern</Text>
        </View>
        <Text style={[styles.featuredTitle, { color: theme.teal.fg }]}>
          Sleep improves on high-step days
        </Text>
        <Text style={[styles.featuredBody, { color: theme.teal.fg }]}>
          On days with 8,000+ steps, sleep duration averaged 41 min longer
          — seen on 5 of the last 7 qualifying days.
        </Text>
        <Pressable style={[styles.featuredBtn, { borderColor: theme.teal.fg }]}>
          <Text style={[styles.featuredBtnText, { color: theme.teal.fg }]}>Explore this</Text>
          <Ionicons name="arrow-forward" size={14} color={theme.teal.fg} />
        </Pressable>
      </View>

      {/* ── Primary chart card ── */}
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <View style={styles.cardHeaderRow}>
          <Text style={[styles.cardTitle, { color: theme.textStrong }]}>{domain} over time</Text>
          <Pressable>
            <Ionicons name="expand-outline" size={16} color={theme.textSoft} />
          </Pressable>
        </View>

        {/* Chart placeholder — replace with chart library component */}
        <View style={[styles.chartArea, { backgroundColor: theme.surface }]}>
          <Ionicons name="bar-chart-outline" size={28} color={theme.textSoft} />
          <Text style={[styles.chartPlaceholder, { color: theme.textSoft }]}>
            {domain} · {range} chart renders here
          </Text>
        </View>

        {/* X-axis labels */}
        <View style={styles.xLabels}>
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <Text key={d} style={[styles.xLabel, { color: theme.textSoft }]}>{d}</Text>
          ))}
        </View>
      </View>

      {/* ── Correlation mini-cards ── */}
      <Text style={[styles.sectionHeading, { color: theme.textStrong }]}>Correlations</Text>

      <View style={styles.correlationGrid}>
        {[
          { a: "Steps",   b: "Sleep",  r: "+0.62", color: "green" as const },
          { a: "Mood",    b: "Spend",  r: "−0.41", color: "amber" as const },
          { a: "Glucose", b: "Steps",  r: "−0.38", color: "coral" as const },
        ].map((cor) => (
          <View
            key={cor.a + cor.b}
            style={[styles.correlationCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
          >
            <Text style={[styles.correlationR, { color: theme[cor.color].fg }]}>{cor.r}</Text>
            <Text style={[styles.correlationLabel, { color: theme.textSoft }]}>
              {cor.a} ↔ {cor.b}
            </Text>
          </View>
        ))}
      </View>

      {/* ── Observation list ── */}
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <Text style={[styles.cardTitle, { color: theme.textStrong }]}>Observations</Text>
        {[
          "Steps above 8k on 4 of 7 days this week.",
          "Sleep debt built up Thursday–Saturday.",
          "Mood lowest on days with high spending.",
        ].map((obs, i) => (
          <View key={i} style={[styles.obsRow, { borderTopColor: theme.cardBorder, borderTopWidth: i > 0 ? 0.5 : 0 }]}>
            <View style={[styles.obsDot, { backgroundColor: theme.teal.bar }]} />
            <Text style={[styles.obsText, { color: theme.textSoft }]}>{obs}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 32 },

  tabScroll: { marginHorizontal: -16, paddingHorizontal: 16 },
  tabRow: { flexDirection: "row", gap: 8, paddingBottom: 2 },
  tab: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 7 },
  tabText: { fontSize: 13, fontWeight: "600", fontFamily: fonts.semiBold },

  rangeRow: { flexDirection: "row", borderRadius: 12, borderWidth: 0.5, overflow: "hidden" },
  rangeBtn: { flex: 1, paddingVertical: 10, alignItems: "center" },
  rangeBtnText: { fontSize: 13, fontWeight: "600", fontFamily: fonts.semiBold },

  featuredCard: { borderRadius: 14, borderWidth: 1.5, padding: 16, gap: 8 },
  featuredHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  featuredLabel: { fontSize: 12, fontWeight: "700", letterSpacing: 0.5, fontFamily: fonts.bold },
  featuredTitle: { fontSize: 16, fontWeight: "700", fontFamily: fonts.bold },
  featuredBody: { fontSize: 13, lineHeight: 18, fontFamily: fonts.regular },
  featuredBtn: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  featuredBtnText: { fontSize: 12, fontWeight: "600", fontFamily: fonts.semiBold },

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
  cardTitle: { fontSize: 14, fontWeight: "600", fontFamily: fonts.semiBold },
  cardHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },

  chartArea: { height: 140, borderRadius: 10, alignItems: "center", justifyContent: "center", gap: 6 },
  chartPlaceholder: { fontSize: 12, fontFamily: fonts.regular },

  xLabels: { flexDirection: "row", justifyContent: "space-between" },
  xLabel: { fontSize: 10, fontFamily: fonts.regular },

  sectionHeading: { fontSize: 15, fontWeight: "600", fontFamily: fonts.semiBold },

  correlationGrid: { flexDirection: "row", gap: 8 },
  correlationCard: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 0.5,
    padding: 12,
    alignItems: "center",
    gap: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  correlationR: { fontSize: 18, fontWeight: "700", fontFamily: fonts.bold },
  correlationLabel: { fontSize: 11, textAlign: "center", fontFamily: fonts.regular },

  obsRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingTop: 8 },
  obsDot: { width: 6, height: 6, borderRadius: 3, marginTop: 6 },
  obsText: { flex: 1, fontSize: 13, lineHeight: 18, fontFamily: fonts.regular },
});
