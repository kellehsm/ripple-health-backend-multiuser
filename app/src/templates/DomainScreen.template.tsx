/**
 * DOMAIN SCREEN TEMPLATE
 * Use for: Health, Life, Meals, Finance, MedCycle tab screens
 *
 * Pattern: Full-screen scroll with a metrics grid at the top, then
 * stacked content cards per sub-topic. Each card can contain charts,
 * lists, or quick-action buttons relevant to that domain.
 *
 * The metrics grid uses MetricCard components (each maps to one
 * color key from theme — never invent a new color inline).
 */

import React, { useState, useEffect } from "react";
import { ScrollView, View, Text, Pressable, StyleSheet, RefreshControl, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { fonts } from "../theme/typography";
import { MetricCard } from "../components/MetricCard";

export function DomainScreenTemplate() {
  const { theme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    // Fetch domain data here
    setLoading(false);
  }, []);

  async function handleRefresh() {
    setRefreshing(true);
    // Re-fetch here
    setRefreshing(false);
  }

  return (
    <ScrollView
      style={{ backgroundColor: theme.page }}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.teal.bar} />}
    >
      {/* ── Metric chip grid (top of every domain screen) ── */}
      <View style={styles.chipGrid}>
        {/* Each MetricCard maps to exactly one colorKey — don't share */}
        <MetricCard label="Primary metric" value="—"   icon="pulse"      colorKey="red"   />
        <MetricCard label="Secondary"      value="—"   icon="water"      colorKey="blue"  />
        <MetricCard label="Third"          value="—"   icon="sunny"      colorKey="amber" />
        <MetricCard label="Fourth"         value="—"   icon="flame"      colorKey="coral" />
      </View>

      {/* ── Primary content card ── */}
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <Text style={[styles.cardTitle, { color: theme.textStrong }]}>Primary section</Text>

        {loading
          ? <ActivityIndicator color={theme.teal.bar} style={{ marginTop: 12 }} />
          : (
            <>
              {/* Today's data row */}
              <View style={[styles.dataRow, { borderBottomColor: theme.cardBorder }]}>
                <View style={styles.dataLeft}>
                  <Text style={[styles.dataValue, { color: theme.textStrong }]}>0</Text>
                  <Text style={[styles.dataUnit, { color: theme.textSoft }]}> unit</Text>
                </View>
                <Text style={[styles.dataDelta, { color: theme.green.fg }]}>↑ vs yesterday</Text>
              </View>

              {/* Chart placeholder */}
              <View style={[styles.chartArea, { backgroundColor: theme.surface }]}>
                <Text style={[styles.chartPlaceholder, { color: theme.textSoft }]}>
                  Chart / visualization renders here
                </Text>
              </View>
            </>
          )
        }
      </View>

      {/* ── Secondary content card ── */}
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <View style={styles.cardHeaderRow}>
          <Text style={[styles.cardTitle, { color: theme.textStrong }]}>Secondary section</Text>
          <Pressable style={[styles.addBtn, { backgroundColor: theme.teal.bg }]}>
            <Ionicons name="add" size={16} color={theme.teal.fg} />
            <Text style={[styles.addBtnText, { color: theme.teal.fg }]}>Add</Text>
          </Pressable>
        </View>

        {/* Empty state */}
        <View style={styles.emptyState}>
          <Ionicons name="add-circle-outline" size={32} color={theme.textSoft} />
          <Text style={[styles.emptyText, { color: theme.textSoft }]}>
            Nothing logged yet — tap Add to get started.
          </Text>
        </View>
      </View>

      {/* ── History / log card ── */}
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <Text style={[styles.cardTitle, { color: theme.textStrong }]}>Recent history</Text>

        {/* Log entry row — repeat per item */}
        {[1, 2, 3].map((i) => (
          <View key={i} style={[styles.logRow, { borderTopColor: theme.cardBorder }]}>
            <View style={[styles.logIcon, { backgroundColor: theme.teal.bg }]}>
              <Ionicons name="time-outline" size={16} color={theme.teal.fg} />
            </View>
            <View style={styles.logText}>
              <Text style={[styles.logTitle, { color: theme.textStrong }]}>Entry label</Text>
              <Text style={[styles.logMeta, { color: theme.textSoft }]}>Today · 2:30 PM</Text>
            </View>
            <Text style={[styles.logValue, { color: theme.textStrong }]}>—</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 32 },

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
  cardTitle: { fontSize: 14, fontWeight: "600", fontFamily: fonts.semiBold },
  cardHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },

  dataRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", paddingBottom: 10, borderBottomWidth: 0.5 },
  dataLeft: { flexDirection: "row", alignItems: "baseline" },
  dataValue: { fontSize: 32, fontWeight: "600", fontFamily: fonts.semiBold },
  dataUnit: { fontSize: 14, fontFamily: fonts.regular },
  dataDelta: { fontSize: 13, fontFamily: fonts.regular },

  chartArea: { height: 100, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  chartPlaceholder: { fontSize: 12, fontFamily: fonts.regular },

  addBtn: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  addBtnText: { fontSize: 13, fontWeight: "600", fontFamily: fonts.semiBold },

  emptyState: { alignItems: "center", gap: 8, paddingVertical: 20 },
  emptyText: { fontSize: 13, textAlign: "center", lineHeight: 18, fontFamily: fonts.regular },

  logRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 10, borderTopWidth: 0.5 },
  logIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  logText: { flex: 1 },
  logTitle: { fontSize: 14, fontWeight: "500", fontFamily: fonts.medium },
  logMeta: { fontSize: 12, marginTop: 2, fontFamily: fonts.regular },
  logValue: { fontSize: 14, fontWeight: "600", fontFamily: fonts.semiBold },
});
