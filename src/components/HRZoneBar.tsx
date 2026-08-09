import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "../theme/ThemeContext";

export const HR_ZONES = [
  { name: "very_light", label: "Very light", color: "#8ED4D8" },
  { name: "light",      label: "Light",      color: "#B092D9" },
  { name: "moderate",   label: "Moderate",   color: "#F2A28C" },
  { name: "hard",       label: "Hard",       color: "#CE7A92" },
  { name: "maximum",    label: "Maximum",    color: "#A62A50" },
] as const;

export type HRSummary = {
  avg_bpm: number | null;
  peak_bpm: number | null;
  time_in_zone_seconds: Record<string, number>;
  sample_count: number;
};

export function HRZoneBar({ summary }: { summary: HRSummary }) {
  const { theme } = useTheme();
  const total = HR_ZONES.reduce((sum, z) => sum + (summary.time_in_zone_seconds[z.name] ?? 0), 0);
  if (total === 0) return null;

  const summaryLabel = HR_ZONES
    .map((z) => ({ name: z.label, mins: Math.round((summary.time_in_zone_seconds[z.name] ?? 0) / 60) }))
    .filter((s) => s.mins > 0)
    .map((s) => `${s.mins}m ${s.name.toLowerCase()}`)
    .join(", ");

  return (
    <View style={{ gap: 8 }} accessibilityLabel={`Heart rate zones: ${summaryLabel}`}>
      <View style={styles.bar}>
        {HR_ZONES.map((z) => {
          const secs = summary.time_in_zone_seconds[z.name] ?? 0;
          const flex = secs / total;
          if (flex < 0.005) return null;
          return <View key={z.name} style={{ flex, backgroundColor: z.color }} />;
        })}
      </View>

      <View style={styles.legend}>
        {HR_ZONES.map((z) => {
          const secs = summary.time_in_zone_seconds[z.name] ?? 0;
          if (secs < 1) return null;
          const mins = Math.round(secs / 60);
          return (
            <View key={z.name} style={styles.legendItem}>
              <View style={[styles.swatch, { backgroundColor: z.color }]} />
              <Text style={[styles.legendText, { color: theme.textSoft }]} allowFontScaling maxFontSizeMultiplier={1.3}>
                {z.label}{mins > 0 ? ` · ${mins}m` : ""}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    height: 14,
    borderRadius: 7,
    overflow: "hidden",
    backgroundColor: "rgba(0,0,0,0.06)",
  },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  swatch: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 11, fontWeight: "600" },
});
