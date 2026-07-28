import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  PanResponder,
  ScrollView,
  View,
  Text,
  Pressable,
  StyleSheet,
  Dimensions,
} from "react-native";
import { LoadingIndicator } from "../components/LoadingIndicator";
import Svg, { Circle, Line, Rect, Text as SvgText } from "react-native-svg";
import { useTheme } from "../theme/ThemeContext";
import { ShadowCard } from "../components/ShadowCard";
import { api } from "../api/client";
import { useFocusEffect } from "@react-navigation/native";
import { TooltipBubble } from "../components/TooltipBubble";
import { hasSeenTooltip, markTooltipSeen } from "../utils/tooltipSeen";
import { DefinedTerm } from "../components/DefinedTerm";


const SCREEN_W = Dimensions.get("window").width;
// 16 scroll padding × 2 + 16 card padding × 2
const CHART_W = SCREEN_W - 64;
const CHART_H = 100;

// ── Math ──────────────────────────────────────────────────────────────────────

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 4) return NaN;
  const mx = xs.reduce((a, b) => a + b) / n;
  const my = ys.reduce((a, b) => a + b) / n;
  const num = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0);
  const dx = Math.sqrt(xs.reduce((s, x) => s + (x - mx) ** 2, 0));
  const dy = Math.sqrt(ys.reduce((s, y) => s + (y - my) ** 2, 0));
  if (dx === 0 || dy === 0) return NaN;
  return num / (dx * dy);
}

function linReg(xs: number[], ys: number[]) {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b) / n;
  const my = ys.reduce((a, b) => a + b) / n;
  const slope =
    xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) /
    (xs.reduce((s, x) => s + (x - mx) ** 2, 0) || 1);
  return { slope, intercept: my - slope * mx };
}

// Splits xs by median, returns avg of paired ys above/below median
function splitAvg(xs: number[], ys: number[]): [number | null, number | null] {
  const sorted = [...xs].sort((a, b) => a - b);
  const med = sorted[Math.floor(sorted.length / 2)];
  const avgFn = (arr: number[]) => arr.reduce((a, b) => a + b) / arr.length;
  const hi = ys.filter((_, i) => xs[i] >= med);
  const lo = ys.filter((_, i) => xs[i] < med);
  return [hi.length ? avgFn(hi) : null, lo.length ? avgFn(lo) : null];
}

// ── Scatter plot ──────────────────────────────────────────────────────────────

function ScatterPlot({
  xs, ys, dotColor, lineColor, xLabel, yLabel,
}: { xs: number[]; ys: number[]; dotColor: string; lineColor: string; xLabel?: string; yLabel?: string }) {
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yMin = Math.min(...ys), yMax = Math.max(...ys);
  if (xMax - xMin < 0.001 || yMax - yMin < 0.001) return null;

  const PAD = 8;
  const W = CHART_W - PAD * 2;
  const H = CHART_H - PAD * 2;
  const px = (v: number) => PAD + ((v - xMin) / (xMax - xMin)) * W;
  const py = (v: number) => PAD + (1 - (v - yMin) / (yMax - yMin)) * H;

  const { slope, intercept } = linReg(xs, ys);
  const clamp = (v: number) => Math.max(PAD, Math.min(PAD + H, v));
  const lx1 = PAD, ly1 = clamp(py(slope * xMin + intercept));
  const lx2 = PAD + W, ly2 = clamp(py(slope * xMax + intercept));

  const [scrub, setScrub] = useState<{ cx: number; xv: number; yv: number } | null>(null);
  const viewRef = useRef<View>(null);

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => handleScrub(e.nativeEvent.locationX),
    onPanResponderMove: (e) => handleScrub(e.nativeEvent.locationX),
    onPanResponderRelease: () => setScrub(null),
    onPanResponderTerminate: () => setScrub(null),
  })).current;

  function handleScrub(touchX: number) {
    const clampedX = Math.max(PAD, Math.min(PAD + W, touchX));
    const xVal = xMin + ((clampedX - PAD) / W) * (xMax - xMin);
    let closest = 0;
    let minDist = Infinity;
    for (let i = 0; i < xs.length; i++) {
      const d = Math.abs(xs[i] - xVal);
      if (d < minDist) { minDist = d; closest = i; }
    }
    setScrub({ cx: px(xs[closest]), xv: xs[closest], yv: ys[closest] });
  }

  const labelY = scrub ? Math.max(14, py(scrub.yv) - 6) : 0;

  return (
    <View
      ref={viewRef}
      accessible={true}
      accessibilityRole="image"
      accessibilityLabel={`Scatter chart showing ${xs.length} data points.`}
      {...panResponder.panHandlers}
    >
      <Svg width={CHART_W} height={CHART_H}>
        <Line x1={lx1} y1={ly1} x2={lx2} y2={ly2} stroke={lineColor} strokeWidth={1.5} strokeDasharray="5,4" opacity={0.45} />
        {xs.map((x, i) => (
          <Circle key={i} cx={px(x)} cy={py(ys[i])} r={4} fill={dotColor} opacity={0.72} />
        ))}
        {scrub && (
          <>
            <Line x1={scrub.cx} y1={PAD} x2={scrub.cx} y2={PAD + H} stroke={dotColor} strokeWidth={1.5} opacity={0.6} strokeDasharray="3,3" />
            <Circle cx={scrub.cx} cy={py(scrub.yv)} r={6} fill={dotColor} opacity={1} />
            <Rect
              x={Math.min(scrub.cx + 6, CHART_W - 86)}
              y={labelY - 12}
              width={80}
              height={22}
              rx={5}
              fill={dotColor}
              opacity={0.9}
            />
            <SvgText
              x={Math.min(scrub.cx + 10, CHART_W - 82)}
              y={labelY + 3}
              fontSize={10}
              fill="#fff"
              fontWeight="700"
            >
              {scrub.xv.toFixed(1)} → {scrub.yv.toFixed(1)}
            </SvgText>
          </>
        )}
      </Svg>
    </View>
  );
}

// ── Correlation card ──────────────────────────────────────────────────────────

function corrStrength(r: number): string {
  if (isNaN(r)) return "–";
  const a = Math.abs(r);
  const sign = r > 0 ? "positive" : "negative";
  if (a >= 0.6) return `Strong ${sign}`;
  if (a >= 0.35) return `Moderate ${sign}`;
  if (a >= 0.15) return `Weak ${sign}`;
  return "No clear link";
}

function badgeColors(r: number, theme: any): { bg: string; fg: string } {
  if (isNaN(r) || Math.abs(r) < 0.15)
    return { bg: theme.page, fg: theme.textSoft };
  if (r > 0)
    return Math.abs(r) >= 0.6
      ? { bg: theme.teal.bg, fg: theme.teal.fg }
      : { bg: theme.blue.bg, fg: theme.blue.fg };
  return Math.abs(r) >= 0.6
    ? { bg: theme.berry.bg, fg: theme.berry.fg }
    : { bg: theme.amber.bg, fg: theme.amber.fg };
}

type CardProps = {
  title: string;
  xLabel: string;
  yLabel: string;
  xs: number[];
  ys: number[];
  insight: string;
  dotColor: string;
  lineColor: string;
  theme: any;
};

function CorrCard({ title, xLabel, yLabel, xs, ys, insight, dotColor, lineColor, theme }: CardProps) {
  const s = useMemo(() => makeStyles(theme.ink, theme.card), [theme.ink, theme.card]);
  // Filter out any NaN / null that slipped through
  const clean: [number, number][] = [];
  for (let i = 0; i < xs.length; i++) {
    if (!isNaN(xs[i]) && !isNaN(ys[i])) clean.push([xs[i], ys[i]]);
  }
  const cxs = clean.map(p => p[0]);
  const cys = clean.map(p => p[1]);
  const r = pearson(cxs, cys);
  const badge = badgeColors(r, theme);

  return (
    <ShadowCard size="card" accent={dotColor}>
      <View style={s.cardHead}>
        <Text style={[s.cardTitle, { color: theme.textStrong }]}>{title}</Text>
        {!isNaN(r) && (
          <DefinedTerm term="pearson_r">
            <View style={[s.badge, { backgroundColor: badge.bg }]}>
              <Text style={[s.badgeTxt, { color: badge.fg }]}>
                {(r >= 0 ? "+" : "") + r.toFixed(2)}{"  "}{corrStrength(r)}
              </Text>
            </View>
          </DefinedTerm>
        )}
      </View>

      {clean.length < 5 ? (
        <Text style={[s.noData, { color: theme.textSoft }]}>
          Not enough data yet — keep logging to reveal patterns.
        </Text>
      ) : (
        <>
          <View style={s.axisRow}>
            <Text style={[s.axisLbl, { color: theme.textSoft }]}>{xLabel} →</Text>
            <Text style={[s.axisLbl, { color: theme.textSoft }]}>↑ {yLabel}</Text>
          </View>
          <ScatterPlot xs={cxs} ys={cys} dotColor={dotColor} lineColor={lineColor} />
          <Text style={[s.insight, { color: theme.textSoft }]}>{insight}</Text>
        </>
      )}
    </ShadowCard>
  );
}

// ── Insight text helpers ──────────────────────────────────────────────────────

function insightMood(xs: number[], ys: number[], hiLabel: string, loLabel: string): string {
  const [hi, lo] = splitAvg(xs, ys);
  if (hi == null || lo == null) return "Keep logging to reveal patterns.";
  return `${hiLabel}: mood avg ${hi.toFixed(1)} vs ${lo.toFixed(1)} on ${loLabel}.`;
}

function insightMetric(xs: number[], ys: number[], hiLabel: string, loLabel: string, yName: string): string {
  const [hi, lo] = splitAvg(xs, ys);
  if (hi == null || lo == null) return "Keep logging to reveal patterns.";
  return `${yName}: ${hi.toFixed(0)} on ${hiLabel} vs ${lo.toFixed(0)} on ${loLabel}.`;
}

// ── Main screen ───────────────────────────────────────────────────────────────

type DayRow = {
  date: string;
  avg_mood: number | null;
  sleep_hours: number;
  total_spent: number;
  avg_mg_dl: number | null;
  caffeine_mg: number;
  standard_drinks: number;
  steps: number;
  exercise_minutes: number;
};

interface CtxObs { key: string; label: string; observation: string; sample_days: number }

const CTX_KEYS: Array<{ key: string; label: string }> = [
  { key: "energy",         label: "Energy" },
  { key: "stress",         label: "Stress" },
  { key: "social_battery", label: "Social Battery" },
];

type MetricKey = keyof Omit<DayRow, "date" | "avg_mood"> | "avg_mood";

const METRIC_OPTIONS: Array<{ key: MetricKey; label: string; unit: string; color: (t: any) => string }> = [
  { key: "avg_mood",         label: "Mood",     unit: "1–5",     color: t => t.violet?.sub  ?? t.purple.sub },
  { key: "sleep_hours",      label: "Sleep",    unit: "hrs",     color: t => t.amber.sub },
  { key: "steps",            label: "Steps",    unit: "steps",   color: t => t.teal.sub },
  { key: "exercise_minutes", label: "Exercise", unit: "min",     color: t => t.coral.sub },
  { key: "total_spent",      label: "Spending", unit: "$",       color: t => t.purple.sub },
  { key: "avg_mg_dl",        label: "Glucose",  unit: "mg/dL",  color: t => t.berry?.sub   ?? t.coral.sub },
  { key: "caffeine_mg",      label: "Caffeine", unit: "mg",      color: t => t.coral.sub },
  { key: "standard_drinks",  label: "Alcohol",  unit: "drinks",  color: t => t.amber.sub },
];

function extractMetric(rows: DayRow[], key: MetricKey): (number | null)[] {
  return rows.map(r => {
    const v = r[key as keyof DayRow];
    if (v === null || v === undefined) return null;
    const n = Number(v);
    return isNaN(n) ? null : n;
  });
}

export function TrendsScreen() {
  const { theme } = useTheme();
  const ink = theme.ink;
  const card = theme.card;
  const s = useMemo(() => makeStyles(ink, card), [ink, card]);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<DayRow[]>([]);
  const [showTooltip, setShowTooltip] = useState(false);
  const [ctxObs, setCtxObs] = useState<CtxObs[]>([]);
  const [customX, setCustomX] = useState<MetricKey>("steps");
  const [customY, setCustomY] = useState<MetricKey>("avg_mood");

  useFocusEffect(
    useCallback(() => {
      hasSeenTooltip("trends").then(seen => {
        if (!seen) {
          setShowTooltip(true);
          markTooltipSeen("trends");
        }
      });
    }, [])
  );

  const load = useCallback(async (n: number) => {
    setLoading(true);
    try {
      const end = new Date().toISOString().slice(0, 10);
      const start = new Date(Date.now() - (n - 1) * 86400000).toISOString().slice(0, 10);
      const [moodData, glucoseData, substanceData, ...ctxResults] = await Promise.all([
        api.weeklyMoodSummary(n),
        api.searchGlucose({ start, end, threshold: 0 }).catch(() => [] as any[]),
        api.substancesSummary(start, end).catch(() => [] as any[]),
        ...CTX_KEYS.map(({ key }) =>
          api.contextCorrelation(key, "mood", n).catch(() => null)
        ),
      ]);

      const glucoseByDate = new Map<string, number>();
      if (Array.isArray(glucoseData)) {
        for (const g of glucoseData) glucoseByDate.set(g.date?.slice(0, 10), Number(g.avg_mg_dl));
      }

      const caffeineByDate = new Map<string, number>();
      const drinksByDate = new Map<string, number>();
      if (Array.isArray(substanceData)) {
        for (const s of substanceData) {
          caffeineByDate.set(s.date?.slice(0, 10), Number(s.caffeine_mg));
          drinksByDate.set(s.date?.slice(0, 10), Number(s.standard_drinks));
        }
      }

      setRows(
        Array.isArray(moodData)
          ? moodData.map((r: any) => ({
              date: r.date,
              avg_mood: r.avg_mood !== null ? Number(r.avg_mood) : null,
              sleep_hours: Number(r.sleep_hours),
              total_spent: Number(r.total_spent),
              avg_mg_dl: glucoseByDate.get(r.date?.slice(0, 10)) ?? null,
              caffeine_mg: caffeineByDate.get(r.date?.slice(0, 10)) ?? 0,
              standard_drinks: drinksByDate.get(r.date?.slice(0, 10)) ?? 0,
              steps: Number(r.steps ?? 0),
              exercise_minutes: Number(r.exercise_minutes ?? 0),
            }))
          : []
      );

      // Context correlation observations (only show keys with ≥3 days of data)
      const obs: CtxObs[] = [];
      ctxResults.forEach((res, i) => {
        if (res && typeof res.observation === "string" && (res.sample_days ?? 0) >= 3) {
          obs.push({ key: CTX_KEYS[i].key, label: CTX_KEYS[i].label, observation: res.observation, sample_days: res.sample_days });
        }
      });
      setCtxObs(obs);
    } catch (e) {
      console.error("TrendsScreen load error", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(days); }, [days, load]);

  // Pre-filter pairs for each correlation
  const smRows = rows.filter(r => r.avg_mood !== null && r.sleep_hours > 0);
  const spRows = rows.filter(r => r.avg_mood !== null);
  const gmRows = rows.filter(r => r.avg_mood !== null && r.avg_mg_dl !== null);
  const sgRows = rows.filter(r => r.avg_mg_dl !== null && r.sleep_hours > 0);
  // Substance correlations — only include days that actually have logged data
  const cgRows = rows.filter(r => r.caffeine_mg > 0 && r.avg_mg_dl !== null);
  const asRows = rows.filter(r => r.standard_drinks > 0 && r.sleep_hours > 0);
  const cmRows = rows.filter(r => r.caffeine_mg > 0 && r.avg_mood !== null);
  // Activity correlations — only include days that actually have data
  const stmRows = rows.filter(r => r.steps > 0 && r.avg_mood !== null);
  const exmRows = rows.filter(r => r.exercise_minutes > 0 && r.avg_mood !== null);
  const stsRows = rows.filter(r => r.steps > 0 && r.sleep_hours > 0);
  const exsRows = rows.filter(r => r.exercise_minutes > 0 && r.sleep_hours > 0);

  const smXs = smRows.map(r => r.sleep_hours),         smYs = smRows.map(r => r.avg_mood!);
  const spXs = spRows.map(r => r.total_spent),          spYs = spRows.map(r => r.avg_mood!);
  const gmXs = gmRows.map(r => r.avg_mg_dl!),           gmYs = gmRows.map(r => r.avg_mood!);
  const sgXs = sgRows.map(r => r.sleep_hours),          sgYs = sgRows.map(r => r.avg_mg_dl!);
  const cgXs = cgRows.map(r => r.caffeine_mg),          cgYs = cgRows.map(r => r.avg_mg_dl!);
  const asXs = asRows.map(r => r.standard_drinks),      asYs = asRows.map(r => r.sleep_hours);
  const cmXs = cmRows.map(r => r.caffeine_mg),          cmYs = cmRows.map(r => r.avg_mood!);
  const stmXs = stmRows.map(r => r.steps),              stmYs = stmRows.map(r => r.avg_mood!);
  const exmXs = exmRows.map(r => r.exercise_minutes),   exmYs = exmRows.map(r => r.avg_mood!);
  const stsXs = stsRows.map(r => r.steps),              stsYs = stsRows.map(r => r.sleep_hours);
  const exsXs = exsRows.map(r => r.exercise_minutes),   exsYs = exsRows.map(r => r.sleep_hours);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.page }}
      contentContainerStyle={s.page}
    >
      {showTooltip && (
        <TooltipBubble
          message="Pick any two things to compare — sleep, mood, glucose, spending — and see how they move together over your logged days. Tap a chart to explore."
          onDismiss={() => setShowTooltip(false)}
        />
      )}
      {/* Period selector */}
      <View style={s.periodRow}>
        {[14, 30, 60].map(n => (
          <Pressable
            key={n}
            onPress={() => setDays(n)}
            style={[
              s.chip,
              {
                backgroundColor: days === n ? theme.textStrong : theme.card,
                borderColor: theme.ink,
              },
            ]}
          >
            <Text style={{ color: days === n ? theme.page : theme.textSoft, fontSize: 13, fontWeight: days === n ? "600" : "400" }}>
              {n}d
            </Text>
          </Pressable>
        ))}
        <Text style={[s.periodNote, { color: theme.textSoft }]}>window</Text>
      </View>

      {loading ? (
        <LoadingIndicator color={theme.textSoft} style={{ marginTop: 48 }} />
      ) : rows.length === 0 ? (
        <View style={s.empty}>
          <Text style={[s.emptyTxt, { color: theme.textSoft }]}>
            Log mood, sleep, and meals for at least a week to see your personal health patterns here.
          </Text>
        </View>
      ) : (
        <>
          <CorrCard
            title="Sleep ↔ Mood"
            xLabel="Sleep hours"
            yLabel="Mood"
            xs={smXs}
            ys={smYs}
            dotColor={theme.amber.sub}
            lineColor={theme.amber.sub}
            insight={insightMood(smXs, smYs, "More sleep", "less sleep")}
            theme={theme}
          />

          <CorrCard
            title="Spending ↔ Mood"
            xLabel="Daily spend ($)"
            yLabel="Mood"
            xs={spXs}
            ys={spYs}
            dotColor={theme.purple.sub}
            lineColor={theme.purple.sub}
            insight={insightMood(spXs, spYs, "Higher-spend days", "lower-spend days")}
            theme={theme}
          />

          {gmRows.length >= 3 && (
            <CorrCard
              title="Glucose ↔ Mood"
              xLabel="Avg glucose (mg/dL)"
              yLabel="Mood"
              xs={gmXs}
              ys={gmYs}
              dotColor={theme.berry.sub}
              lineColor={theme.berry.sub}
              insight={insightMood(gmXs, gmYs, "Higher-glucose days", "lower-glucose days")}
              theme={theme}
            />
          )}

          {sgRows.length >= 3 && (
            <CorrCard
              title="Sleep ↔ Glucose"
              xLabel="Sleep hours"
              yLabel="Avg glucose"
              xs={sgXs}
              ys={sgYs}
              dotColor={theme.teal.sub}
              lineColor={theme.teal.sub}
              insight={insightMetric(sgXs, sgYs, "more sleep", "less sleep", "Avg glucose")}
              theme={theme}
            />
          )}

          {cgRows.length >= 3 && (
            <CorrCard
              title="Caffeine ↔ Glucose"
              xLabel="Caffeine (mg)"
              yLabel="Avg glucose"
              xs={cgXs}
              ys={cgYs}
              dotColor={theme.coral.sub}
              lineColor={theme.coral.sub}
              insight={insightMetric(cgXs, cgYs, "higher-caffeine days", "lower-caffeine days", "Avg glucose")}
              theme={theme}
            />
          )}

          {asRows.length >= 3 && (
            <CorrCard
              title="Alcohol ↔ Sleep"
              xLabel="Standard drinks"
              yLabel="Sleep hours"
              xs={asXs}
              ys={asYs}
              dotColor={theme.purple.solid}
              lineColor={theme.purple.solid}
              insight={insightMetric(asXs, asYs, "drinking days", "non-drinking days", "Sleep hours")}
              theme={theme}
            />
          )}

          {cmRows.length >= 3 && (
            <CorrCard
              title="Caffeine ↔ Mood"
              xLabel="Caffeine (mg)"
              yLabel="Mood"
              xs={cmXs}
              ys={cmYs}
              dotColor={theme.coral.sub}
              lineColor={theme.coral.sub}
              insight={insightMood(cmXs, cmYs, "Higher-caffeine days", "lower-caffeine days")}
              theme={theme}
            />
          )}

          {stmRows.length >= 3 && (
            <CorrCard
              title="Steps ↔ Mood"
              xLabel="Daily steps"
              yLabel="Mood"
              xs={stmXs}
              ys={stmYs}
              dotColor={theme.teal.sub}
              lineColor={theme.teal.sub}
              insight={insightMood(stmXs, stmYs, "Higher-step days", "lower-step days")}
              theme={theme}
            />
          )}

          {exmRows.length >= 3 && (
            <CorrCard
              title="Exercise ↔ Mood"
              xLabel="Exercise (min)"
              yLabel="Mood"
              xs={exmXs}
              ys={exmYs}
              dotColor={theme.coral.sub}
              lineColor={theme.coral.sub}
              insight={insightMood(exmXs, exmYs, "Days you exercised", "rest days")}
              theme={theme}
            />
          )}

          {stsRows.length >= 3 && (
            <CorrCard
              title="Steps ↔ Sleep"
              xLabel="Daily steps"
              yLabel="Sleep hours"
              xs={stsXs}
              ys={stsYs}
              dotColor={theme.amber.sub}
              lineColor={theme.amber.sub}
              insight={insightMetric(stsXs, stsYs, "higher-step days", "lower-step days", "Sleep")}
              theme={theme}
            />
          )}

          {exsRows.length >= 3 && (
            <CorrCard
              title="Exercise ↔ Sleep"
              xLabel="Exercise (min)"
              yLabel="Sleep hours"
              xs={exsXs}
              ys={exsYs}
              dotColor={theme.purple.sub}
              lineColor={theme.purple.sub}
              insight={insightMetric(exsXs, exsYs, "days you exercised", "rest days", "Sleep")}
              theme={theme}
            />
          )}

          {ctxObs.length > 0 && (
            <ShadowCard size="card" accent={theme.amber.solid}>
              <Text style={[s.cardTitle, { color: theme.textStrong }]}>Context Patterns</Text>
              <Text style={[s.cardSubtitle, { color: theme.textSoft }]}>
                Based on energy, stress, and social battery you logged during check-ins.
              </Text>
              {ctxObs.map(({ key, label, observation, sample_days }) => (
                <View key={key} style={[s.ctxBlock, { borderTopColor: theme.cardBorder }]}>
                  <Text style={[s.ctxKeyLabel, { color: theme.textStrong }]}>{label}</Text>
                  <Text style={[s.ctxObsText, { color: theme.textSoft }]}>
                    {observation}
                  </Text>
                  <Text style={[s.ctxSampleNote, { color: theme.textSoft }]}>
                    {sample_days} days with data
                  </Text>
                </View>
              ))}
            </ShadowCard>
          )}

          {(() => {
            const xOpt = METRIC_OPTIONS.find(m => m.key === customX)!;
            const yOpt = METRIC_OPTIONS.find(m => m.key === customY)!;
            const dotColor = xOpt.color(theme);
            const rawX = extractMetric(rows, customX);
            const rawY = extractMetric(rows, customY);
            const pairs: [number, number][] = [];
            for (let i = 0; i < rows.length; i++) {
              const x = rawX[i], y = rawY[i];
              if (x !== null && x !== 0 && y !== null && y !== 0) pairs.push([x, y]);
            }
            const cxs = pairs.map(p => p[0]);
            const cys = pairs.map(p => p[1]);
            const sameMetric = customX === customY;
            return (
              <ShadowCard size="card" accent={dotColor}>
                <Text style={[s.cardTitle, { color: theme.textStrong, marginBottom: 4 }]}>Compare any two</Text>
                <Text style={[s.cardSubtitle, { color: theme.textSoft, marginBottom: 10 }]}>
                  Pick an X and Y axis to build your own scatter plot.
                </Text>

                {(["X", "Y"] as const).map(axis => {
                  const selected = axis === "X" ? customX : customY;
                  const setSelected = axis === "X" ? setCustomX : setCustomY;
                  return (
                    <View key={axis} style={{ marginBottom: 10 }}>
                      <Text style={{ color: theme.textSoft, fontSize: 11, fontWeight: "700", letterSpacing: 0.5, marginBottom: 5 }}>
                        {axis} AXIS
                      </Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -4 }}>
                        <View style={{ flexDirection: "row", gap: 6, paddingHorizontal: 4 }}>
                          {METRIC_OPTIONS.map(opt => {
                            const active = selected === opt.key;
                            return (
                              <Pressable
                                key={opt.key}
                                onPress={() => setSelected(opt.key)}
                                style={{
                                  paddingHorizontal: 12,
                                  paddingVertical: 6,
                                  borderRadius: 20,
                                  borderWidth: 2,
                                  borderColor: active ? opt.color(theme) : theme.cardBorder,
                                  backgroundColor: active ? opt.color(theme) + "22" : theme.page,
                                }}
                              >
                                <Text style={{
                                  color: active ? opt.color(theme) : theme.textSoft,
                                  fontSize: 12,
                                  fontWeight: active ? "800" : "400",
                                }}>
                                  {opt.label}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </ScrollView>
                    </View>
                  );
                })}

                {sameMetric ? (
                  <Text style={[s.noData, { color: theme.textSoft, marginTop: 4 }]}>
                    Pick two different metrics to compare.
                  </Text>
                ) : pairs.length < 5 ? (
                  <Text style={[s.noData, { color: theme.textSoft, marginTop: 4 }]}>
                    Not enough overlapping data yet — keep logging both to reveal patterns.
                  </Text>
                ) : (
                  <>
                    <View style={s.axisRow}>
                      <Text style={[s.axisLbl, { color: theme.textSoft }]}>{xOpt.label} ({xOpt.unit}) →</Text>
                      <Text style={[s.axisLbl, { color: theme.textSoft }]}>↑ {yOpt.label} ({yOpt.unit})</Text>
                    </View>
                    <ScatterPlot xs={cxs} ys={cys} dotColor={dotColor} lineColor={dotColor} />
                    <Text style={[s.insight, { color: theme.textSoft, marginTop: 6 }]}>
                      {insightMetric(cxs, cys, `higher ${xOpt.label.toLowerCase()} days`, `lower ${xOpt.label.toLowerCase()} days`, yOpt.label)}
                    </Text>
                  </>
                )}
              </ShadowCard>
            );
          })()}

          <View style={{ alignItems: "center" }}>
            <Text style={[s.footnote, { color: theme.textSoft }]}>
              Each dot is one day. Dashed line shows the overall trend.{" "}
            </Text>
            <DefinedTerm term="pearson_r" style={{ marginTop: 2 }}>
              <Text style={[s.footnote, { color: theme.textSoft }]}>r values</Text>
            </DefinedTerm>
            <Text style={[s.footnote, { color: theme.textSoft }]}>
              {" "}based on {days}-day window.
            </Text>
          </View>
        </>
      )}
    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function makeStyles(ink: string, card: string) {
  const shadow = {
    shadowColor: "rgba(60,40,20,0.1)",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12 as const,
    shadowRadius: 14,
    elevation: 4,
  };
  return StyleSheet.create({
  page:       { padding: 16, paddingBottom: 32, gap: 14 },
  periodRow:  { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 2,
    shadowColor: "rgba(60,40,20,0.1)", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 2,
  },
  periodNote: { fontSize: 13, marginLeft: 2 },
  card: { borderRadius: 26, borderWidth: 2, padding: 16, gap: 10, backgroundColor: card, ...shadow },
  cardHead:   { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
  cardTitle:  { fontSize: 17, fontWeight: "900", letterSpacing: -0.5, flex: 1 },
  badge:      { borderRadius: 20, borderWidth: 2, borderColor: ink, paddingHorizontal: 10, paddingVertical: 4, flexShrink: 1 },
  badgeTxt:   { fontSize: 11, fontWeight: "700" },
  axisRow:    { flexDirection: "row", justifyContent: "space-between", marginBottom: -4 },
  axisLbl:    { fontSize: 11 },
  insight:    { fontSize: 13, lineHeight: 20 },
  noData:     { fontSize: 13, lineHeight: 20 },
  footnote:   { fontSize: 11, lineHeight: 17, textAlign: "center", marginTop: 4 },
  empty:      { alignItems: "center", paddingVertical: 48 },
  emptyTxt:   { fontSize: 14, textAlign: "center", lineHeight: 22 },
  cardSubtitle: { fontSize: 12, lineHeight: 18 },
  ctxBlock:   { paddingTop: 12, borderTopWidth: 1, gap: 4 },
  ctxKeyLabel: { fontSize: 13, fontWeight: "800" },
  ctxObsText: { fontSize: 13, lineHeight: 20 },
  ctxSampleNote: { fontSize: 11 },
  });
}
