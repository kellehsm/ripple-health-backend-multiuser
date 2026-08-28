import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Dimensions, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { ScreenBackground } from "../components/ScreenBackground";
import Svg, { Line, Rect, Text as SvgText } from "react-native-svg";
import { useTheme } from "../theme/ThemeContext";
import { api } from "../api/client";
import { RangeSelector } from "../components/RangeSelector";
import { ShadowCard } from "../components/ShadowCard";
import { CardLoadingOverlay } from "../components/CardLoadingOverlay";
import { Ionicons } from "@expo/vector-icons";
import { formatDateLocal } from "../utils/dateUtils";
import { FONT_SIZES } from "../theme/tokens";

type SleepSession = {
  id: string;
  start_time: string;
  end_time: string;
  quality_score: number | null;
  deep_ms: number | null;
  rem_ms: number | null;
  light_ms: number | null;
  awake_ms: number | null;
};

type StatsPayload = {
  yesterday_seconds: number;
  seven_day_average_seconds: number;
  week_days: Array<{ date: string; seconds: number }>;
  stages_30d: null | {
    avg_deep_ms:  number | null;
    avg_rem_ms:   number | null;
    avg_light_ms: number | null;
    avg_awake_ms: number | null;
    sample_count: number;
  };
  schedule_30d: {
    median_bedtime_mins:  number | null;
    median_waketime_mins: number | null;
  };
};

const SCREEN_WIDTH = Dimensions.get("window").width;
const CHART_W = SCREEN_WIDTH - 64;
const RANGE_OPTIONS = [7, 30] as const;
const GOAL_SECS = 8 * 3600;

// Stage colors (indigo/lavender palette per style guide)
const STAGE_COLOR = {
  deep:  "#4B3F72", // deep indigo
  rem:   "#7965B0", // lavender-purple
  light: "#B4A3D9", // soft lavender
  awake: "#E8DFF3", // very pale lavender
} as const;

function fmtHours(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.round((secs % 3600) / 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function fmtMinsAsTime(mins: number | null): string {
  if (mins == null) return "—";
  const h24 = Math.floor(mins / 60) % 24;
  const m = Math.round(mins % 60);
  const h12 = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24;
  const ampm = h24 >= 12 ? "PM" : "AM";
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function dayLabel(iso: string): string {
  const d = new Date(iso.slice(0, 10) + "T00:00:00");
  return ["S", "M", "T", "W", "T", "F", "S"][d.getDay()];
}

// Compute a "consistency" streak: how many of the last N nights hit ≥ 7h
function consistencyStreak(sessions: SleepSession[], targetHours = 7): number {
  const byDay = new Map<string, number>();
  for (const s of sessions) {
    // Local date keys — UTC keys shifted evening sessions onto the wrong day in
    // western timezones and never matched the local walk-back keys below.
    const key = formatDateLocal(new Date(s.start_time));
    const secs = (new Date(s.end_time).getTime() - new Date(s.start_time).getTime()) / 1000;
    byDay.set(key, (byDay.get(key) ?? 0) + secs);
  }
  // Walk yesterday backwards
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let streak = 0;
  for (let i = 1; i < 60; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = formatDateLocal(d);
    const secs = byDay.get(key) ?? 0;
    if (secs / 3600 >= targetHours) streak++;
    else break;
  }
  return streak;
}

export function SleepDetailScreen() {
  const { theme } = useTheme();
  const ink = theme.ink;
  const [rangeDays, setRangeDays] = useState<7 | 30>(7);
  const [sessions, setSessions] = useState<SleepSession[]>([]);
  const [stats, setStats] = useState<StatsPayload | null>(null);
  const [loadingRange, setLoadingRange] = useState(true);
  const [loadingStats, setLoadingStats] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [scoreExplainerVisible, setScoreExplainerVisible] = useState(false);

  // Compute a client-side sleep score (0-100) for the last session so
  // there's something concrete to tap. Blends duration, deep+REM balance,
  // and awake time. Only uses fields the DB actually returns.
  const scored = React.useMemo(() => {
    const s = sessions[0];
    if (!s) return null;
    const totalMs = new Date(s.end_time).getTime() - new Date(s.start_time).getTime();
    const totalMin = Math.max(0, totalMs / 60000);
    // Duration: 7-9h ideal → 100; 6h or 10h → 70; 4h or 12h → 20
    const durHours = totalMin / 60;
    const durationScore = durHours >= 7 && durHours <= 9 ? 100
      : durHours >= 6 && durHours <= 10 ? 70
      : durHours >= 4 && durHours <= 12 ? 40 : 15;
    // Deep+REM share (target ~35% combined)
    const deepPlusRem = ((s.deep_ms ?? 0) + (s.rem_ms ?? 0)) / (totalMs || 1);
    const stagesScore = deepPlusRem >= 0.30 ? 100
      : deepPlusRem >= 0.20 ? 75
      : deepPlusRem > 0 ? 45 : 55;   // 55 baseline when device doesn't report stages
    // Awake share (lower is better)
    const awakeShare = (s.awake_ms ?? 0) / (totalMs || 1);
    const awakeScore = awakeShare < 0.05 ? 100 : awakeShare < 0.10 ? 80 : awakeShare < 0.20 ? 55 : 25;
    const overall = Math.round(0.5 * durationScore + 0.3 * stagesScore + 0.2 * awakeScore);
    return {
      score: overall,
      durHours: Number(durHours.toFixed(1)),
      deepPlusRemPct: Math.round(deepPlusRem * 100),
      awakePct: Math.round(awakeShare * 100),
    };
  }, [sessions]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        loadRange(rangeDays),
        api.sleepStats().then((s: StatsPayload) => setStats(s)).catch(() => {}),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [rangeDays]);

  const loadRange = useCallback(async (days: number) => {
    setLoadingRange(true);
    try {
      const end = new Date();
      const start = new Date(end.getTime() - days * 86400_000);
      const data = await api.sleepRange(start.toISOString(), end.toISOString());
      setSessions(data.sessions);
    } catch { /* leave state as-is on error */ }
    finally { setLoadingRange(false); }
  }, []);

  useEffect(() => { loadRange(rangeDays); }, [loadRange, rangeDays]);

  useEffect(() => {
    api.sleepStats()
      .then((s: StatsPayload) => setStats(s))
      .catch(() => {})
      .finally(() => setLoadingStats(false));
  }, []);

  // ── Per-night rollup for the stacked bar chart ────────────────────────────
  const nights = useMemo(() => {
    const byDay = new Map<string, { totalSecs: number; deep: number; rem: number; light: number; awake: number }>();
    for (const s of sessions) {
      // Assign this session to the LOCAL wake day (end_time), matches typical
      // "last night" convention. Must use local formatting: UTC keys made early
      // -morning wake times land on the previous day in EST and never match the
      // local fill keys below, so nights shifted or vanished.
      const key = formatDateLocal(new Date(s.end_time));
      const totalSecs = (new Date(s.end_time).getTime() - new Date(s.start_time).getTime()) / 1000;
      const existing = byDay.get(key) ?? { totalSecs: 0, deep: 0, rem: 0, light: 0, awake: 0 };
      existing.totalSecs += totalSecs;
      existing.deep  += (s.deep_ms  ?? 0) / 1000;
      existing.rem   += (s.rem_ms   ?? 0) / 1000;
      existing.light += (s.light_ms ?? 0) / 1000;
      existing.awake += (s.awake_ms ?? 0) / 1000;
      byDay.set(key, existing);
    }
    // Fill missing days with zeros so gaps show
    const arr: Array<{ date: string; totalSecs: number; deep: number; rem: number; light: number; awake: number }> = [];
    const end = new Date(); end.setHours(0, 0, 0, 0);
    for (let i = rangeDays - 1; i >= 0; i--) {
      const d = new Date(end); d.setDate(end.getDate() - i);
      const key = formatDateLocal(d);
      const entry = byDay.get(key);
      arr.push({ date: key, totalSecs: entry?.totalSecs ?? 0, deep: entry?.deep ?? 0, rem: entry?.rem ?? 0, light: entry?.light ?? 0, awake: entry?.awake ?? 0 });
    }
    return arr;
  }, [sessions, rangeDays]);

  // Chart dims
  const maxSecs = Math.max(GOAL_SECS + 3600, ...nights.map((n) => n.totalSecs));
  const CHART_H = 180;
  const PAD_L = 32, PAD_B = 22, PAD_T = 10;
  const chartInnerW = CHART_W - PAD_L - 8;
  const chartInnerH = CHART_H - PAD_T - PAD_B;
  const barGap = 2;
  const barW = Math.max(6, (chartInnerW - (nights.length - 1) * barGap) / nights.length);

  const avgSecs = nights.length ? nights.reduce((s, n) => s + n.totalSecs, 0) / nights.length : 0;

  // Hoist per-bar geometry into a memo so the expensive map is skipped on unrelated re-renders
  const barGeometry = useMemo(() => nights.map((n, i) => {
    const x = PAD_L + i * (barW + barGap);
    const hasStages = n.deep + n.rem + n.light + n.awake > 0;
    return { n, x, hasStages };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [nights, barW, barGap, PAD_L]);

  const streak = consistencyStreak(sessions, 7);
  const debtSecs = (GOAL_SECS - avgSecs) * rangeDays;
  const isDebt = debtSecs > 0;

  // ── Rolling 7-day sleep debt ──────────────────────────────────────────────
  const sleepDebt = useMemo(() => {
    // Build a day→seconds map from all fetched sessions (regardless of rangeDays)
    const byDay = new Map<string, number>();
    for (const s of sessions) {
      const key = formatDateLocal(new Date(s.end_time));
      const secs = (new Date(s.end_time).getTime() - new Date(s.start_time).getTime()) / 1000;
      byDay.set(key, (byDay.get(key) ?? 0) + secs);
    }
    const GOAL = 8 * 3600;
    const today = new Date(); today.setHours(0, 0, 0, 0);

    // Last 7 days (days 1–7 back, i.e. yesterday through 7 days ago)
    let current7h = 0;
    for (let i = 1; i <= 7; i++) {
      const d = new Date(today); d.setDate(today.getDate() - i);
      const secs = byDay.get(formatDateLocal(d)) ?? 0;
      current7h += Math.max(0, GOAL - secs) / 3600;
    }

    // Prior 7 days (days 8–14 back) for trend
    let prior7h = 0;
    let priorHasData = false;
    for (let i = 8; i <= 14; i++) {
      const d = new Date(today); d.setDate(today.getDate() - i);
      const key = formatDateLocal(d);
      if (byDay.has(key)) priorHasData = true;
      const secs = byDay.get(key) ?? 0;
      prior7h += Math.max(0, GOAL - secs) / 3600;
    }

    const trendH = priorHasData ? current7h - prior7h : null;
    return { debtH: current7h, trendH, priorHasData };
  }, [sessions]);

  if (!loadingRange && sessions.length === 0) {
    return (
      <ScrollView
        style={{ backgroundColor: theme.page }}
        contentContainerStyle={[styles.content, { flexGrow: 1, justifyContent: "center" }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.teal.solid} colors={[theme.teal.solid]} />
        }
      >
        <View style={{ alignItems: "center", gap: 10, padding: 24 }}>
          <Ionicons name="moon-outline" size={44} color={theme.violet?.solid ?? "#7965B0"} />
          <Text style={{ color: theme.textStrong, fontSize: 16, fontWeight: "800" }}>No sleep data yet</Text>
          <Text style={{ color: theme.textSoft, fontSize: 13, textAlign: "center", lineHeight: 19 }}>
            Sync from Health Connect on the Health tab to see your nights here.
          </Text>
        </View>
      </ScrollView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.page }}>
      <ScreenBackground pageId="sleep_detail" />
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.teal.solid} colors={[theme.teal.solid]} />
      }
    >

      {/* Last-night score — tap to see the breakdown */}
      {scored && (
        <Pressable
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setScoreExplainerVisible(true); }}
          accessibilityRole="button"
          accessibilityLabel={`Last night's sleep score ${scored.score} out of 100. Tap to see the breakdown.`}
        >
          <ShadowCard size="card" accent={theme.violet?.solid ?? "#7965B0"} padding={14}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View>
                <Text style={{ fontSize: 11, fontWeight: "800", color: theme.textSoft, letterSpacing: 0.5 }}>LAST NIGHT'S SCORE</Text>
                <Text style={{ fontSize: 32, fontWeight: "900", color: ink, letterSpacing: -1, marginTop: 2 }}>
                  {scored.score}<Text style={{ fontSize: 16, color: theme.textSoft }}> / 100</Text>
                </Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={{ color: theme.textSoft, fontSize: 11 }}>{scored.durHours}h · {scored.deepPlusRemPct}% deep+REM</Text>
                <Text style={{ color: theme.textSoft, fontSize: 11, marginTop: 2 }}>tap to explain ›</Text>
              </View>
            </View>
          </ShadowCard>
        </Pressable>
      )}

      {/* Score-explainer modal */}
      <Modal visible={scoreExplainerVisible} transparent animationType="fade" onRequestClose={() => setScoreExplainerVisible(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: 24 }} onPress={() => setScoreExplainerVisible(false)}>
          <Pressable onPress={(e) => e.stopPropagation()} style={{ backgroundColor: theme.card, borderRadius: 22, borderWidth: 2, borderColor: theme.cardBorder, padding: 20, gap: 10 }}>
            <Text style={{ color: theme.textStrong, fontSize: 17, fontWeight: "900" }}>How the score is calculated</Text>
            <Text style={{ color: theme.textSoft, fontSize: 12 }}>Blended from three things, weighted:</Text>
            <View style={{ gap: 6 }}>
              <Text style={{ color: theme.textStrong, fontSize: 13 }}>• <Text style={{ fontWeight: "900" }}>Duration (50%)</Text> — 7–9h is ideal. You had <Text style={{ fontWeight: "900" }}>{scored?.durHours}h</Text>.</Text>
              <Text style={{ color: theme.textStrong, fontSize: 13 }}>• <Text style={{ fontWeight: "900" }}>Deep + REM (30%)</Text> — target 30%+ combined. You had <Text style={{ fontWeight: "900" }}>{scored?.deepPlusRemPct}%</Text>.</Text>
              <Text style={{ color: theme.textStrong, fontSize: 13 }}>• <Text style={{ fontWeight: "900" }}>Awake time (20%)</Text> — less is better. You were awake <Text style={{ fontWeight: "900" }}>{scored?.awakePct}%</Text> of the night.</Text>
            </View>
            <Text style={{ color: theme.textSoft, fontSize: 11, marginTop: 4 }}>
              This is a heuristic — not medical or diagnostic. If your device doesn't report sleep stages, that section falls back to a middle score.
            </Text>
            <Pressable
              onPress={() => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); setScoreExplainerVisible(false); }}
              style={{ marginTop: 8, borderWidth: 2, borderColor: theme.ink, borderRadius: 14, paddingVertical: 10, alignItems: "center", backgroundColor: theme.teal.solid }}
            >
              <Text style={{ color: "#fff", fontWeight: "900", letterSpacing: 0.5 }}>Got it</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Sleep Debt Card ─────────────────────────────────────────────── */}
      {(() => {
        const { debtH, trendH } = sleepDebt;
        const noDebt = debtH < 0.1;
        // Bar fill: 0h debt = empty, 8h+ = full; capped at 1
        const fillFraction = Math.min(1, debtH / 8);
        const barColor = debtH < 2 ? theme.success : debtH < 5 ? theme.warning : theme.danger;
        return (
          <ShadowCard size="card" accent={noDebt ? theme.success : theme.danger} padding={14}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <Ionicons name="battery-half-outline" size={17} color={noDebt ? theme.success : theme.danger} />
              <Text style={{ fontSize: FONT_SIZES.subheading, fontWeight: "900", color: theme.textStrong, letterSpacing: -0.4 }} allowFontScaling maxFontSizeMultiplier={1.4} accessibilityRole="header">
                Sleep Debt
              </Text>
            </View>

            {noDebt ? (
              <Text style={{ fontSize: FONT_SIZES.body, fontWeight: "700", color: theme.success }}>
                No sleep debt this week 🎉
              </Text>
            ) : (
              <>
                <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6, marginBottom: 4 }}>
                  <Text style={{ fontSize: FONT_SIZES.display, fontWeight: "900", color: theme.danger, letterSpacing: -0.5 }}>
                    {debtH.toFixed(1)}h
                  </Text>
                  <Text style={{ fontSize: FONT_SIZES.label, color: theme.textSoft }}>over the past 7 days</Text>
                </View>

                {/* Debt fill bar */}
                <View style={{ height: 7, backgroundColor: theme.cardBorder, borderRadius: 4, overflow: "hidden", marginBottom: 8 }}>
                  <View
                    style={{
                      height: 7,
                      width: (`${Math.round(fillFraction * 100)}%` as `${number}%`),
                      backgroundColor: barColor,
                      borderRadius: 4,
                    }}
                  />
                </View>

                {/* Trend */}
                {trendH !== null && (
                  <Text style={{ fontSize: FONT_SIZES.caption, fontWeight: "700", color: trendH > 0 ? theme.danger : theme.success }}>
                    {trendH > 0
                      ? `↑ ${trendH.toFixed(1)}h more than last week`
                      : `↓ ${Math.abs(trendH).toFixed(1)}h less than last week`}
                  </Text>
                )}
              </>
            )}
          </ShadowCard>
        );
      })()}

      {/* Range picker + averages */}
      <ShadowCard size="card" accent={theme.violet?.solid ?? "#7965B0"} padding={14}>
        <View style={styles.rangeRow}>
          <RangeSelector
            value={rangeDays}
            options={RANGE_OPTIONS as any}
            onChange={(v) => { Haptics.selectionAsync(); setRangeDays(v as 7 | 30); }}
            suffix="d"
            label="Sleep range"
          />
          <View style={{ alignItems: "flex-end" }} accessibilityLabel={`Average sleep ${fmtHours(avgSecs)} over the past ${rangeDays} days`}>
            <Text style={{ fontSize: 11, fontWeight: "800", color: theme.textSoft, letterSpacing: 0.5 }} allowFontScaling maxFontSizeMultiplier={1.3}>{rangeDays}D AVG</Text>
            <Text style={{ fontSize: 24, fontWeight: "900", color: ink, letterSpacing: -0.5 }} allowFontScaling maxFontSizeMultiplier={1.2}>{fmtHours(avgSecs)}</Text>
          </View>
        </View>

        {/* Stacked-bar chart per night */}
        {nights.length > 0 && (
          <Svg
            width={CHART_W}
            height={CHART_H}
            style={{ marginTop: 8 }}
            accessible
            accessibilityRole="image"
            accessibilityLabel={`Sleep chart, ${nights.length} nights, average ${fmtHours(avgSecs)}`}
          >
            {/* Goal line */}
            <Line
              x1={PAD_L} y1={PAD_T + chartInnerH * (1 - GOAL_SECS / maxSecs)}
              x2={PAD_L + chartInnerW} y2={PAD_T + chartInnerH * (1 - GOAL_SECS / maxSecs)}
              stroke={theme.textSoft} strokeDasharray="3,3" strokeWidth={1} opacity={0.5}
            />
            <SvgText
              x={PAD_L - 4} y={PAD_T + chartInnerH * (1 - GOAL_SECS / maxSecs) + 3}
              fontSize={8} fill={theme.textSoft} textAnchor="end"
            >8h</SvgText>
            {/* Bars */}
            {barGeometry.map(({ n, x, hasStages }, i) => {
              void i;
              // Sleep segments (asleep = deep + rem + light) grow from bottom;
              // awake stacks on top faded. If no stage data, show total as a
              // solid violet bar.
              if (!hasStages && n.totalSecs > 0) {
                const totalH = (n.totalSecs / maxSecs) * chartInnerH;
                return (
                  <Rect key={n.date} x={x} y={PAD_T + chartInnerH - totalH} width={barW} height={totalH} fill={theme.violet?.solid ?? "#7965B0"} rx={2} />
                );
              }
              const segSecs = [n.deep, n.rem, n.light, n.awake];
              const segColors = [STAGE_COLOR.deep, STAGE_COLOR.rem, STAGE_COLOR.light, STAGE_COLOR.awake];
              let yCursor = PAD_T + chartInnerH;
              return (
                <React.Fragment key={n.date}>
                  {segSecs.map((secs, si) => {
                    if (secs <= 0) return null;
                    const segH = (secs / maxSecs) * chartInnerH;
                    yCursor -= segH;
                    return <Rect key={si} x={x} y={yCursor} width={barW} height={segH} fill={segColors[si]} rx={si === 0 || si === 3 ? 2 : 0} />;
                  })}
                </React.Fragment>
              );
            })}
            {/* X-axis labels every ~4 bars so 30d doesn't crowd */}
            {barGeometry.map(({ n, x }, i) => {
              const step = rangeDays === 7 ? 1 : 5;
              if (i % step !== 0) return null;
              const labelX = x + barW / 2;
              return (
                <SvgText key={i} x={labelX} y={CHART_H - 6} fontSize={9} fill={theme.textSoft} textAnchor="middle">
                  {dayLabel(n.date)}
                </SvgText>
              );
            })}
          </Svg>
        )}

        {/* Legend — only when stages exist somewhere in view */}
        {nights.some((n) => n.deep + n.rem + n.light + n.awake > 0) && (
          <View style={styles.legendRow}>
            {[
              ["Deep", STAGE_COLOR.deep],
              ["REM", STAGE_COLOR.rem],
              ["Light", STAGE_COLOR.light],
              ["Awake", STAGE_COLOR.awake],
            ].map(([label, color]) => (
              <View key={label} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: color as string, borderColor: ink }]} />
                <Text style={{ color: theme.textSoft, fontSize: 11 }}>{label}</Text>
              </View>
            ))}
          </View>
        )}
        <CardLoadingOverlay loading={loadingRange} size="large" />
      </ShadowCard>

      {/* Sleep debt card */}
      <ShadowCard size="card" accent={theme.violet?.solid ?? "#7965B0"} padding={14}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <Ionicons name="moon-outline" size={17} color={theme.violet?.solid ?? "#7965B0"} />
          <Text style={[styles.cardTitle, { color: theme.textStrong }]} allowFontScaling maxFontSizeMultiplier={1.4} accessibilityRole="header">
            Sleep {isDebt ? "debt" : "surplus"}
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
          <Text style={{ fontSize: 28, fontWeight: "900", color: isDebt ? (theme.red?.solid ?? "#ef4444") : theme.teal.solid, letterSpacing: -0.5 }}>
            {isDebt ? "−" : "+"}{fmtHours(Math.abs(debtSecs))}
          </Text>
          <Text style={{ color: theme.textSoft, fontSize: 12 }}>vs 8h/night · past {rangeDays} days</Text>
        </View>
        {streak > 0 && (
          <Text style={{ color: theme.teal.fg, fontSize: 12, marginTop: 8, fontWeight: "700" }}>
            🔥 {streak}-night streak of 7h+
          </Text>
        )}
      </ShadowCard>

      {/* Schedule + 30d stage averages */}
      <ShadowCard size="card" accent={theme.violet?.solid ?? "#7965B0"} padding={14}>
        <Text style={[styles.cardTitle, { color: theme.textStrong, marginBottom: 8 }]} allowFontScaling maxFontSizeMultiplier={1.4} accessibilityRole="header">
          Schedule (30d median)
        </Text>
        <View style={{ flexDirection: "row", justifyContent: "space-around" }}>
          <View style={{ alignItems: "center" }} accessibilityLabel={`Median bedtime ${fmtMinsAsTime(stats?.schedule_30d.median_bedtime_mins ?? null)}`}>
            <Ionicons name="bed-outline" size={22} color={theme.violet?.solid ?? "#7965B0"} />
            <Text style={{ fontSize: 9, fontWeight: "800", color: theme.textSoft, letterSpacing: 0.4, marginTop: 4 }}>BEDTIME</Text>
            <Text style={{ fontSize: 20, fontWeight: "900", color: ink, letterSpacing: -0.5, marginTop: 2 }}>{fmtMinsAsTime(stats?.schedule_30d.median_bedtime_mins ?? null)}</Text>
          </View>
          <View style={{ alignItems: "center" }} accessibilityLabel={`Median wake time ${fmtMinsAsTime(stats?.schedule_30d.median_waketime_mins ?? null)}`}>
            <Ionicons name="sunny-outline" size={22} color={theme.amber?.solid ?? "#f59e0b"} />
            <Text style={{ fontSize: 9, fontWeight: "800", color: theme.textSoft, letterSpacing: 0.4, marginTop: 4 }}>WAKE</Text>
            <Text style={{ fontSize: 20, fontWeight: "900", color: ink, letterSpacing: -0.5, marginTop: 2 }}>{fmtMinsAsTime(stats?.schedule_30d.median_waketime_mins ?? null)}</Text>
          </View>
        </View>
        <CardLoadingOverlay loading={loadingStats} size="small" />
      </ShadowCard>

      {stats?.stages_30d && (
        <ShadowCard size="card" accent={theme.violet?.solid ?? "#7965B0"} padding={14}>
          <Text style={[styles.cardTitle, { color: theme.textStrong, marginBottom: 4 }]} allowFontScaling maxFontSizeMultiplier={1.4} accessibilityRole="header">
            30-day stage average
          </Text>
          <Text style={{ color: theme.textSoft, fontSize: 11, marginBottom: 12 }}>
            Based on {stats.stages_30d.sample_count} nights with stage data.
          </Text>
          {[
            ["Deep",  stats.stages_30d.avg_deep_ms,  STAGE_COLOR.deep],
            ["REM",   stats.stages_30d.avg_rem_ms,   STAGE_COLOR.rem],
            ["Light", stats.stages_30d.avg_light_ms, STAGE_COLOR.light],
            ["Awake", stats.stages_30d.avg_awake_ms, STAGE_COLOR.awake],
          ].map(([label, ms, color]) => {
            const secs = ms ? Number(ms) / 1000 : 0;
            const pct = avgSecs > 0 ? Math.min(1, secs / avgSecs) : 0;
            return (
              <View key={label as string} style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                  <Text style={{ color: theme.textStrong, fontSize: 13, fontWeight: "700" }}>{label as string}</Text>
                  <Text style={{ color: theme.textSoft, fontSize: 12, fontWeight: "700" }}>{fmtHours(secs)}</Text>
                </View>
                <View style={{ height: 6, backgroundColor: theme.cardBorder, borderRadius: 3, overflow: "hidden" }}>
                  <View style={{ height: 6, width: (`${Math.round(pct * 100)}%` as `${number}%`), backgroundColor: color as string, borderRadius: 3 }} />
                </View>
              </View>
            );
          })}
        </ShadowCard>
      )}

    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  rangeRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardTitle: { fontSize: 19, fontWeight: "900", letterSpacing: -0.5 },
  legendRow: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 8 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1 },
});
