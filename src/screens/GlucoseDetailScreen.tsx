import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Dimensions,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, {
  Defs,
  Line,
  LinearGradient as SvgLinearGradient,
  Polygon,
  Polyline,
  Stop,
  Text as SvgText,
} from "react-native-svg";
import { useTheme } from "../theme/ThemeContext";
import { api } from "../api/client";
import { ShadowCard } from "../components/ShadowCard";
import { CardLoadingOverlay } from "../components/CardLoadingOverlay";
import { LoadingIndicator } from "../components/LoadingIndicator";
import { EmptyState } from "../components/EmptyState";
import { useReduceMotion } from "../hooks/useReduceMotion";
import { ScreenBackground } from "../components/ScreenBackground";

// ─── types ───────────────────────────────────────────────────────────────────
type GlucoseReading = { recorded_at: string; mg_dl: number };

// ─── constants ────────────────────────────────────────────────────────────────
const SCREEN_WIDTH = Dimensions.get("window").width;
const CHART_W = SCREEN_WIDTH - 64;
const CHART_H = 180;
const PAD_L = 36;
const PAD_B = 20;
const PAD_T = 12;

const LOW = 70;
const HIGH = 180;

const TOD_BUCKETS = [
  { key: "overnight", label: "Overnight", startH: 0, endH: 6 },
  { key: "morning", label: "Morning", startH: 6, endH: 12 },
  { key: "afternoon", label: "Afternoon", startH: 12, endH: 18 },
  { key: "evening", label: "Evening", startH: 18, endH: 24 },
];

// ─── helpers ─────────────────────────────────────────────────────────────────
function fmtMg(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "--";
  return String(Math.round(v));
}

function getHour(iso: string): number {
  return new Date(iso).getHours();
}

function computeTir(readings: GlucoseReading[]): number | null {
  if (!readings.length) return null;
  const inRange = readings.filter((r) => {
    const v = Number(r.mg_dl);
    return v >= LOW && v <= HIGH;
  }).length;
  return Math.round((inRange / readings.length) * 100);
}

function computeVariability(readings: GlucoseReading[]): number | null {
  if (readings.length < 2) return null;
  const vals = readings.map((r) => Number(r.mg_dl));
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
  return Math.round(Math.sqrt(variance));
}

// ─── main component ───────────────────────────────────────────────────────────
export function GlucoseDetailScreen() {
  const { theme } = useTheme();
  const accent = (theme as any).berry?.solid ?? theme.red.sub;
  const accentFg = (theme as any).berry?.fg ?? theme.red.sub;
  const reduceMotion = useReduceMotion();
  const s = useMemo(() => makeStyles(theme.ink, theme.card), [theme.ink, theme.card]);

  // 24h chart
  const [readings24h, setReadings24h] = useState<GlucoseReading[]>([]);
  const [loading24h, setLoading24h] = useState(true);

  // 30d data (used for both 7d time-of-day and 30d avg)
  const [readings30d, setReadings30d] = useState<GlucoseReading[]>([]);
  const [loading30d, setLoading30d] = useState(true);

  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load24h = useCallback(async () => {
    setLoading24h(true);
    setLoadError(null);
    try {
      const now = new Date();
      const start = new Date(now.getTime() - 24 * 3600 * 1000);
      const data = await api.glucoseRange(start.toISOString(), now.toISOString());
      setReadings24h(Array.isArray(data) ? data : []);
    } catch (_) {
      setLoadError("Couldn't load glucose data. Check your connection and try again.");
    }
    finally { setLoading24h(false); }
  }, []);

  const load30d = useCallback(async () => {
    setLoading30d(true);
    try {
      const now = new Date();
      const start = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
      const data = await api.glucoseRange(start.toISOString(), now.toISOString());
      setReadings30d(Array.isArray(data) ? data : []);
    } catch (_) {}
    finally { setLoading30d(false); }
  }, []);

  useEffect(() => { load24h(); load30d(); }, [load24h, load30d]);

  async function handleRefresh() {
    setRefreshing(true);
    await Promise.all([load24h(), load30d()]);
    setRefreshing(false);
  }

  // ── 24h chart geometry ───────────────────────────────────────────────────
  const vals24 = readings24h.map((r) => Number(r.mg_dl)).filter((v) => Number.isFinite(v));
  const rawMin = vals24.length ? Math.min(...vals24) : 60;
  const rawMax = vals24.length ? Math.max(...vals24) : 200;
  const padding = Math.max(10, Math.round((rawMax - rawMin) * 0.1));
  const chartMin = Math.max(0, rawMin - padding);
  const chartMax = rawMax + padding;
  const chartRange = chartMax - chartMin || 1;
  const usableW = CHART_W - PAD_L;
  const usableH = CHART_H - PAD_T - PAD_B;

  const now24 = Date.now();
  const windowStart24 = now24 - 24 * 3600 * 1000;
  const windowMs24 = 24 * 3600 * 1000;

  const { chartPoints, gridVals, lowY, highY } = useMemo(() => {
    const pts = readings24h
      .map((r) => {
        const t = new Date(r.recorded_at).getTime();
        const x = PAD_L + ((t - windowStart24) / windowMs24) * usableW;
        const y = PAD_T + usableH - ((Number(r.mg_dl) - chartMin) / chartRange) * usableH;
        return x + "," + y;
      })
      .join(" ");

    const step = chartRange > 150 ? 50 : chartRange > 80 ? 30 : 20;
    const gStart = Math.ceil(chartMin / step) * step;
    const gVals: number[] = [];
    for (let v = gStart; v <= chartMax; v += step) gVals.push(v);

    const lY = PAD_T + usableH - ((LOW - chartMin) / chartRange) * usableH;
    const hY = PAD_T + usableH - ((HIGH - chartMin) / chartRange) * usableH;

    return { chartPoints: pts, gridVals: gVals, lowY: lY, highY: hY };
  }, [readings24h, windowStart24, windowMs24, usableW, usableH, chartMin, chartMax, chartRange]);

  // 24h stats
  const avg24 = vals24.length ? Math.round(vals24.reduce((a, b) => a + b, 0) / vals24.length) : null;
  const min24 = vals24.length ? Math.min(...vals24) : null;
  const max24 = vals24.length ? Math.max(...vals24) : null;
  const tir24 = computeTir(readings24h);

  // ── 7-day time-of-day buckets (readings from last 7 days only) ───────────
  const sevenDaysAgo = now24 - 7 * 24 * 3600 * 1000;
  const readings7d = readings30d.filter((r) => new Date(r.recorded_at).getTime() >= sevenDaysAgo);

  const todBuckets = TOD_BUCKETS.map(({ key, label, startH, endH }) => {
    const bucket = readings7d.filter((r) => {
      const h = getHour(r.recorded_at);
      return h >= startH && h < endH;
    });
    const vals = bucket.map((r) => Number(r.mg_dl)).filter((v) => Number.isFinite(v));
    const avg = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
    return { key, label, avg, count: vals.length };
  });

  const maxTodAvg = Math.max(...todBuckets.map((b) => b.avg ?? 0), 1);

  // ── 30-day summary ───────────────────────────────────────────────────────
  const vals30 = readings30d.map((r) => Number(r.mg_dl)).filter((v) => Number.isFinite(v));
  const avg30 = vals30.length ? Math.round(vals30.reduce((a, b) => a + b, 0) / vals30.length) : null;
  const tir30 = computeTir(readings30d);
  const cv30 = computeVariability(readings30d);

  const loadingAny = loading24h || loading30d;

  if (!loadingAny && loadError) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.page, padding: 16 }}>
        <EmptyState
          slot="empty.warning"
          title="Couldn't load glucose data"
          subtitle="Check your connection and try again."
          action={{ label: "Try again", onPress: () => { load24h(); load30d(); } }}
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.page }}>
      <ScreenBackground />
      <ScrollView
        style={{ flex: 1, backgroundColor: "transparent" }}
        contentContainerStyle={s.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={accent} />
        }
      >
        {/* ── Headline stats card ─────────────────────────────────────────── */}
        <ShadowCard size="card" accent={accent} padding={16}>
          <View style={s.statsRow}>
            <View style={s.stat}>
              <Text style={[s.statVal, { color: accent }]}>{fmtMg(avg24)}</Text>
              <Text style={[s.statLbl, { color: theme.textSoft }]}>Avg (24h)</Text>
            </View>
            <View style={s.stat}>
              <Text style={[s.statVal, { color: theme.textStrong }]}>{fmtMg(min24)}</Text>
              <Text style={[s.statLbl, { color: theme.textSoft }]}>Low</Text>
            </View>
            <View style={s.stat}>
              <Text style={[s.statVal, { color: theme.textStrong }]}>{fmtMg(max24)}</Text>
              <Text style={[s.statLbl, { color: theme.textSoft }]}>High</Text>
            </View>
            <View style={s.stat}>
              <Text style={[s.statVal, { color: tir24 !== null && tir24 >= 70 ? theme.teal.solid : theme.textStrong }]}>
                {tir24 !== null ? tir24 + "%" : "--"}
              </Text>
              <Text style={[s.statLbl, { color: theme.textSoft }]}>TIR</Text>
            </View>
          </View>
          <Text style={[s.subNote, { color: theme.textSoft }]}>24-hour window · mg/dL · TIR = 70–180</Text>
          <CardLoadingOverlay loading={loading24h} size="small" />
        </ShadowCard>

        {/* ── 24h chart ──────────────────────────────────────────────────── */}
        <ShadowCard size="card" accent={accent} padding={16}>
          <Text style={[s.sectionTitle, { color: theme.textStrong }]}>Last 24 Hours</Text>

          {loading24h ? (
            <LoadingIndicator style={{ marginVertical: 30 }} color={accent} />
          ) : readings24h.length === 0 ? (
            <EmptyState slot="empty.glucose" title="No readings in the last 24h" subtitle="Connect Dexcom or add readings manually on the Health tab." />
          ) : (
            <Svg
              width={CHART_W}
              height={CHART_H}
              style={{ marginTop: 10 }}
              accessible
              accessibilityRole="image"
              accessibilityLabel={`Glucose line chart, last 24 hours. ${readings24h.length} readings. Latest ${fmtMg(vals24[vals24.length - 1])} mg/dL. Range ${fmtMg(min24)}–${fmtMg(max24)} mg/dL.`}
            >
              {/* Grid lines */}
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
              {/* Target range band */}
              {lowY > highY && (
                <React.Fragment>
                  <Line x1={PAD_L} x2={CHART_W} y1={lowY} y2={lowY}
                    stroke={theme.teal.solid} strokeDasharray="3,3" strokeWidth={1} opacity={0.5} />
                  <Line x1={PAD_L} x2={CHART_W} y1={highY} y2={highY}
                    stroke={theme.teal.solid} strokeDasharray="3,3" strokeWidth={1} opacity={0.5} />
                </React.Fragment>
              )}
              {/* Gradient fill */}
              {readings24h.length >= 2 && (() => {
                const ptArr = chartPoints.split(" ");
                const firstX = ptArr[0].split(",")[0];
                const lastX = ptArr[ptArr.length - 1].split(",")[0];
                const baseY = PAD_T + usableH;
                return (
                  <>
                    <Defs>
                      <SvgLinearGradient id="glucDetailFill" x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0" stopColor={accent} stopOpacity="0.28" />
                        <Stop offset="1" stopColor={accent} stopOpacity="0.02" />
                      </SvgLinearGradient>
                    </Defs>
                    <Polygon
                      points={`${chartPoints} ${lastX},${baseY} ${firstX},${baseY}`}
                      fill="url(#glucDetailFill)"
                    />
                  </>
                );
              })()}
              <Polyline points={chartPoints} fill="none" stroke={accent} strokeWidth={2} />
            </Svg>
          )}
          {/* Legend */}
          {readings24h.length > 0 && (
            <View style={{ flexDirection: "row", gap: 12, marginTop: 6 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <View style={{ width: 16, height: 1.5, borderStyle: "dashed", borderWidth: 1, borderColor: theme.teal.solid, opacity: 0.7 }} />
                <Text style={{ color: theme.textSoft, fontSize: 10 }}>Target 70–180</Text>
              </View>
            </View>
          )}
        </ShadowCard>

        {/* ── 7-day avg by time of day ────────────────────────────────────── */}
        <ShadowCard size="card" accent={accent} padding={16}>
          <Text style={[s.sectionTitle, { color: theme.textStrong }]}>Avg by Time of Day (7d)</Text>

          {loading30d ? (
            <LoadingIndicator color={accent} style={{ marginVertical: 16 }} />
          ) : readings7d.length === 0 ? (
            <EmptyState slot="empty.clock" title="Not enough data yet" subtitle="7 days of readings needed for time-of-day averages." />
          ) : (
            <View style={{ gap: 10, marginTop: 8 }}>
              {todBuckets.map(({ key, label, avg, count }) => {
                const barPct = avg !== null ? avg / Math.max(maxTodAvg, 1) : 0;
                const inRange = avg !== null && avg >= LOW && avg <= HIGH;
                const barColor = avg === null
                  ? theme.cardBorder
                  : inRange
                    ? theme.teal.solid
                    : accent;
                return (
                  <View key={key}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 3 }}>
                      <Text style={{ color: theme.textStrong, fontSize: 12, fontWeight: "700" }}>
                        {label}{" "}
                        <Text style={{ color: theme.textSoft, fontWeight: "400", fontSize: 11 }}>
                          {key === "overnight" ? "12a–6a"
                            : key === "morning" ? "6a–12p"
                            : key === "afternoon" ? "12p–6p"
                            : "6p–12a"}
                        </Text>
                      </Text>
                      <Text style={{ color: avg !== null ? barColor : theme.textSoft, fontSize: 12, fontWeight: "700" }}>
                        {fmtMg(avg)}{avg !== null ? " mg/dL" : ""}
                        {count > 0 && <Text style={{ color: theme.textSoft, fontWeight: "400", fontSize: 10 }}> ({count})</Text>}
                      </Text>
                    </View>
                    <View style={{ height: 8, backgroundColor: theme.cardBorder, borderRadius: 4, overflow: "hidden" }}>
                      {avg !== null && (
                        <View style={{
                          height: 8,
                          width: (`${Math.round(barPct * 100)}%` as `${number}%`),
                          backgroundColor: barColor,
                          borderRadius: 4,
                        }} />
                      )}
                    </View>
                  </View>
                );
              })}
              <Text style={{ color: theme.textSoft, fontSize: 10, marginTop: 2 }}>
                Teal = in range · Berry = outside range
              </Text>
            </View>
          )}
        </ShadowCard>

        {/* ── 30-day summary ──────────────────────────────────────────────── */}
        <ShadowCard size="card" accent={accent} padding={16}>
          <Text style={[s.sectionTitle, { color: theme.textStrong }]}>30-Day Summary</Text>

          {loading30d ? (
            <LoadingIndicator color={accent} style={{ marginVertical: 16 }} />
          ) : vals30.length === 0 ? (
            <EmptyState slot="empty.trend" title="No 30-day data yet" subtitle="Connect Dexcom or add readings to see your 30-day glucose summary." />
          ) : (
            <View style={{ gap: 12, marginTop: 4 }}>
              <View style={s.statsRow}>
                <View style={s.stat}>
                  <Text style={[s.statVal, { color: accent }]}>{fmtMg(avg30)}</Text>
                  <Text style={[s.statLbl, { color: theme.textSoft }]}>Avg mg/dL</Text>
                </View>
                <View style={s.stat}>
                  <Text style={[s.statVal, { color: tir30 !== null && tir30 >= 70 ? theme.teal.solid : theme.textStrong }]}>
                    {tir30 !== null ? tir30 + "%" : "--"}
                  </Text>
                  <Text style={[s.statLbl, { color: theme.textSoft }]}>Time in Range</Text>
                </View>
                <View style={s.stat}>
                  <Text style={[s.statVal, { color: theme.textStrong }]}>{cv30 !== null ? cv30 : "--"}</Text>
                  <Text style={[s.statLbl, { color: theme.textSoft }]}>Variability (SD)</Text>
                </View>
                <View style={s.stat}>
                  <Text style={[s.statVal, { color: theme.textStrong }]}>{vals30.length}</Text>
                  <Text style={[s.statLbl, { color: theme.textSoft }]}>Readings</Text>
                </View>
              </View>
              {tir30 !== null && (
                <View>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                    <Text style={{ color: theme.textStrong, fontSize: 12, fontWeight: "700" }}>Time in Range</Text>
                    <Text style={{ color: tir30 >= 70 ? theme.teal.solid : accent, fontSize: 12, fontWeight: "700" }}>{tir30}%</Text>
                  </View>
                  <View style={{ height: 12, backgroundColor: theme.cardBorder, borderRadius: 6, overflow: "hidden" }}>
                    <View style={{
                      height: 12,
                      width: (`${tir30}%` as `${number}%`),
                      backgroundColor: tir30 >= 70 ? theme.teal.solid : accent,
                      borderRadius: 6,
                    }} />
                  </View>
                  <Text style={{ color: theme.textSoft, fontSize: 10, marginTop: 4 }}>
                    Target ≥ 70% time in 70–180 mg/dL range
                  </Text>
                </View>
              )}
            </View>
          )}
        </ShadowCard>

      </ScrollView>
    </View>
  );
}

function makeStyles(ink: string, card: string) {
  return StyleSheet.create({
    content: { padding: 16, gap: 12, paddingBottom: 40 },
    sectionTitle: { fontSize: 16, fontWeight: "900", letterSpacing: -0.5, marginBottom: 6 },
    statsRow: { flexDirection: "row", gap: 8 },
    stat: { flex: 1 },
    statVal: { fontSize: 20, fontWeight: "900" },
    statLbl: { fontSize: 11, marginTop: 2 },
    subNote: { fontSize: 11, marginTop: 8 },
  });
}
