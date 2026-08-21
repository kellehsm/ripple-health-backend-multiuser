import React, { useEffect, useRef, useState } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator, Animated, Share, StyleSheet, Alert, RefreshControl, Easing } from "react-native";
import ViewShot, { type ViewShotRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { api } from "../api/client";
import { ScreenBackground } from "../components/ScreenBackground";
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Stop } from "react-native-svg";
import { ShadowCard } from "../components/ShadowCard";
import { scoreColor, scoreLabel } from "../components/DailySummaryCard";

type Review = Awaited<ReturnType<typeof api.monthlyReview>>;

const DOMAIN_ROWS: Array<{ key: string; label: string }> = [
  { key: "sleep", label: "Sleep" },
  { key: "glucose", label: "Glucose" },
  { key: "activity", label: "Activity" },
  { key: "hydration", label: "Hydration" },
  { key: "nutrition", label: "Nutrition" },
  { key: "mood", label: "Mood" },
  { key: "productivity", label: "Productivity" },
  { key: "stress", label: "Stress" },
];

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1).toLocaleString("en-US", { month: "long", year: "numeric" });
}

function dayLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleString("en-US", { month: "short", day: "numeric" });
}

function TrendBar({ label, score, prev, theme, index }: { label: string; score: number | null; prev: number | null; theme: any; index: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 450, delay: index * 45, useNativeDriver: false }).start();
  }, []);
  const diff = score !== null && prev !== null ? score - prev : null;
  const color = scoreColor(score, theme);
  return (
    <View style={{ marginBottom: 10 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 3 }}>
        <Text style={{ fontSize: 12, fontWeight: "700", color: theme.textStrong }}>{label}</Text>
        <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
          <Text style={{ fontSize: 12, fontWeight: "800", color }}>{score ?? "—"}</Text>
          {diff !== null && diff !== 0 ? (
            <Text style={{ fontSize: 10, fontWeight: "700", color: diff > 0 ? theme.success : theme.danger }}>
              {diff > 0 ? "▲" : "▼"} {Math.abs(diff)}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={{ height: 7, borderRadius: 4, backgroundColor: theme.cardBorder, overflow: "hidden" }}>
        <Animated.View
          style={{
            height: "100%",
            borderRadius: 4,
            backgroundColor: color,
            width: anim.interpolate({ inputRange: [0, 1], outputRange: ["0%", `${Math.max(2, score ?? 0)}%`] }),
          }}
        />
      </View>
    </View>
  );
}

function NarrativeShimmer({ theme }: { theme: any }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 900, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        Animated.timing(anim, { toValue: 0, duration: 900, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      ])
    ).start();
  }, []);
  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0.85] });
  return (
    <Animated.View style={{ opacity, gap: 7 }}>
      {[90, 75, 85, 60].map((w, i) => (
        <View
          key={i}
          style={{ height: 11, borderRadius: 6, backgroundColor: theme.cardBorder, width: `${w}%` }}
        />
      ))}
    </Animated.View>
  );
}

export function MonthlyRecapScreen() {
  const { theme } = useTheme();
  const [review, setReview] = useState<Review | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [narrative, setNarrative] = useState<string | null>(null);
  const [narrativeLoading, setNarrativeLoading] = useState(false);
  const viewShotRef = useRef<ViewShotRef>(null);

  useEffect(() => {
    api.monthlyReview()
      .then((r) => {
        setReview(r);
        // Fetch narrative for the same month
        setNarrativeLoading(true);
        api.monthlyNarrative(r.month)
          .then((res) => setNarrative(res.narrative))
          .catch(() => setNarrative(null))
          .finally(() => setNarrativeLoading(false));
      })
      .catch(() => setReview(null))
      .finally(() => setLoading(false));
  }, []);

  function handleRefresh() {
    setRefreshing(true);
    api.monthlyReview()
      .then(setReview)
      .catch(() => {})
      .finally(() => setRefreshing(false));
  }

  async function shareAsImage() {
    try {
      const uri = await viewShotRef.current?.capture?.();
      if (!uri) { shareRecap(); return; }
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: "Share your monthly recap" });
      } else {
        await Share.share({ url: uri });
      }
    } catch {
      shareRecap();
    }
  }

  async function shareRecap() {
    if (!review) return;
    const lines: string[] = [`My ${monthLabel(review.month)} in Ripple`];
    if (review.scores?.overall != null) lines.push(`Wellness score: ${review.scores.overall}/100 (${scoreLabel(review.scores.overall)})`);
    if (review.best_day) lines.push(`Best day: ${dayLabel(review.best_day.date)} (${review.best_day.score})`);
    if (review.steps.total) lines.push(`Steps: ${review.steps.total.toLocaleString()}`);
    if (review.spending.total != null) lines.push(`Spending: $${review.spending.total.toLocaleString(undefined, { maximumFractionDigits: 0 })}`);
    if (review.observation) lines.push(review.observation);
    try {
      await Share.share({ message: lines.join("\n") });
    } catch {}
  }

  const spendDiff =
    review && review.spending.total !== null && review.spending.prev_total !== null
      ? review.spending.total - review.spending.prev_total
      : null;

  return (
    <View style={{ flex: 1, backgroundColor: theme.page }}>
      <ScreenBackground />
      {loading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator color={theme.teal.solid} />
        </View>
      ) : !review ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 8 }}>
          <Ionicons name="calendar-outline" size={30} color={theme.textSoft} />
          <Text style={{ color: theme.textSoft, fontSize: 13 }}>Couldn't load your monthly recap.</Text>
        </View>
      ) : (
        <ViewShot ref={viewShotRef} options={{ format: "png", quality: 0.95, result: "tmpfile" }}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 14 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.teal.solid} />}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View>
              <Text style={{ fontSize: 22, fontWeight: "900", color: theme.textStrong }}>{monthLabel(review.month)}</Text>
              <Text style={{ fontSize: 12, color: theme.textSoft }}>Your month in review</Text>
            </View>
            <Pressable
              onPress={shareAsImage}
              style={[styles.shareBtn, { backgroundColor: theme.teal.solid }]}
              accessibilityRole="button"
              accessibilityLabel="Share recap as image"
            >
              <Ionicons name="share-outline" size={16} color="#fff" />
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 12 }}>Share</Text>
            </Pressable>
          </View>

          {(narrativeLoading || narrative) ? (
            <ShadowCard size="card" bg={theme.card} accent={theme.purple.solid} rotate={0.2} cardId="recap_narrative">
              <Text style={[styles.sectionTitle, { color: theme.textSoft }]}>YOUR MONTH IN WORDS</Text>
              <View style={{ marginTop: 8 }}>
                {narrativeLoading ? (
                  <NarrativeShimmer theme={theme} />
                ) : (
                  <Text style={{ fontSize: 13, color: theme.textStrong, lineHeight: 20 }}>{narrative}</Text>
                )}
              </View>
            </ShadowCard>
          ) : null}

          <ShadowCard size="card" bg={theme.teal.tint} accent={theme.teal.solid} rotate={-0.3} cardId="recap_score">
            <Text style={[styles.sectionTitle, { color: theme.teal.fg }]}>AVERAGE WELLNESS SCORE</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 14, marginTop: 6 }}>
              <View style={styles.scoreBadge}>
                <Svg width={62} height={62} style={{ position: "absolute" }}>
                  <Defs>
                    <SvgGradient id="recapRing" x1="0" y1="0" x2="1" y2="1">
                      <Stop offset="0" stopColor={scoreColor(review.scores?.overall ?? null, theme)} stopOpacity={1} />
                      <Stop offset="1" stopColor={theme.teal.solid} stopOpacity={0.6} />
                    </SvgGradient>
                  </Defs>
                  <Circle cx={31} cy={31} r={28.5} stroke="url(#recapRing)" strokeWidth={4} fill="none" />
                </Svg>
                <Text style={{ fontSize: 24, fontWeight: "900", color: scoreColor(review.scores?.overall ?? null, theme) }}>
                  {review.scores?.overall ?? "—"}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: "800", color: theme.textStrong }}>
                  {scoreLabel(review.scores?.overall ?? null)}
                </Text>
                {review.prev_scores?.overall != null && review.scores?.overall != null ? (
                  <Text style={{ fontSize: 12, color: theme.textSoft }}>
                    {review.scores.overall >= review.prev_scores.overall ? "Up" : "Down"}{" "}
                    {Math.abs(review.scores.overall - review.prev_scores.overall)} vs prior month
                  </Text>
                ) : (
                  <Text style={{ fontSize: 12, color: theme.textSoft }}>No prior-month comparison yet</Text>
                )}
              </View>
            </View>
            {(review.best_day || review.worst_day) && (
              <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                {review.best_day ? (
                  <View style={[styles.dayCell, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                    <Text style={[styles.cellLabel, { color: theme.textSoft }]}>BEST DAY</Text>
                    <Text style={{ fontSize: 16, fontWeight: "900", color: theme.success }}>{review.best_day.score}</Text>
                    <Text style={{ fontSize: 10, color: theme.textSoft }}>{dayLabel(review.best_day.date)}</Text>
                  </View>
                ) : null}
                {review.worst_day ? (
                  <View style={[styles.dayCell, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                    <Text style={[styles.cellLabel, { color: theme.textSoft }]}>TOUGHEST DAY</Text>
                    <Text style={{ fontSize: 16, fontWeight: "900", color: theme.textStrong }}>{review.worst_day.score}</Text>
                    <Text style={{ fontSize: 10, color: theme.textSoft }}>{dayLabel(review.worst_day.date)}</Text>
                  </View>
                ) : null}
              </View>
            )}
          </ShadowCard>

          {review.scores ? (
            <ShadowCard size="card" bg={theme.card} accent={theme.purple.solid} rotate={0.3} cardId="recap_domains">
              <Text style={[styles.sectionTitle, { color: theme.textSoft }]}>BY DOMAIN · VS PRIOR MONTH</Text>
              <View style={{ marginTop: 8 }}>
                {DOMAIN_ROWS.map((d, i) => (
                  <TrendBar
                    key={d.key}
                    label={d.label}
                    score={review.scores?.[d.key] ?? null}
                    prev={review.prev_scores?.[d.key] ?? null}
                    theme={theme}
                    index={i}
                  />
                ))}
              </View>
            </ShadowCard>
          ) : null}

          <ShadowCard size="card" bg={theme.card} accent={theme.coral.solid} rotate={-0.2} cardId="recap_totals">
            <Text style={[styles.sectionTitle, { color: theme.textSoft }]}>TOTALS</Text>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
              <View style={[styles.dayCell, { backgroundColor: theme.page, borderColor: theme.cardBorder }]}>
                <Text style={[styles.cellLabel, { color: theme.textSoft }]}>STEPS</Text>
                <Text style={{ fontSize: 16, fontWeight: "900", color: theme.teal.solid }}>
                  {review.steps.total ? review.steps.total.toLocaleString() : "—"}
                </Text>
                {review.steps.best_week ? (
                  <Text style={{ fontSize: 10, color: theme.textSoft }}>best wk of {review.steps.best_week.start.slice(5)}</Text>
                ) : null}
              </View>
              <View style={[styles.dayCell, { backgroundColor: theme.page, borderColor: theme.cardBorder }]}>
                <Text style={[styles.cellLabel, { color: theme.textSoft }]}>SPENDING</Text>
                <Text style={{ fontSize: 16, fontWeight: "900", color: theme.purple.solid }}>
                  {review.spending.total != null
                    ? `$${review.spending.total.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                    : "—"}
                </Text>
                {spendDiff !== null && review.spending.prev_total ? (
                  <Text style={{ fontSize: 10, fontWeight: "700", color: spendDiff > 0 ? theme.danger : theme.success }}>
                    {spendDiff > 0 ? "+" : ""}
                    {spendDiff.toLocaleString(undefined, { maximumFractionDigits: 0 })} vs prior
                  </Text>
                ) : null}
              </View>
            </View>
            {review.observation ? (
              <Text style={{ fontSize: 12, color: theme.textSoft, lineHeight: 17, marginTop: 10 }}>{review.observation}</Text>
            ) : null}
          </ShadowCard>

          <Text style={{ fontSize: 10, color: theme.textSoft, textAlign: "center", lineHeight: 15 }}>
            Scores summarize your own tracked data. Observations only — never medical advice.
          </Text>
        </ScrollView>
        </ViewShot>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { fontSize: 10, fontWeight: "800", letterSpacing: 0.6 },
  shareBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 18, paddingVertical: 8, paddingHorizontal: 14 },
  scoreBadge: { width: 62, height: 62, alignItems: "center", justifyContent: "center" },
  dayCell: { flex: 1, borderRadius: 10, padding: 10, borderWidth: 1 },
  cellLabel: { fontSize: 9, fontWeight: "800", letterSpacing: 0.5, marginBottom: 2 },
});
