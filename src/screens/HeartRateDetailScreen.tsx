import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Dimensions,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient as SvgLinearGradient,
  Polygon,
  Polyline,
  Stop,
  Text as SvgText,
} from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { api } from "../api/client";
import { ShadowCard } from "../components/ShadowCard";
import { CardLoadingOverlay } from "../components/CardLoadingOverlay";
import { CountUpText } from "../components/CountUpText";
import { LoadingIndicator } from "../components/LoadingIndicator";
import { EmptyState } from "../components/EmptyState";
import { useReduceMotion } from "../hooks/useReduceMotion";

// ─── types ───────────────────────────────────────────────────────────────────
type HRReading = { recorded_at: string; bpm: number };
type DayRow = {
  date: string;
  resting_bpm: number;
  peak_bpm: number;
  avg_bpm: number;
  reading_count: number;
};
type TrendRow = {
  date: string;
  resting_bpm: number;
  avg_bpm: number;
  reading_count: number;
};
type HRStats = {
  trend_30d: TrendRow[];
  this_week_avg_rest: number | null;
  last_week_avg_rest: number | null;
  week_start: string;
  today_min: { bpm: number; recorded_at: string } | null;
  today_max: { bpm: number; recorded_at: string } | null;
  zones: {
    max_hr: number;
    max_hr_estimated: boolean;
    zone1_max: number;
    zone2_max: number;
    zone3_max: number;
    rest: number;
    light: number;
    moderate: number;
    hard: number;
    total: number;
  };
};

// ─── constants ────────────────────────────────────────────────────────────────
const SCREEN_WIDTH = Dimensions.get("window").width;
const CHART_W = SCREEN_WIDTH - 64;
const CHART_H = 180;
const PAD_L = 36;
const PAD_B = 20;
const PAD_T = 12;
const RANGE_OPTIONS = [3, 6, 12, 24];
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const ZONE_CONFIG = [
  { key: "rest" as const,     label: "Rest",     color: "#6EE7B7" }, // green
  { key: "light" as const,    label: "Light",    color: "#60A5FA" }, // blue
  { key: "moderate" as const, label: "Moderate", color: "#F59E0B" }, // amber
  { key: "hard" as const,     label: "Hard",     color: "#EF4444" }, // red
];

// ─── helpers ─────────────────────────────────────────────────────────────────
function shortDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return (d.getMonth() + 1) + "/" + d.getDate();
}

function dayLabel(iso: string): string {
  return DAY_LABELS[new Date(iso + "T00:00:00").getDay()];
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function fmtBpm(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "--";
  return String(Math.round(v));
}

function rollingAvg(arr: number[], window: number): (number | null)[] {
  return arr.map((_, i) => {
    const slice = arr.slice(Math.max(0, i - window + 1), i + 1);
    if (slice.length < Math.min(window, 3)) return null;
    return Math.round(slice.reduce((a, b) => a + b, 0) / slice.length);
  });
}

// ─── main component ───────────────────────────────────────────────────────────
export function HeartRateDetailScreen() {
  const { theme } = useTheme();
  const ink = theme.ink;
  const reduceMotion = useReduceMotion();
  const s = useMemo(() => makeStyles(ink, theme.card), [ink, theme.card]);

  // intraday chart
  const [rangeHours, setRangeHours] = useState(6);
  const [readings, setReadings] = useState<HRReading[]>([]);
  const [loadingChart, setLoadingChart] = useState(true);

  // 7-day daily table
  const [dailyRows, setDailyRows] = useState<DayRow[]>([]);
  const [loadingDaily, setLoadingDaily] = useState(true);

  // stats (trend, zones, highlights)
  const [hrStats, setHrStats] = useState<HRStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  // insights
  const [insightLine, setInsightLine] = useState<string | null>(null);

  const [refreshing, setRefreshing] = useState(false);

  const loadChart = useCallback(async (hours: number) => {
    setLoadingChart(true);
    try {
      const now = new Date();
      const start = new Date(now.getTime() - hours * 3600 * 1000);
      const data = await api.heartRateRange(start.toISOString(), now.toISOString());
      setReadings(Array.isArray(data) ? data : []);
    } catch (_) {}
    finally { setLoadingChart(false); }
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const s: HRStats = await (api as any).heartRateStats();
      setHrStats(s);
    } catch (_) {}
    finally { setLoadingStats(false); }
  }, []);

  const loadDaily = useCallback(async () => {
    try {
      const rows: DayRow[] = await api.heartRateDaily(7);
      setDailyRows(Array.isArray(rows) ? rows : []);
    } catch (_) {}
    finally { setLoadingDaily(false); }
  }, []);

  const loadInsights = useCallback(async () => {
    try {
      const all: Array<{ title: string; rule_id?: string; dismissed?: boolean }> = await api.getInsights();
      const hrInsight = all.find(
        (i) => !i.dismissed && /heart|hr|bpm|pulse|cardio/i.test(i.title)
      );
      setInsightLine(hrInsight?.title ?? null);
    } catch (_) {}
  }, []);

  useEffect(() => { loadChart(rangeHours); }, [loadChart, rangeHours]);
  useEffect(() => { loadStats(); loadDaily(); loadInsights(); }, [loadStats, loadDaily, loadInsights]);

  async function handleRefresh() {
    setRefreshing(true);
    await Promise.all([
      loadChart(rangeHours),
      loadStats(),
      loadDaily(),
      loadInsights(),
    ]);
    setRefreshing(false);
  }

  // ── intraday chart geometry ──────────────────────────────────────────────
  const bpms = readings.map((r) => r.bpm).filter((b) => Number.isFinite(b));
  const rawMin = bpms.length ? Math.min(...bpms) : 50;
  const rawMax = bpms.length ? Math.max(...bpms) : 120;
  const padding = Math.max(5, Math.round((rawMax - rawMin) * 0.1));
  const chartMin = rawMin - padding;
  const chartMax = rawMax + padding;
  const chartRange = chartMax - chartMin || 1;
  const usableW = CHART_W - PAD_L;
  const usableH = CHART_H - PAD_T - PAD_B;

  const now = Date.now();
  const windowStart = now - rangeHours * 3600 * 1000;
  const windowMs = rangeHours * 3600 * 1000;

  const chartPoints = readings
    .map((r) => {
      const t = new Date(r.recorded_at).getTime();
      const x = PAD_L + ((t - windowStart) / windowMs) * usableW;
      const y = PAD_T + usableH - ((r.bpm - chartMin) / chartRange) * usableH;
      return x + "," + y;
    })
    .join(" ");

  const gridVals = (() => {
    const step = chartRange > 80 ? 20 : chartRange > 40 ? 10 : 5;
    const start = Math.ceil(chartMin / step) * step;
    const vals: number[] = [];
    for (let v = start; v <= chartMax; v += step) vals.push(v);
    return vals;
  })();

  const resting = bpms.length ? Math.min(...bpms) : null;
  const peak = bpms.length ? Math.max(...bpms) : null;
  const avg = bpms.length ? Math.round(bpms.reduce((a, b) => a + b, 0) / bpms.length) : null;

  // ── 30d trend chart geometry ─────────────────────────────────────────────
  const trend = hrStats?.trend_30d ?? [];
  const trendResting = trend.map((r) => r.resting_bpm).filter((b) => Number.isFinite(b));
  const rollingAvgs = rollingAvg(trendResting, 7);
  const trendMin = trendResting.length ? Math.min(...trendResting) - 5 : 40;
  const trendMax = trendResting.length ? Math.max(...trendResting) + 5 : 100;
  const trendRange = trendMax - trendMin || 1;
  const TREND_H = 140;
  const TREND_PAD_T = 8;
  const TREND_PAD_B = 18;
  const TREND_PAD_L = 32;
  const trendInnerH = TREND_H - TREND_PAD_T - TREND_PAD_B;
  const trendInnerW = CHART_W - TREND_PAD_L - 4;

  const trendLinePoints = trend.map((r, i) => {
    const x = TREND_PAD_L + (i / Math.max(trend.length - 1, 1)) * trendInnerW;
    const y = TREND_PAD_T + trendInnerH - ((r.resting_bpm - trendMin) / trendRange) * trendInnerH;
    return `${x},${y}`;
  }).join(" ");

  const rollingLinePoints = rollingAvgs
    .map((v, i) => {
      if (v == null) return null;
      const x = TREND_PAD_L + (i / Math.max(trend.length - 1, 1)) * trendInnerW;
      const y = TREND_PAD_T + trendInnerH - ((v - trendMin) / trendRange) * trendInnerH;
      return `${x},${y}`;
    })
    .filter(Boolean) as string[];

  // ── week-over-week callout ───────────────────────────────────────────────
  const thisWeekRest = hrStats?.this_week_avg_rest != null && Number.isFinite(hrStats.this_week_avg_rest) ? hrStats.this_week_avg_rest : null;
  const lastWeekRest = hrStats?.last_week_avg_rest != null && Number.isFinite(hrStats.last_week_avg_rest) ? hrStats.last_week_avg_rest : null;
  const weekDelta = thisWeekRest != null && lastWeekRest != null ? thisWeekRest - lastWeekRest : null;

  // ── zones ────────────────────────────────────────────────────────────────
  const zones = hrStats?.zones;
  const zoneTotalCount = zones?.total ?? 0;

  return (
    <View style={{ flex: 1, backgroundColor: theme.page }}>
      <ScrollView
        style={{ flex: 1, backgroundColor: "transparent" }}
        contentContainerStyle={s.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.red.sub} />
        }
      >
        {/* ── Headline stats card ─────────────────────────────────────────── */}
        <ShadowCard size="card" accent={theme.red.sub} padding={16}>
          <View style={s.statsRow}>
            <View style={s.stat}>
              <CountUpText
                value={resting}
                style={[s.statVal, { color: theme.red.sub }]}
                duration={reduceMotion ? 0 : 500}
              />
              <Text style={[s.statLbl, { color: theme.textSoft }]}>Resting</Text>
            </View>
            <View style={s.stat}>
              <CountUpText
                value={avg}
                style={[s.statVal, { color: theme.textStrong }]}
                duration={reduceMotion ? 0 : 500}
              />
              <Text style={[s.statLbl, { color: theme.textSoft }]}>Average</Text>
            </View>
            <View style={s.stat}>
              <CountUpText
                value={peak}
                style={[s.statVal, { color: theme.textStrong }]}
                duration={reduceMotion ? 0 : 500}
              />
              <Text style={[s.statLbl, { color: theme.textSoft }]}>Peak</Text>
            </View>
            <View style={s.stat}>
              <CountUpText
                value={readings.length || null}
                style={[s.statVal, { color: theme.textStrong }]}
                duration={reduceMotion ? 0 : 350}
              />
              <Text style={[s.statLbl, { color: theme.textSoft }]}>Readings</Text>
            </View>
          </View>
          <Text style={[s.subNote, { color: theme.textSoft }]}>{rangeHours}h window · bpm</Text>

          {/* Today's high/low flags */}
          {(hrStats?.today_min || hrStats?.today_max) && (
            <View style={{ flexDirection: "row", gap: 16, marginTop: 10, paddingTop: 10, borderTopWidth: 0.5, borderTopColor: theme.cardBorder }}>
              {hrStats.today_min && (
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.textSoft, fontSize: 10, fontWeight: "700", letterSpacing: 0.4 }}>TODAY LOW</Text>
                  <Text style={{ color: theme.blue.solid, fontSize: 18, fontWeight: "900", letterSpacing: -0.5 }}>
                    {hrStats.today_min.bpm} <Text style={{ fontSize: 11, fontWeight: "500" }}>bpm</Text>
                  </Text>
                  <Text style={{ color: theme.textSoft, fontSize: 11 }}>{fmtTime(hrStats.today_min.recorded_at)}</Text>
                </View>
              )}
              {hrStats.today_max && (
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.textSoft, fontSize: 10, fontWeight: "700", letterSpacing: 0.4 }}>TODAY HIGH</Text>
                  <Text style={{ color: theme.red.sub, fontSize: 18, fontWeight: "900", letterSpacing: -0.5 }}>
                    {hrStats.today_max.bpm} <Text style={{ fontSize: 11, fontWeight: "500" }}>bpm</Text>
                  </Text>
                  <Text style={{ color: theme.textSoft, fontSize: 11 }}>{fmtTime(hrStats.today_max.recorded_at)}</Text>
                </View>
              )}
            </View>
          )}
          <CardLoadingOverlay loading={loadingChart && loadingStats} size="small" />
        </ShadowCard>

        {/* ── HR insight line ─────────────────────────────────────────────── */}
        {insightLine && (
          <ShadowCard size="card" accent={theme.teal.solid} padding={12}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="bulb-outline" size={16} color={theme.teal.solid} />
              <Text style={{ color: theme.textStrong, fontSize: 13, fontWeight: "700", flex: 1 }} numberOfLines={2}>
                {insightLine}
              </Text>
            </View>
          </ShadowCard>
        )}

        {/* ── Intraday chart ──────────────────────────────────────────────── */}
        <ShadowCard size="card" accent={theme.red.sub} padding={16}>
          <View style={s.rowBetween}>
            <Text style={[s.sectionTitle, { color: theme.textStrong }]}>Heart Rate</Text>
            {peak !== null && (
              <Text style={{ color: theme.red.sub, fontSize: 12 }}>peak {peak} bpm</Text>
            )}
          </View>

          <View style={s.rangeRow}>
            {RANGE_OPTIONS.map((hrs) => (
              <Pressable
                key={hrs}
                onPress={() => setRangeHours(hrs)}
                style={[s.rangeBtn, {
                  backgroundColor: rangeHours === hrs ? theme.red.sub : theme.card,
                  borderColor: ink,
                }]}
              >
                <Text style={{ color: rangeHours === hrs ? "#fff" : theme.textSoft, fontSize: 12 }}>
                  {hrs}h
                </Text>
              </Pressable>
            ))}
          </View>

          {loadingChart ? (
            <LoadingIndicator style={{ marginVertical: 30 }} color={theme.red.sub} />
          ) : readings.length === 0 ? (
            <EmptyState slot="empty.heart" title="No readings in this window" subtitle="Sync from Health Connect on the Health tab to see your heart rate here." />
          ) : (
            <Svg width={CHART_W} height={CHART_H} style={{ marginTop: 10 }}>
              {gridVals.map((v) => {
                const gy = PAD_T + usableH - ((v - chartMin) / chartRange) * usableH;
                return (
                  <React.Fragment key={v}>
                    <Line x1={PAD_L} x2={CHART_W} y1={gy} y2={gy}
                      stroke={theme.cardBorder} strokeDasharray="2,3" strokeWidth={0.5} />
                    <SvgText x={PAD_L - 4} y={gy + 4} fontSize={9}
                      fill={theme.textSoft} textAnchor="end">{v}</SvgText>
                  </React.Fragment>
                );
              })}
              {readings.length >= 2 && (() => {
                const ptArr = chartPoints.split(" ");
                const firstX = ptArr[0].split(",")[0];
                const lastX = ptArr[ptArr.length - 1].split(",")[0];
                const baseY = PAD_T + usableH;
                return (
                  <>
                    <Defs>
                      <SvgLinearGradient id="hrDetailFill" x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0" stopColor={theme.red.sub} stopOpacity="0.30" />
                        <Stop offset="1" stopColor={theme.red.sub} stopOpacity="0.02" />
                      </SvgLinearGradient>
                    </Defs>
                    <Polygon
                      points={`${chartPoints} ${lastX},${baseY} ${firstX},${baseY}`}
                      fill="url(#hrDetailFill)"
                    />
                  </>
                );
              })()}
              <Polyline points={chartPoints} fill="none" stroke={theme.red.sub} strokeWidth={2} />
            </Svg>
          )}
        </ShadowCard>

        {/* ── 30-day resting HR trend ─────────────────────────────────────── */}
        <ShadowCard size="card" accent={theme.red.sub} padding={16}>
          <Text style={[s.sectionTitle, { color: theme.textStrong }]}>Resting HR Trend (30d)</Text>

          {/* Week-over-week callout */}
          {thisWeekRest != null && (
            <View style={{ marginBottom: 10 }}>
              <Text style={{ color: theme.textStrong, fontSize: 13, fontWeight: "700" }}>
                Resting HR this week avg{" "}
                <Text style={{ color: theme.red.sub }}>{thisWeekRest}</Text>
                {weekDelta != null && (
                  <Text style={{ color: weekDelta <= 0 ? theme.teal.solid : theme.red.sub }}>
                    {" · "}{weekDelta <= 0 ? "↓" : "↑"}{Math.abs(weekDelta)} vs last week
                  </Text>
                )}
              </Text>
            </View>
          )}

          {loadingStats ? (
            <LoadingIndicator color={theme.red.sub} style={{ marginVertical: 20 }} />
          ) : trend.length === 0 ? (
            <EmptyState slot="empty.trend" title="No 30-day data yet" subtitle="Sync more readings to see your resting HR trend." />
          ) : (
            <>
              <Svg width={CHART_W} height={TREND_H} style={{ marginTop: 4 }}>
                {/* Horizontal grid */}
                {[trendMin + Math.round(trendRange * 0.25), trendMin + Math.round(trendRange * 0.5), trendMin + Math.round(trendRange * 0.75)].map((v) => {
                  const gy = TREND_PAD_T + trendInnerH - ((v - trendMin) / trendRange) * trendInnerH;
                  return (
                    <React.Fragment key={v}>
                      <Line x1={TREND_PAD_L} x2={CHART_W} y1={gy} y2={gy}
                        stroke={theme.cardBorder} strokeDasharray="2,3" strokeWidth={0.5} />
                      <SvgText x={TREND_PAD_L - 4} y={gy + 3} fontSize={8}
                        fill={theme.textSoft} textAnchor="end">{v}</SvgText>
                    </React.Fragment>
                  );
                })}
                {/* Resting HR dots */}
                {trend.map((r, i) => {
                  const x = TREND_PAD_L + (i / Math.max(trend.length - 1, 1)) * trendInnerW;
                  const y = TREND_PAD_T + trendInnerH - ((r.resting_bpm - trendMin) / trendRange) * trendInnerH;
                  return <Circle key={r.date} cx={x} cy={y} r={2.5} fill={theme.red.sub} opacity={0.5} />;
                })}
                {/* Resting HR line */}
                {trend.length >= 2 && (
                  <Polyline points={trendLinePoints} fill="none" stroke={theme.red.sub} strokeWidth={1.5} opacity={0.6} />
                )}
                {/* 7-day rolling avg line */}
                {rollingLinePoints.length >= 2 && (
                  <Polyline points={rollingLinePoints.join(" ")} fill="none" stroke={theme.red.sub} strokeWidth={2.5} />
                )}
                {/* X labels: first, mid, last */}
                {trend.length > 0 && (
                  <>
                    <SvgText x={TREND_PAD_L} y={TREND_H - 4} fontSize={8} fill={theme.textSoft} textAnchor="start">
                      {shortDate(trend[0].date)}
                    </SvgText>
                    <SvgText x={TREND_PAD_L + trendInnerW / 2} y={TREND_H - 4} fontSize={8} fill={theme.textSoft} textAnchor="middle">
                      {shortDate(trend[Math.floor(trend.length / 2)]?.date ?? trend[0].date)}
                    </SvgText>
                    <SvgText x={TREND_PAD_L + trendInnerW} y={TREND_H - 4} fontSize={8} fill={theme.textSoft} textAnchor="end">
                      {shortDate(trend[trend.length - 1].date)}
                    </SvgText>
                  </>
                )}
              </Svg>
              <View style={{ flexDirection: "row", gap: 16, marginTop: 4 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <View style={{ width: 16, height: 2, backgroundColor: theme.red.sub, opacity: 0.5 }} />
                  <Text style={{ color: theme.textSoft, fontSize: 10 }}>Daily resting</Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <View style={{ width: 16, height: 2.5, backgroundColor: theme.red.sub }} />
                  <Text style={{ color: theme.textSoft, fontSize: 10 }}>7-day rolling avg</Text>
                </View>
              </View>
            </>
          )}
        </ShadowCard>

        {/* ── Heart rate zones ────────────────────────────────────────────── */}
        <ShadowCard size="card" accent={theme.red.sub} padding={16}>
          <View style={s.rowBetween}>
            <Text style={[s.sectionTitle, { color: theme.textStrong }]}>Zones Today</Text>
            {zones && (
              <Text style={{ color: theme.textSoft, fontSize: 11 }}>
                max HR {zones.max_hr}{zones.max_hr_estimated ? " (est.)" : ""}
              </Text>
            )}
          </View>

          {loadingStats ? (
            <LoadingIndicator color={theme.red.sub} style={{ marginVertical: 16 }} />
          ) : !zones || zones.total === 0 ? (
            <EmptyState slot="empty.heart" title="No readings today" subtitle="Zones appear once today's readings are synced." />
          ) : (
            <View style={{ gap: 8, marginTop: 4 }}>
              {ZONE_CONFIG.map(({ key, label, color }) => {
                const count = zones[key];
                const pct = zoneTotalCount > 0 ? count / zoneTotalCount : 0;
                const rangeStr =
                  key === "rest" ? `< ${zones.zone1_max} bpm`
                  : key === "light" ? `${zones.zone1_max}–${zones.zone2_max} bpm`
                  : key === "moderate" ? `${zones.zone2_max}–${zones.zone3_max} bpm`
                  : `> ${zones.zone3_max} bpm`;
                return (
                  <View key={key}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 3 }}>
                      <Text style={{ color: theme.textStrong, fontSize: 12, fontWeight: "700" }}>
                        {label} <Text style={{ color: theme.textSoft, fontWeight: "400" }}>{rangeStr}</Text>
                      </Text>
                      <Text style={{ color: theme.textSoft, fontSize: 12 }}>{Math.round(pct * 100)}%</Text>
                    </View>
                    <View style={{ height: 8, backgroundColor: theme.cardBorder, borderRadius: 4, overflow: "hidden" }}>
                      <View style={{
                        height: 8,
                        width: (`${Math.round(pct * 100)}%` as `${number}%`),
                        backgroundColor: color,
                        borderRadius: 4,
                      }} />
                    </View>
                  </View>
                );
              })}
              <Text style={{ color: theme.textSoft, fontSize: 10, marginTop: 4 }}>
                {zoneTotalCount} readings today
              </Text>
            </View>
          )}
        </ShadowCard>

        {/* ── 7-day history table ─────────────────────────────────────────── */}
        <ShadowCard size="card" accent={theme.red.sub} padding={16}>
          <Text style={[s.sectionTitle, { color: theme.textStrong }]}>7-Day History</Text>

          {loadingDaily ? (
            <LoadingIndicator color={theme.red.sub} style={{ marginVertical: 16 }} />
          ) : dailyRows.length === 0 ? (
            <EmptyState slot="empty.trend" title="No history yet" subtitle="Daily resting and average rates will appear here as you sync." />
          ) : (
            <>
              <View style={[s.tableRow, { paddingBottom: 4 }]}>
                <Text style={[s.colDate, { color: theme.textSoft }]}>Date</Text>
                <Text style={[s.colVal, { color: theme.textSoft }]}>Rest</Text>
                <Text style={[s.colVal, { color: theme.textSoft }]}>Avg</Text>
                <Text style={[s.colVal, { color: theme.textSoft }]}>Peak</Text>
                <Text style={[s.colCount, { color: theme.textSoft }]}>Pts</Text>
              </View>

              {dailyRows.map((row) => {
                const isToday = row.date === new Date().toISOString().slice(0, 10);
                return (
                  <View
                    key={row.date}
                    style={[s.tableRow, { borderTopWidth: 0.5, borderTopColor: theme.cardBorder, paddingVertical: 9 }]}
                  >
                    <View style={s.colDate}>
                      <Text style={{ color: isToday ? theme.red.sub : theme.textStrong, fontSize: 13, fontWeight: "500" }}>
                        {dayLabel(row.date)}
                      </Text>
                      <Text style={{ color: theme.textSoft, fontSize: 11 }}>{shortDate(row.date)}</Text>
                    </View>
                    <Text style={[s.colVal, { color: theme.red.sub, fontWeight: "600" }]}>{fmtBpm(row.resting_bpm)}</Text>
                    <Text style={[s.colVal, { color: theme.textStrong }]}>{fmtBpm(row.avg_bpm)}</Text>
                    <Text style={[s.colVal, { color: theme.textStrong }]}>{fmtBpm(row.peak_bpm)}</Text>
                    <Text style={[s.colCount, { color: theme.textSoft }]}>{row.reading_count}</Text>
                  </View>
                );
              })}

              <Text style={[s.footNote, { color: theme.textSoft }]}>
                Resting = 5th percentile · Avg = mean · Peak = max
              </Text>
            </>
          )}
        </ShadowCard>

      </ScrollView>
    </View>
  );
}

function makeStyles(ink: string, card: string) {
  const shadow = {
    shadowColor: "rgba(60,40,20,0.1)",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08 as const,
    shadowRadius: 6,
    elevation: 3,
  };
  return StyleSheet.create({
    content: { padding: 16, gap: 12, paddingBottom: 40 },
    sectionTitle: { fontSize: 16, fontWeight: "900", letterSpacing: -0.5, marginBottom: 6 },
    rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 2 },

    statsRow: { flexDirection: "row", gap: 8 },
    stat: { flex: 1 },
    statVal: { fontSize: 20, fontWeight: "900" },
    statLbl: { fontSize: 11, marginTop: 2 },
    subNote: { fontSize: 11, marginTop: 8 },

    rangeRow: { flexDirection: "row", gap: 6, marginBottom: 4 },
    rangeBtn: {
      borderWidth: 2,
      borderRadius: 12,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },

    tableRow: { flexDirection: "row", alignItems: "center" },
    colDate: { width: 72 },
    colVal: { flex: 1, textAlign: "right", fontSize: 13 },
    colCount: { width: 36, textAlign: "right", fontSize: 12 },
    footNote: { fontSize: 10, marginTop: 10 },
  });
}
