/**
 * Insight timeline — a lifecycle view of every insight the engine has ever
 * surfaced for this user. Groups by month so users can scan for when a
 * pattern first appeared vs when it faded.
 */
import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { api } from "../api/client";

interface TimelineRow {
  id: string;
  rule_id: string;
  type: string;
  title: string;
  first_detected: string;
  last_confirmed: string;
  status: string;
  dismissed: boolean;
}

function monthKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function humanMonth(key: string): string {
  const [y, m] = key.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function InsightTimelineScreen() {
  const { theme } = useTheme();
  const [rows, setRows] = useState<TimelineRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load(showRefresh = false) {
    if (showRefresh) setRefreshing(true); else setLoading(true);
    try {
      const data = await (api as any).insightTimeline();
      setRows(Array.isArray(data) ? data : []);
    } catch {}
    finally {
      setLoading(false);
      setRefreshing(false);
    }
  }
  useEffect(() => { load(); }, []);

  const grouped: Record<string, TimelineRow[]> = {};
  for (const r of rows) {
    const k = monthKey(r.first_detected);
    (grouped[k] ||= []).push(r);
  }
  const monthKeys = Object.keys(grouped).sort().reverse();

  const styles = makeStyles(theme.page, theme.ink);
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.page }}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={theme.primary} />}
    >
      <Text style={[styles.heading, { color: theme.textStrong }]}>Insight Timeline</Text>
      <Text style={[styles.sub, { color: theme.textSoft }]}>Every pattern the engine has surfaced for you, oldest to newest.</Text>
      {loading && <ActivityIndicator style={{ marginTop: 24 }} color={theme.primary} />}
      {!loading && rows.length === 0 && (
        <Text style={[styles.sub, { color: theme.textSoft, marginTop: 24 }]}>Nothing to show yet.</Text>
      )}
      {monthKeys.map((k) => (
        <View key={k} style={{ marginTop: 16 }}>
          <Text style={[styles.monthHeader, { color: theme.textSoft }]}>{humanMonth(k)}</Text>
          {grouped[k].map((r) => (
            <View key={r.id} style={[styles.row, { borderColor: theme.cardBorder ?? theme.ink + "33" }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, { color: theme.textStrong }]} numberOfLines={2}>{r.title}</Text>
                <Text style={[styles.meta, { color: theme.textSoft }]}>
                  {r.type} · {r.status}{r.dismissed ? " · dismissed" : ""}
                </Text>
              </View>
              <Text style={[styles.date, { color: theme.textSoft }]}>
                {new Date(r.first_detected).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </Text>
            </View>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

function makeStyles(page: string, ink: string) {
  return StyleSheet.create({
    content: { padding: 16, gap: 4 },
    heading: { fontSize: 24, fontWeight: "900", letterSpacing: -0.6 },
    sub: { fontSize: 12, lineHeight: 17 },
    monthHeader: { fontSize: 10, fontWeight: "900", letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 6 },
    row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, marginBottom: 6 },
    title: { fontSize: 13, fontWeight: "700" },
    meta: { fontSize: 11, marginTop: 2 },
    date: { fontSize: 11, fontWeight: "600" },
  });
}
