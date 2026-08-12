import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { ShadowCard } from "./ShadowCard";
import { api } from "../api/client";

type MetricDelta = { this: number | null; last: number | null; pct: number | null };
type WhatChangedPayload = {
  this_days_logged: number;
  last_days_logged: number;
  steps: MetricDelta;
  sleep: MetricDelta;
  glucose: MetricDelta;
  score: MetricDelta;
};

/**
 * "What changed" card — quick week-over-week deltas on the four metrics
 * users care about most (steps, sleep hours, avg glucose, overall score).
 * Rendered on Overview so the biggest movers are visible without opening
 * charts.  Hidden entirely when there isn't enough data to compare (needs
 * ≥3 days logged in each of the two weeks).
 */
export function WhatChangedCard() {
  const { theme } = useTheme();
  const [data, setData] = useState<WhatChangedPayload | null>(null);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    api.whatChanged()
      .then((d: any) => { if (!cancelled) setData(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []));

  if (!data) return null;
  if (data.this_days_logged < 3 || data.last_days_logged < 3) return null;

  // "Better" direction depends on the metric. Steps/sleep/score up is good;
  // glucose down is good (lower average = closer to in-range).
  function row(label: string, unit: string, m: MetricDelta, higherIsBetter: boolean) {
    if (m.pct == null || m.this == null) return null;
    const up = m.pct > 0;
    const good = higherIsBetter ? up : !up;
    const color = m.pct === 0 ? theme.textSoft : good ? theme.teal.solid : theme.coral.solid;
    const arrow = m.pct === 0 ? "→" : up ? "↑" : "↓";
    const val = Number(m.this).toFixed(unit === "h" ? 1 : 0);
    return (
      <View key={label} style={styles.row}>
        <Text style={{ color: theme.textStrong, fontSize: 12, fontWeight: "700" }}>{label}</Text>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
          <Text style={{ color: theme.textStrong, fontSize: 14, fontWeight: "800" }}>{val}{unit}</Text>
          <Text style={{ color, fontSize: 12, fontWeight: "800" }}>{arrow} {Math.abs(m.pct)}%</Text>
        </View>
      </View>
    );
  }

  const rows = [
    row("Steps",       "",  data.steps,   true),
    row("Sleep",       "h", data.sleep,   true),
    row("Avg glucose", "",  data.glucose, false),
    row("Score",       "",  data.score,   true),
  ].filter(Boolean);

  if (rows.length === 0) return null;

  return (
    <ShadowCard size="card" bg={theme.card} accent={theme.teal.solid} rotate={-0.4}>
      <View style={{ flex: 1, gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Ionicons name="trending-up" size={16} color={theme.teal.solid} />
          <Text style={{ color: theme.textStrong, fontSize: 13, fontWeight: "900", letterSpacing: 0.5 }}>
            WHAT CHANGED
          </Text>
          <Text style={{ color: theme.textSoft, fontSize: 11 }}>this week vs last</Text>
        </View>
        <View style={{ gap: 4 }}>{rows}</View>
      </View>
    </ShadowCard>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 2 },
});
