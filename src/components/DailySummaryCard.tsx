import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { ShadowCard } from "./ShadowCard";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DailySummaryScores = {
  sleep: number | null;
  glucose: number | null;
  activity: number | null;
  hydration: number | null;
  nutrition: number | null;
  mood: number | null;
  productivity: number | null;
  stress: number | null;
  overall: number | null;
};

export type DailySummaryData = {
  date: string;
  scores: DailySummaryScores | null;
  insights: Array<{ type: string; message: string }>;
  generatedAt: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function scoreColor(score: number | null, theme: any): string {
  if (score === null) return theme.cardBorder;
  if (score >= 80) return theme.teal.solid;
  if (score >= 65) return theme.amber.solid;
  if (score >= 45) return theme.coral.solid;
  return theme.red.solid;
}

function scoreLabel(score: number | null): string {
  if (score === null) return "--";
  if (score >= 80) return "Great";
  if (score >= 65) return "Good";
  if (score >= 45) return "Fair";
  return "Low";
}

const DOMAINS: Array<{ key: keyof DailySummaryScores; label: string }> = [
  { key: "glucose",      label: "Glucose"  },
  { key: "sleep",        label: "Sleep"    },
  { key: "activity",     label: "Activity" },
  { key: "hydration",    label: "Water"    },
  { key: "nutrition",    label: "Meals"    },
  { key: "mood",         label: "Mood"     },
  { key: "productivity", label: "Productivity" },
  { key: "stress",       label: "Stress"   },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function DailySummaryCard({ data }: { data: DailySummaryData }) {
  const { theme } = useTheme();
  const ink = theme.ink;
  const scores = data.scores;
  const overall = scores?.overall ?? null;
  const overallColor = scoreColor(overall, theme);

  return (
    <ShadowCard size="card" style={{ marginBottom: 16 }}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.textStrong }]}>TODAY'S OVERVIEW</Text>
        {data.generatedAt && (
          <Text style={[styles.updated, { color: theme.textSoft }]}>
            {new Date(data.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </Text>
        )}
      </View>

      {/* Overall score */}
      <View style={styles.overallRow}>
        <View style={[styles.overallBadge, { backgroundColor: overallColor + "18", borderColor: overallColor }]}>
          <Text style={[styles.overallNumber, { color: overallColor }]}>
            {overall !== null ? overall : "--"}
          </Text>
          <Text style={[styles.overallLabel, { color: overallColor }]}>
            {scoreLabel(overall)}
          </Text>
        </View>
        {scores && (
          <View style={styles.overallMeta}>
            {DOMAINS.filter(d => scores[d.key] !== null).length === 0 ? (
              <Text style={[styles.noDataText, { color: theme.textSoft }]}>
                No data logged yet today.
              </Text>
            ) : (
              <Text style={[styles.domainsActive, { color: theme.textSoft }]}>
                {DOMAINS.filter(d => scores[d.key] !== null).length} of {DOMAINS.length} areas tracked
              </Text>
            )}
          </View>
        )}
      </View>

      {/* Domain grid */}
      {scores && (
        <View style={styles.grid}>
          {DOMAINS.map((d) => {
            const val = scores[d.key];
            const color = scoreColor(val, theme);
            return (
              <View key={d.key} style={[styles.domainChip, { backgroundColor: color + "14", borderColor: color + "40" }]}>
                <Text style={[styles.domainScore, { color: val !== null ? ink : theme.textSoft }]}>
                  {val !== null ? val : "--"}
                </Text>
                <Text style={[styles.domainLabel, { color: theme.textSoft }]}>{d.label}</Text>
                {val !== null && (
                  <View style={[styles.domainDot, { backgroundColor: color }]} />
                )}
              </View>
            );
          })}
        </View>
      )}

      {/* Insights */}
      {data.insights.length > 0 && (
        <View style={[styles.insightsDivider, { borderTopColor: theme.cardBorder }]}>
          {data.insights.map((insight, i) => (
            <View key={i} style={styles.insightRow}>
              <Text style={[styles.insightDot, { color: theme.textSoft }]}>•</Text>
              <Text style={[styles.insightText, { color: theme.textSoft }]}>{insight.message}</Text>
            </View>
          ))}
        </View>
      )}
    </ShadowCard>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  title: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  updated: {
    fontSize: 11,
  },
  overallRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginBottom: 16,
  },
  overallBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  overallNumber: {
    fontSize: 28,
    fontWeight: "800",
    lineHeight: 32,
  },
  overallLabel: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  overallMeta: {
    flex: 1,
  },
  domainsActive: {
    fontSize: 13,
    lineHeight: 18,
  },
  noDataText: {
    fontSize: 13,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 4,
  },
  domainChip: {
    width: "22%",
    flexGrow: 1,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 6,
    alignItems: "center",
    minWidth: 70,
  },
  domainScore: {
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 22,
  },
  domainLabel: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 0.5,
    marginTop: 2,
    textAlign: "center",
  },
  domainDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 4,
  },
  insightsDivider: {
    borderTopWidth: 1,
    paddingTop: 12,
    marginTop: 8,
    gap: 6,
  },
  insightRow: {
    flexDirection: "row",
    gap: 6,
  },
  insightDot: {
    fontSize: 13,
    lineHeight: 18,
  },
  insightText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
  },
});
