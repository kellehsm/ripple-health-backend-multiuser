/**
 * overview/WeeklyReviewCard.tsx
 * The 7-day review card, mood pattern chart, cross-metric insights,
 * and monthly review card.
 * Extracted from OverviewScreen.tsx — no logic changes.
 */
import React, { useRef, useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, Animated } from "react-native";
import Svg, { Rect, Text as SvgText, Polyline } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme } from "../../theme/ThemeContext";
import { onSolid } from "../../theme/colorUtils";
import { ShadowCard } from "../../components/ShadowCard";
import { fmtDayLabel } from "../../utils/dateUtils";
import { weekGlucoseAvg } from "../../utils/glucoseMetrics";
import {
  SkeletonBox,
  CORR_W,
  CORR_H,
  BAR_W,
  STEP,
  type WeeklyDay,
  type WeeklyDigest,
} from "./shared";
import { FONT_SIZES } from "../../theme/tokens";
import { GhostRow } from "../../components/GhostRow";

type MonthlyReviewData = {
  month: string;
  steps: { best_week: { start: string; total: number } | null; worst_week: { start: string; total: number } | null };
  spending: { total: number | null; prev_total: number | null };
  observation: string | null;
};

interface WeeklyReviewProps {
  loading: boolean;
  showRecap: boolean;
  recapDismissed: boolean;
  setRecapDismissed: (v: boolean) => void;
  digest: WeeklyDigest | null;
  glucoseAvg: number | null;
  onShowDigest: () => void;
}

interface MoodPatternProps {
  weeklyData: WeeklyDay[];
  correlation: "sleep" | "spend";
  setCorrelation: (v: "sleep" | "spend") => void;
}

interface CrossMetricProps {
  crossMetricData: {
    exercise: { with_avg: number | null; without_avg: number | null; with_count: number; without_count: number };
    sleep: { good_avg: number | null; poor_avg: number | null; good_count: number; poor_count: number };
    total_days: number;
  } | null;
}

interface MonthlyReviewProps {
  isFirstWeekOfMonth: boolean;
  monthlyReviewDismissed: boolean;
  setMonthlyReviewDismissed: (v: boolean) => void;
  monthlyReview: MonthlyReviewData | null;
  navigation: any;
}

export function WeeklyReviewCard({
  loading,
  showRecap,
  digest,
  setRecapDismissed,
  glucoseAvg,
  onShowDigest,
}: WeeklyReviewProps) {
  const { theme } = useTheme();
  const ink = theme.ink;

  return (
    <>
      {showRecap && digest ? (
        <ShadowCard size="card" bg={theme.teal.tint} accent={theme.teal.solid}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <Text style={[styles.cardTitle, { color: theme.teal.fg }]}>Your week</Text>
            <Pressable onPress={() => setRecapDismissed(true)} accessibilityLabel="Dismiss weekly recap">
              <Ionicons name="close" size={16} color={theme.teal.fg} />
            </Pressable>
          </View>
          {digest.steps.this_week > 0 ? (
            <Text style={{ color: theme.teal.fg, fontSize: FONT_SIZES.body }}>
              {digest.steps.this_week.toLocaleString()} steps
              {digest.steps.last_week > 0 ? (digest.steps.this_week >= digest.steps.last_week ? " · up from last week" : " · fewer than last week") : ""}
            </Text>
          ) : null}
          {digest.hobbies.this_week_sessions > 0 ? (
            <Text style={{ color: theme.teal.fg, fontSize: FONT_SIZES.body, marginTop: 3 }}>
              {digest.hobbies.this_week_sessions} hobby session{digest.hobbies.this_week_sessions === 1 ? "" : "s"}
            </Text>
          ) : null}
        </ShadowCard>
      ) : null}
      <ShadowCard size="card" accent={theme.teal.solid} cardId="seven_day_review">
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
          <Text style={[styles.cardTitle, { color: theme.textStrong }]}>7-day review</Text>
          {digest && (
            <Pressable onPress={onShowDigest} hitSlop={8}>
              <Text style={{ color: theme.teal.fg, fontSize: FONT_SIZES.caption, fontWeight: "700" }}>View summary →</Text>
            </Pressable>
          )}
        </View>
        {loading ? (
          <View style={{ gap: 8, marginTop: 10 }}>
            <SkeletonBox style={{ height: 72, marginBottom: 4 }} />
            <SkeletonBox style={{ height: 14, width: "60%" }} />
          </View>
        ) : digest ? (
          <>
            <View style={styles.summaryBlocksRow}>
              <View style={[styles.summaryBlock, { backgroundColor: theme.teal.solid }]}>
                <Text style={[styles.summaryBlockLabel, { color: onSolid(theme.teal.solid) }]}>STEPS</Text>
                <Text style={[styles.summaryBlockValue, { color: onSolid(theme.teal.solid) }]}>{digest.steps.this_week.toLocaleString()}</Text>
              </View>
              <View style={[styles.summaryBlock, { backgroundColor: theme.berry.solid }]}>
                <Text style={[styles.summaryBlockLabel, { color: onSolid(theme.berry.solid) }]}>GLUCOSE</Text>
                <Text style={[styles.summaryBlockValue, { color: onSolid(theme.berry.solid) }]}>{glucoseAvg !== null ? glucoseAvg + " avg" : "--"}</Text>
              </View>
              <View style={[styles.summaryBlock, { backgroundColor: theme.purple.solid }]}>
                <Text style={[styles.summaryBlockLabel, { color: onSolid(theme.purple.solid) }]}>HOBBIES</Text>
                <Text style={[styles.summaryBlockValue, { color: onSolid(theme.purple.solid) }]}>{digest.hobbies.this_week_sessions} sess.</Text>
              </View>
              <View style={[styles.summaryBlock, { backgroundColor: theme.coral.solid }]}>
                <Text style={[styles.summaryBlockLabel, { color: onSolid(theme.coral.solid) }]}>MEAL NOTES</Text>
                <Text style={[styles.summaryBlockValue, { color: onSolid(theme.coral.solid) }]}>{digest.meal_flags.length === 0 ? "All clear" : digest.meal_flags.length + " flagged"}</Text>
              </View>
            </View>
            {(digest.exercise || digest.books || digest.mood) ? (
              <View style={styles.summaryBlocksRow}>
                {digest.exercise && digest.exercise.sessions_this_week > 0 ? (
                  <View style={[styles.summaryBlock, { backgroundColor: theme.coral.solid }]}>
                    <Text style={[styles.summaryBlockLabel, { color: onSolid(theme.coral.solid) }]}>WORKOUTS</Text>
                    <Text style={[styles.summaryBlockValue, { color: onSolid(theme.coral.solid) }]}>{digest.exercise.sessions_this_week} sess.</Text>
                  </View>
                ) : null}
                {digest.books && digest.books.finished_this_month > 0 ? (
                  <View style={[styles.summaryBlock, { backgroundColor: theme.amber.solid }]}>
                    <Text style={[styles.summaryBlockLabel, { color: onSolid(theme.amber.solid) }]}>BOOKS</Text>
                    <Text style={[styles.summaryBlockValue, { color: onSolid(theme.amber.solid) }]}>{digest.books.finished_this_month} done</Text>
                  </View>
                ) : null}
                {digest.mood?.avg_this_week != null ? (
                  <View style={[styles.summaryBlock, { backgroundColor: theme.violet?.solid ?? theme.purple.solid }]}>
                    <Text style={[styles.summaryBlockLabel, { color: onSolid(theme.violet?.solid ?? theme.purple.solid) }]}>MOOD AVG</Text>
                    <Text style={[styles.summaryBlockValue, { color: onSolid(theme.violet?.solid ?? theme.purple.solid) }]}>{digest.mood.avg_this_week.toFixed(1)} / 5</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
            {digest.heart_rate.has_data ? (
              <>
                <Text style={[styles.digestLabel, { color: theme.textSoft }]}>Heart rate</Text>
                <Text style={{ color: theme.textStrong, fontSize: FONT_SIZES.body, marginBottom: 4, fontWeight: "600" }}>
                  Resting {digest.heart_rate.resting} · Peak {digest.heart_rate.peak} bpm
                </Text>
              </>
            ) : null}
            {(digest.meal_flags.length > 0 || digest.spending_spikes.length > 0) ? (
              <View style={[styles.calloutStrip, { backgroundColor: theme.coral.tint, borderColor: ink }]}>
                {digest.meal_flags.map((f, i) => <Text key={"mf" + i} style={{ color: theme.coral.fg, fontSize: 12 }}>🍽 {f.label}</Text>)}
                {digest.spending_spikes.map((s, i) => <Text key={"ss" + i} style={{ color: theme.purple.fg, fontSize: 12 }}>$ {s.label}</Text>)}
              </View>
            ) : null}
          </>
        ) : (
          <View style={{ marginTop: 8 }}>
            <GhostRow icon="📅" label="Weekly recap appears after a few days of logging" />
          </View>
        )}
      </ShadowCard>
    </>
  );
}

export function MoodPatternCard({ weeklyData, correlation, setCorrelation }: MoodPatternProps) {
  const { theme } = useTheme();
  const ink = theme.ink;
  const card = theme.card;

  // Correlation bar grow-on-mount animation — owned locally (section-local)
  const corrBarAnims = useRef<Animated.Value[]>([]);
  const [corrBarScales, setCorrBarScales] = useState<number[]>([]);
  useEffect(function () {
    const n = weeklyData.length;
    if (n === 0) return;
    if (corrBarAnims.current.length !== n) {
      corrBarAnims.current = Array.from({ length: n }, () => new Animated.Value(0));
    } else {
      corrBarAnims.current.forEach(v => v.setValue(0));
    }
    setCorrBarScales(new Array(n).fill(0));
    const listeners: string[] = [];
    corrBarAnims.current.forEach((anim, i) => {
      const id = anim.addListener(({ value }) => {
        setCorrBarScales(prev => {
          const next = [...prev];
          next[i] = value;
          return next;
        });
      });
      listeners.push(id);
    });
    Animated.stagger(
      35,
      corrBarAnims.current.map(v =>
        Animated.timing(v, { toValue: 1, duration: 320, useNativeDriver: false })
      )
    ).start(() => {
      corrBarAnims.current.forEach((anim, i) => anim.removeListener(listeners[i]));
    });
    return () => {
      corrBarAnims.current.forEach((anim, i) => anim.removeListener(listeners[i]));
    };
  }, [weeklyData, correlation]);

  const sparkPoints = weeklyData
    .map((d) => d.avg_mood !== null ? d.avg_mood : null)
    .filter((v): v is number => v !== null);
  const sparkW = 80, sparkH = 24, sparkPad = 2;
  const sparkPolyline = sparkPoints.length >= 2
    ? weeklyData
        .map((d, i) => {
          if (d.avg_mood === null) return null;
          const x = sparkPad + (i / (weeklyData.length - 1)) * (sparkW - sparkPad * 2);
          const y = sparkPad + ((5 - d.avg_mood) / 4) * (sparkH - sparkPad * 2);
          return x.toFixed(1) + "," + y.toFixed(1);
        })
        .filter(Boolean)
        .join(" ")
    : null;

  function moodBarH(avg_mood: number | null) { return avg_mood === null ? 0 : ((avg_mood - 1) / 4) * CORR_H; }
  const maxSpend = Math.max(...weeklyData.map((d) => d.total_spent), 1);
  const maxSleep = Math.max(...weeklyData.map((d) => d.sleep_hours), 8);
  function compBarH(d: WeeklyDay) {
    return correlation === "sleep" ? (d.sleep_hours / maxSleep) * CORR_H : (d.total_spent / maxSpend) * CORR_H;
  }

  if (weeklyData.length === 0) return null;

  return (
    <ShadowCard size="card" cardId="mood_pattern">
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
        <Text style={[styles.cardTitle, { color: theme.textStrong }]}>7-day mood pattern</Text>
        {sparkPolyline ? (
          <Svg width={sparkW} height={sparkH}>
            <Polyline points={sparkPolyline} fill="none" stroke={theme.violet.solid} strokeWidth={1.5} />
          </Svg>
        ) : null}
      </View>
      <Text style={{ color: theme.textSoft, fontSize: FONT_SIZES.caption, marginBottom: 8 }}>
        Same days side by side — draw your own conclusions.
      </Text>
      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: theme.violet.solid }]} />
          <Text style={{ color: theme.textSoft, fontSize: FONT_SIZES.caption }}>Mood (1–5)</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: correlation === "sleep" ? theme.amber.solid : theme.purple.solid }]} />
          <Text style={{ color: theme.textSoft, fontSize: FONT_SIZES.caption }}>{correlation === "sleep" ? "Sleep (hrs)" : "Spending ($)"}</Text>
        </View>
        <View style={{ flex: 1 }} />
        <Pressable
          onPress={() => setCorrelation(correlation === "sleep" ? "spend" : "sleep")}
          style={[styles.toggleChip, { backgroundColor: card }]}
          accessibilityRole="button"
          accessibilityLabel={"Switch to compare with " + (correlation === "sleep" ? "spending" : "sleep")}
        >
          <Text style={{ color: ink, fontSize: FONT_SIZES.micro, fontWeight: "800", letterSpacing: 0.4 }}>
            VS {correlation === "sleep" ? "SPENDING" : "SLEEP"}
          </Text>
        </Pressable>
      </View>
      <Svg width={CORR_W} height={CORR_H + 20} style={{ marginTop: 8 }}>
        {weeklyData.map(function (d, i) {
          const scale = corrBarScales[i] ?? 1;
          const mH = moodBarH(d.avg_mood) * scale;
          const cH = compBarH(d) * scale;
          const groupX = i * STEP;
          const moodX = groupX + STEP / 2 - BAR_W - 1;
          const compX = groupX + STEP / 2 + 1;
          const compColor = correlation === "sleep" ? theme.amber.solid : theme.purple.solid;
          return (
            <React.Fragment key={d.date}>
              {mH > 0 ? <Rect x={moodX} y={CORR_H - mH} width={BAR_W} height={mH} fill={theme.violet.solid} rx={3} /> : <Rect x={moodX} y={CORR_H - 2} width={BAR_W} height={2} fill={theme.cardBorder} rx={1} />}
              {cH > 0 ? <Rect x={compX} y={CORR_H - cH} width={BAR_W} height={cH} fill={compColor} rx={3} /> : <Rect x={compX} y={CORR_H - 2} width={BAR_W} height={2} fill={theme.cardBorder} rx={1} />}
              <SvgText x={groupX + STEP / 2} y={CORR_H + 14} fontSize={10} fill={theme.textSoft} textAnchor="middle">{fmtDayLabel(d.date)}</SvgText>
            </React.Fragment>
          );
        })}
      </Svg>
    </ShadowCard>
  );
}

export function CrossMetricCard({ crossMetricData }: CrossMetricProps) {
  const { theme } = useTheme();
  if (!crossMetricData) return null;
  const { exercise: ex, sleep: sl } = crossMetricData;
  const hasExercise = ex.with_count >= 3 && ex.without_count >= 3 && ex.with_avg !== null && ex.without_avg !== null;
  const hasSleep    = sl.good_count >= 3 && sl.poor_count >= 3 && sl.good_avg !== null && sl.poor_avg !== null;
  if (!hasExercise && !hasSleep) return null;
  return (
    <ShadowCard size="card" accent={theme.teal.solid} rotate={-0.3} cardId="cross_metric">
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Ionicons name="git-compare-outline" size={18} color={theme.teal.solid} />
        <Text style={{ fontSize: FONT_SIZES.subheading, fontWeight: "900", letterSpacing: -0.5, color: theme.textStrong }}>Cross-metric insights</Text>
      </View>
      {hasExercise && (function () {
        const diff = Math.abs(ex.with_avg! - ex.without_avg!);
        const withIsLower = ex.with_avg! < ex.without_avg!;
        return (
          <View style={{ marginBottom: hasSleep ? 16 : 0 }}>
            <Text style={{ color: theme.textSoft, fontSize: FONT_SIZES.micro, fontWeight: "800", letterSpacing: 0.5, marginBottom: 6 }}>EXERCISE DAYS VS REST DAYS</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1, backgroundColor: theme.teal.tint, borderRadius: 10, padding: 10, alignItems: "center", borderWidth: 1, borderColor: theme.cardBorder }}>
                <Text style={{ color: theme.teal.fg, fontSize: FONT_SIZES.heading, fontWeight: "900" }}>{ex.with_avg}</Text>
                <Text style={{ color: theme.teal.sub, fontSize: FONT_SIZES.micro, fontWeight: "700", marginTop: 2 }}>mg/dL avg</Text>
                <Text style={{ color: theme.teal.sub, fontSize: FONT_SIZES.micro }}>exercise days</Text>
              </View>
              <View style={{ flex: 1, backgroundColor: theme.card, borderRadius: 10, padding: 10, alignItems: "center", borderWidth: 1, borderColor: theme.cardBorder }}>
                <Text style={{ color: theme.textStrong, fontSize: FONT_SIZES.heading, fontWeight: "900" }}>{ex.without_avg}</Text>
                <Text style={{ color: theme.textSoft, fontSize: FONT_SIZES.micro, fontWeight: "700", marginTop: 2 }}>mg/dL avg</Text>
                <Text style={{ color: theme.textSoft, fontSize: FONT_SIZES.micro }}>rest days</Text>
              </View>
            </View>
            {diff >= 3 && (
              <Text style={{ color: theme.textSoft, fontSize: FONT_SIZES.caption, marginTop: 8, lineHeight: 16 }}>
                Glucose averaged {diff} mg/dL {withIsLower ? "lower" : "higher"} on exercise days ({ex.with_count} days). Observation only — not a finding.
              </Text>
            )}
          </View>
        );
      })()}
      {hasSleep && (function () {
        const diff = Math.abs(sl.good_avg! - sl.poor_avg!);
        const goodIsLower = sl.good_avg! < sl.poor_avg!;
        return (
          <View>
            <Text style={{ color: theme.textSoft, fontSize: FONT_SIZES.micro, fontWeight: "800", letterSpacing: 0.5, marginBottom: 6 }}>7+ HOURS SLEEP VS LESS</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1, backgroundColor: theme.amber.tint, borderRadius: 10, padding: 10, alignItems: "center", borderWidth: 1, borderColor: theme.cardBorder }}>
                <Text style={{ color: theme.amber.fg, fontSize: FONT_SIZES.heading, fontWeight: "900" }}>{sl.good_avg}</Text>
                <Text style={{ color: theme.amber.sub, fontSize: FONT_SIZES.micro, fontWeight: "700", marginTop: 2 }}>mg/dL avg</Text>
                <Text style={{ color: theme.amber.sub, fontSize: FONT_SIZES.micro }}>7+ h nights</Text>
              </View>
              <View style={{ flex: 1, backgroundColor: theme.card, borderRadius: 10, padding: 10, alignItems: "center", borderWidth: 1, borderColor: theme.cardBorder }}>
                <Text style={{ color: theme.textStrong, fontSize: FONT_SIZES.heading, fontWeight: "900" }}>{sl.poor_avg}</Text>
                <Text style={{ color: theme.textSoft, fontSize: FONT_SIZES.micro, fontWeight: "700", marginTop: 2 }}>mg/dL avg</Text>
                <Text style={{ color: theme.textSoft, fontSize: FONT_SIZES.micro }}>{"<"}7 h nights</Text>
              </View>
            </View>
            {diff >= 3 && (
              <Text style={{ color: theme.textSoft, fontSize: FONT_SIZES.caption, marginTop: 8, lineHeight: 16 }}>
                Glucose averaged {diff} mg/dL {goodIsLower ? "lower" : "higher"} after 7+ hour nights ({sl.good_count} nights). Observation only — not a finding.
              </Text>
            )}
          </View>
        );
      })()}
    </ShadowCard>
  );
}

export function MonthlyReviewCard({ isFirstWeekOfMonth, monthlyReviewDismissed, setMonthlyReviewDismissed, monthlyReview, navigation }: MonthlyReviewProps) {
  const { theme } = useTheme();
  if (!isFirstWeekOfMonth || monthlyReviewDismissed || !monthlyReview) return null;
  const { month, steps: mrSteps, spending, observation } = monthlyReview;
  const monthLabel = (function () {
    const [y, m] = month.split("-").map(Number);
    return new Date(y, m - 1).toLocaleString("en-US", { month: "long", year: "numeric" });
  })();
  const spendDiff = (spending.total !== null && spending.prev_total !== null)
    ? spending.total - spending.prev_total : null;
  const spendUp = spendDiff !== null && spendDiff > 0;
  return (
    <ShadowCard size="card" bg={theme.teal.tint} accent={theme.teal.solid} rotate={-0.3} cardId="monthly_review">
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Ionicons name="calendar-outline" size={18} color={theme.teal.fg} />
          <Text style={{ fontSize: FONT_SIZES.subheading, fontWeight: "900", letterSpacing: -0.5, color: theme.teal.fg }}>{monthLabel} review</Text>
        </View>
        <Pressable
          onPress={async () => {
            const key = `ripple.monthlyReview.dismissed`;
            await AsyncStorage.setItem(key, month).catch(() => {});
            setMonthlyReviewDismissed(true);
          }}
          accessibilityLabel="Dismiss monthly review"
          hitSlop={8}
        >
          <Ionicons name="close" size={16} color={theme.teal.fg} />
        </Pressable>
      </View>

      {mrSteps.best_week ? (
        <View style={{ marginBottom: 6 }}>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1, backgroundColor: theme.card, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: theme.cardBorder }}>
              <Text style={{ fontSize: FONT_SIZES.micro, fontWeight: "700", color: theme.textSoft, letterSpacing: 0.5, marginBottom: 2 }}>BEST WEEK</Text>
              <Text style={{ fontSize: FONT_SIZES.heading, fontWeight: "900", color: theme.teal.solid }}>{mrSteps.best_week.total.toLocaleString()}</Text>
              <Text style={{ fontSize: FONT_SIZES.micro, color: theme.textSoft }}>steps · wk of {mrSteps.best_week.start.slice(5)}</Text>
            </View>
            {mrSteps.worst_week ? (
              <View style={{ flex: 1, backgroundColor: theme.card, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: theme.cardBorder }}>
                <Text style={{ fontSize: FONT_SIZES.micro, fontWeight: "700", color: theme.textSoft, letterSpacing: 0.5, marginBottom: 2 }}>SLOWEST WEEK</Text>
                <Text style={{ fontSize: FONT_SIZES.heading, fontWeight: "900", color: theme.textStrong }}>{mrSteps.worst_week.total.toLocaleString()}</Text>
                <Text style={{ fontSize: FONT_SIZES.micro, color: theme.textSoft }}>steps · wk of {mrSteps.worst_week.start.slice(5)}</Text>
              </View>
            ) : null}
          </View>
        </View>
      ) : null}

      {spending.total !== null ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
          <Ionicons
            name={spendUp ? "arrow-up" : "arrow-down"}
            size={14}
            color={spendUp ? theme.danger : theme.success}
          />
          <Text style={{ fontSize: FONT_SIZES.body, color: theme.textStrong, fontWeight: "700" }}>
            ${spending.total.toLocaleString(undefined, { maximumFractionDigits: 0 })} spent
          </Text>
          {spendDiff !== null && spending.prev_total !== null && spending.prev_total > 0 ? (
            <Text style={{ fontSize: FONT_SIZES.caption, color: spendUp ? theme.danger : theme.success, fontWeight: "600" }}>
              {spendUp ? "+" : ""}{spendDiff.toLocaleString(undefined, { maximumFractionDigits: 0 })} vs prior month
            </Text>
          ) : null}
        </View>
      ) : null}

      {observation ? (
        <Text style={{ fontSize: FONT_SIZES.caption, color: theme.teal.fg, lineHeight: 17, marginTop: 2 }}>{observation}</Text>
      ) : null}

      <Pressable
        onPress={() => navigation.navigate("MonthlyRecap")}
        style={({ pressed }) => ({
          marginTop: 8,
          paddingVertical: 8,
          borderRadius: 10,
          borderWidth: 1.5,
          borderColor: theme.teal.solid,
          alignItems: "center",
          opacity: pressed ? 0.7 : 1,
        })}
        accessibilityRole="button"
        accessibilityLabel="View full monthly recap"
      >
        <Text style={{ fontSize: FONT_SIZES.caption, fontWeight: "800", color: theme.teal.solid }}>View Full Recap ›</Text>
      </Pressable>
    </ShadowCard>
  );
}

const styles = StyleSheet.create({
  cardTitle: { fontSize: FONT_SIZES.subheading, fontWeight: "900", letterSpacing: -0.5, marginBottom: 4 },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  toggleChip: {
    borderWidth: 2,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  summaryBlocksRow: { flexDirection: "row", gap: 6, marginTop: 10, marginBottom: 4 },
  summaryBlock: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 2,
    padding: 8,
  },
  summaryBlockLabel: { fontSize: FONT_SIZES.micro, fontWeight: "800", letterSpacing: 0.5, marginBottom: 4 },
  summaryBlockValue: { fontSize: FONT_SIZES.body, fontWeight: "800" },
  digestLabel: { fontSize: FONT_SIZES.micro, fontWeight: "800", marginTop: 10, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.7 },
  calloutStrip: { borderWidth: 2, borderRadius: 16, padding: 10, marginTop: 10, gap: 4 },
  emptyState: {
    borderWidth: 2,
    borderRadius: 16,
    borderStyle: "dashed",
    paddingVertical: 18,
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  emptyText: { fontSize: 13, fontWeight: "500" },
});
