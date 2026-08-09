/**
 * Compact side-by-side comparison bar. Given two group means (e.g. "avg mood
 * after good sleep" vs "…after poor sleep"), draws proportional bars so the
 * card conveys the effect visually, not just via a number.
 *
 * Chosen over a sparkline because most insights ARE a two-group comparison;
 * a mini bar chart matches that mental model better.
 */

import React from "react";
import { View, Text, StyleSheet } from "react-native";

interface Props {
  labelA: string;
  labelB: string;
  valueA: number;
  valueB: number;
  unit?: string;
  colorA?: string;
  colorB?: string;
}

export function InsightSparkline({ labelA, labelB, valueA, valueB, unit = "", colorA = "#3FA0A6", colorB = "#A62A50" }: Props) {
  const max = Math.max(Math.abs(valueA), Math.abs(valueB), 0.0001);
  const pctA = Math.min(100, (Math.abs(valueA) / max) * 100);
  const pctB = Math.min(100, (Math.abs(valueB) / max) * 100);

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Text style={styles.label} numberOfLines={1}>{labelA}</Text>
        <View style={styles.trackBox}>
          <View style={[styles.bar, { width: `${pctA}%`, backgroundColor: colorA }]} />
        </View>
        <Text style={[styles.value, { color: colorA }]}>{formatVal(valueA)}{unit}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label} numberOfLines={1}>{labelB}</Text>
        <View style={styles.trackBox}>
          <View style={[styles.bar, { width: `${pctB}%`, backgroundColor: colorB }]} />
        </View>
        <Text style={[styles.value, { color: colorB }]}>{formatVal(valueB)}{unit}</Text>
      </View>
    </View>
  );
}

function formatVal(v: number): string {
  if (!Number.isFinite(v)) return "—";
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(1);
}

const styles = StyleSheet.create({
  wrap: { gap: 6, marginTop: 8, marginBottom: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  label: { fontSize: 11, width: 90, opacity: 0.75 },
  trackBox: { flex: 1, height: 10, borderRadius: 5, backgroundColor: "rgba(0,0,0,0.06)", overflow: "hidden" },
  bar: { height: 10, borderRadius: 5 },
  value: { fontSize: 11, fontWeight: "700", minWidth: 44, textAlign: "right" },
});
