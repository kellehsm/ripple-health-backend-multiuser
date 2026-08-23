import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { FeatureIntroSheet } from "../components/FeatureIntroSheet";
import { useFeatureIntro } from "../onboarding/useFeatureIntro";
import { findIntro } from "../onboarding/featureIntros";
import {
  ScrollView,
  View,
  Text,
  Pressable,
  Animated,
  RefreshControl,
  PanResponder,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useTheme } from "../theme/ThemeContext";
import { FONT_SIZES } from "../theme/tokens";
import { ShadowCard } from "../components/ShadowCard";
import { api } from "../api/client";
import { DailySummaryCard } from "../components/DailySummaryCard";
import { WellnessScoreModal } from "../components/WellnessScoreModal";
import { WhatChangedCard } from "../components/WhatChangedCard";
import { WhyMightThatBeCard } from "../components/WhyMightThatBeCard";
import { InsightCard } from "../components/InsightCard";
import { toast } from "../lib/toast";
import { syncWidgetAndWatch } from "../lib/widgetSync";
import { MoodCheckInModal, type MoodPeriod } from "../components/MoodCheckInModal";
import { MoodPageSheet } from "../components/MoodPageSheet";
import { MilestoneBanner } from "../components/MilestoneBanner";
import { type CardId } from "../constants/dashboardCards";
import { TooltipBubble } from "../components/TooltipBubble";
import { hasSeenTooltip, markTooltipSeen } from "../utils/tooltipSeen";
import { DashboardEditorModal } from "../components/DashboardEditorModal";
import { FeatureTour, type TourStep } from "../components/FeatureTour";
import { useFocusEffect } from "@react-navigation/native";
import { todayStr } from "../utils/dateUtils";
import { computeTIR, weekGlucoseAvg, interpolateGlucose, glucoseY as glucoseYBase, eventX as eventXBase } from "../utils/glucoseMetrics";
import { QuickLogSheet, type QuickLogKind } from "../components/QuickLogSheet";
import { ScreenBackground } from "../components/ScreenBackground";
import { ThemedIcon, moodScoreEmoji } from '../theme/iconRegistry';
import { WeeklyDigestModal } from "../components/WeeklyDigestModal";
import {
  MetricChipsCard,
} from "./overview/MetricChipsCard";
import {
  TimelineCard,
} from "./overview/TimelineCard";
import {
  WeeklyReviewCard,
  MoodPatternCard,
  CrossMetricCard,
  MonthlyReviewCard,
} from "./overview/WeeklyReviewCard";
import { HeaderCard } from "./overview/HeaderCard";
import { FastingTimerCard } from "./overview/FastingTimerCard";
import { WellnessScoreCard } from "./overview/WellnessScoreCard";
import { InsightsPreviewCard } from "./overview/InsightsPreviewCard";
import { useOverviewData } from "./overview/useOverviewData";
import {
  timeOfDayBucket,
  computeInsights,
  buildChips,
  CHART_W,
  CHART_H,
  PAD_L,
  PAD_B,
  PAD_T,
  type GlucoseReading,
} from "./overview/shared";

// ─── Screen-local helpers ─────────────────────────────────────────────────────

function glucoseY(val: number, minVal: number, maxVal: number): number {
  return glucoseYBase(val, minVal, maxVal, CHART_H, PAD_T, PAD_B);
}

function eventX(t: number, windowStart: number, windowEnd: number): number {
  return eventXBase(t, windowStart, windowEnd, CHART_W, PAD_L);
}

// ─── Component ───────────────────────────────────────────────────────────────

export function OverviewScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<any>();
  const homeIntro = findIntro("home")!;
  const [introVisible, dismissIntro] = useFeatureIntro(homeIntro.key);

  // All data state + API calls live in the hook
  const data = useOverviewData();
  const {
    todayEntries, weeklyData, patternEvents, digest,
    dayGlucose, yesterdayGlucose, dayEvents,
    streak, allStreaks, loading, refreshing,
    recapDismissed, setRecapDismissed,
    glucoseStatus, stepsCount, sleepStats,
    waterCount, setWaterCount, todayMeals,
    dailySummary, wellnessHistory,
    topInsight, setTopInsight, allInsights, pinnedIds,
    tirPercent,
    crossMetricData, monthlyReview,
    monthlyReviewDismissed, setMonthlyReviewDismissed,
    milestoneMessage, setMilestoneMessage,
    dashboardLayout, userName,
    load, handleRefresh, handleSaveLayout, handlePin,
  } = data;

  const [showMoodModal, setShowMoodModal] = useState(false);
  const [showMoodSheet, setShowMoodSheet] = useState(false);
  const [showDigest, setShowDigest] = useState(false);
  const moodModalShownKeyRef = useRef<string | null>(null);
  const [showAllEvents, setShowAllEvents] = useState(false);
  const [scoreModalVisible, setScoreModalVisible] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const [tourPadding, setTourPadding] = useState(0);
  const [quickLogKind, setQuickLogKind] = useState<QuickLogKind | null>(null);
  const [correlation, setCorrelation] = useState<"sleep" | "spend">("sleep");

  // Tour refs
  const tourHeaderRef = useRef<View>(null);
  const tourChipsRef = useRef<View>(null);
  const tourTrendsRef = useRef<View>(null);
  const tourTimelineRef = useRef<View>(null);
  const tourInsightsRef = useRef<View>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const scrollOffsetRef = useRef(0);

  // Greeting crossfade on screen focus
  const greetingOpacity = useRef(new Animated.Value(0)).current;

  // Content crossfade — fades from 0→1 when loading finishes
  const contentOpacity = useRef(new Animated.Value(0)).current;

  // Time-aware sub-greeting — computed once on mount
  const dashboardGreeting = useMemo(function () {
    const hour = new Date().getHours();
    if (hour >= 5  && hour < 12) return "Good morning 🌅";
    if (hour >= 12 && hour < 17) return "Good afternoon ☀️";
    if (hour >= 17 && hour < 21) return "Good evening 🌆";
    return "Wind down 🌙";
  }, []);

  // Number counter animations (0→1, interpolate to real value)
  const stepsCounterAnim = useRef(new Animated.Value(0)).current;
  const waterCounterAnim = useRef(new Animated.Value(0)).current;
  const glucoseCounterAnim = useRef(new Animated.Value(0)).current;


  // Per-chip entrance stagger anims
  const chipAnims = useRef<Animated.Value[]>([]);

  // Mood emoji pop-in animation
  const moodScaleAnim = useRef(new Animated.Value(1)).current;
  const prevMoodRef = useRef("--");

  // Refresh spin animation
  const refreshSpinAnim = useRef(new Animated.Value(0)).current;
  const refreshSpinLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  // Stagger card entrance animations
  const CARD_COUNT = 9;
  const cardAnims = useRef(
    Array.from({ length: CARD_COUNT }, () => new Animated.Value(0))
  ).current;

  // Timeline scrubber
  const timelineScrubberX = useRef(0);
  const [timelineScrubberTime, setTimelineScrubberTime] = useState<string | null>(null);
  const updateTimelineScrubberRef = useRef(updateTimelineScrubber);
  updateTimelineScrubberRef.current = updateTimelineScrubber;
  const snapTimelineScrubberRef = useRef(snapTimelineScrubber);
  snapTimelineScrubberRef.current = snapTimelineScrubber;
  const timelinePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        timelineScrubberX.current = evt.nativeEvent.locationX;
        updateTimelineScrubberRef.current(evt.nativeEvent.locationX);
      },
      onPanResponderMove: (evt) => {
        timelineScrubberX.current = evt.nativeEvent.locationX;
        updateTimelineScrubberRef.current(evt.nativeEvent.locationX);
      },
      onPanResponderRelease: () => {
        snapTimelineScrubberRef.current(timelineScrubberX.current);
      },
      onPanResponderTerminate: () => {},
    })
  ).current;

  // Glucose chart scrub
  const [scrub, setScrub] = useState<{ x: number; mgDl: number; yestMgDl: number | null; time: number } | null>(null);
  const scrubData = useRef({ windowStart: 0, windowEnd: 1, minVal: 60, maxVal: 200, dayGlucose: [] as GlucoseReading[], yesterdayGlucose: [] as GlucoseReading[] });
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => scrubData.current.dayGlucose.length > 0,
      onMoveShouldSetPanResponder: () => scrubData.current.dayGlucose.length > 0,
      onPanResponderGrant: (evt) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        updateScrub(evt.nativeEvent.locationX);
      },
      onPanResponderMove: (evt) => updateScrub(evt.nativeEvent.locationX),
      onPanResponderRelease: () => setScrub(null),
      onPanResponderTerminate: () => setScrub(null),
    })
  ).current;

  const HOME_TOUR: TourStep[] = [
    { ref: tourHeaderRef, title: "Your Home Screen", body: "Your daily wellness dashboard. Everything you track rolls up here. Tap the pencil icon to customize which sections appear." },
    { ref: tourChipsRef,  title: "Key Metrics",      body: "Glucose, steps, sleep, water, meals, and mood — all in one row. Tap the Mood chip to log how you're feeling right now." },
    { ref: tourTrendsRef, title: "Trends & Insights", body: "Tap here to open the Insights tab and explore patterns across all your data." },
    { ref: tourTimelineRef, title: "Today's Timeline", body: "Scrub the glucose chart with your finger to see exact readings. Meals, mood check-ins, and spending appear as markers so you can spot patterns." },
    { ref: tourInsightsRef, title: "Pattern Observations", body: "Observations generated from your data — descriptive only, never prescriptive. They show what happened, not what to do about it." },
  ];

  // ─── Helper functions ────────────────────────────────────────────────────────

  function timelineWindowBounds() {
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0).getTime();
    const dayEnd   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).getTime();
    return { dayStart, dayEnd };
  }

  function updateTimelineScrubber(touchX: number) {
    const { dayStart, dayEnd } = timelineWindowBounds();
    const clamped = Math.max(0, Math.min(CHART_W - PAD_L, touchX));
    const ratio = clamped / (CHART_W - PAD_L);
    const t = dayStart + ratio * (dayEnd - dayStart);
    const h = new Date(t).getHours().toString().padStart(2, "0");
    const m = new Date(t).getMinutes().toString().padStart(2, "0");
    setTimelineScrubberTime(h + ":" + m);
  }

  function snapTimelineScrubber(touchX: number) {
    if (patternEvents.length === 0) { updateTimelineScrubber(touchX); return; }
    const { dayStart, dayEnd } = timelineWindowBounds();
    const clamped = Math.max(0, Math.min(CHART_W - PAD_L, touchX));
    const ratio = clamped / (CHART_W - PAD_L);
    const t = dayStart + ratio * (dayEnd - dayStart);
    let nearest = patternEvents[0];
    let nearestDist = Math.abs(new Date(nearest.time).getTime() - t);
    for (const ev of patternEvents) {
      const d = Math.abs(new Date(ev.time).getTime() - t);
      if (d < nearestDist) { nearestDist = d; nearest = ev; }
    }
    const snapRatio = (new Date(nearest.time).getTime() - dayStart) / (dayEnd - dayStart);
    const snapX = Math.max(0, Math.min(CHART_W - PAD_L, snapRatio * (CHART_W - PAD_L)));
    timelineScrubberX.current = snapX;
    updateTimelineScrubber(snapX + PAD_L);
  }

  function updateScrub(touchX: number) {
    const { windowStart, windowEnd, minVal, maxVal, dayGlucose, yesterdayGlucose } = scrubData.current;
    const x = Math.max(PAD_L, Math.min(CHART_W, touchX));
    const t = windowStart + ((x - PAD_L) / (CHART_W - PAD_L)) * (windowEnd - windowStart);
    const raw = interpolateGlucose(dayGlucose, t);
    const yestRaw = interpolateGlucose(yesterdayGlucose, t);
    if (raw !== null) setScrub({ x, mgDl: Math.round(raw), yestMgDl: yestRaw !== null ? Math.round(yestRaw) : null, time: t });
  }

  async function quickLogWater() {
    try {
      const metric = await api.getOrCreateWaterMetric();
      await api.logWater(metric.id);
      syncWidgetAndWatch();
      setWaterCount(c => c + 1);
      toast("Water logged 💧");
    } catch { toast("Couldn't log water", "error"); }
  }

  async function quickLogMood(score: number, label: string) {
    try {
      await api.logMoodMoment(score, label);
      toast("Mood logged");
    } catch { toast("Couldn't log mood", "error"); }
  }

  // ─── Effects ────────────────────────────────────────────────────────────────

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    hasSeenTooltip("overview").then(seen => {
      if (!cancelled && !seen) {
        setShowTooltip(true);
        markTooltipSeen("overview");
      }
    });
    hasSeenTooltip("home-tour").then(seen => {
      if (!cancelled && !seen) {
        markTooltipSeen("home-tour");
        setTimeout(() => setShowTour(true), 600);
      }
    });
    return () => { cancelled = true; };
  }, []));

  // Greeting crossfade: fade in on focus, reset instantly on blur
  useFocusEffect(useCallback(() => {
    greetingOpacity.setValue(0);
    const anim = Animated.timing(greetingOpacity, { toValue: 1, duration: 400, useNativeDriver: true });
    anim.start();
    return () => { anim.stop(); greetingOpacity.setValue(0); };
  }, [greetingOpacity]));

  // Content crossfade — animate opacity 0→1 when loading finishes
  useEffect(function () {
    if (!loading) {
      Animated.timing(contentOpacity, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    } else {
      contentOpacity.setValue(0);
    }
  }, [loading]);

  // Card entrance stagger when data finishes loading
  useEffect(function () {
    if (loading) return;
    cardAnims.forEach(a => a.setValue(0));
    Animated.stagger(
      60,
      cardAnims.map(a =>
        Animated.spring(a, { toValue: 1, useNativeDriver: true, damping: 18, stiffness: 280 })
      )
    ).start();
  }, [loading]);

  // Mood period helpers
  const entryPerPeriod: Partial<Record<string, typeof todayEntries[0]>> = {};
  for (const entry of todayEntries) {
    if (entry.entry_type === "moment") continue;
    const p = entry.period ?? timeOfDayBucket(new Date(entry.logged_at));
    entryPerPeriod[p] = entry;
  }
  const currentBucket = timeOfDayBucket(new Date());

  // Auto-show mood modal once per time period when no entry exists yet
  useEffect(function () {
    if (loading) return;
    const today = todayStr();
    const key = today + "-" + currentBucket;
    if (moodModalShownKeyRef.current === key) return;
    if (!entryPerPeriod[currentBucket]) {
      moodModalShownKeyRef.current = key;
      const t = setTimeout(() => setShowMoodModal(true), 700);
      return () => clearTimeout(t);
    }
  }, [loading, todayEntries]);

  // Number counter animations — trigger when loading finishes
  useEffect(function () {
    if (loading) return;
    if (stepsCount !== null && stepsCount > 0) {
      stepsCounterAnim.setValue(0);
      Animated.timing(stepsCounterAnim, { toValue: 1, duration: 600, useNativeDriver: false }).start();
    } else {
      stepsCounterAnim.setValue(1);
    }
    if (waterCount > 0) {
      waterCounterAnim.setValue(0);
      Animated.timing(waterCounterAnim, { toValue: 1, duration: 600, useNativeDriver: false }).start();
    } else {
      waterCounterAnim.setValue(1);
    }
    if (glucoseStatus?.hasData && glucoseStatus.mg_dl != null) {
      glucoseCounterAnim.setValue(0);
      Animated.timing(glucoseCounterAnim, { toValue: 1, duration: 600, useNativeDriver: false }).start();
    } else {
      glucoseCounterAnim.setValue(1);
    }
  }, [loading, stepsCount, waterCount, glucoseStatus?.mg_dl]);


  // Chip entrance stagger — fires when loading finishes
  useEffect(function () {
    if (loading) return;
    const count = 6;
    if (chipAnims.current.length !== count) {
      chipAnims.current = Array.from({ length: count }, () => new Animated.Value(0));
    } else {
      chipAnims.current.forEach(v => v.setValue(0));
    }
    Animated.stagger(
      55,
      chipAnims.current.map(v =>
        Animated.timing(v, { toValue: 1, duration: 260, useNativeDriver: true })
      )
    ).start();
  }, [loading]);

  // Mood emoji pop-in
  useEffect(function () {
    if (loading) return;
    const currentBkt = timeOfDayBucket(new Date());
    const entry = todayEntries.find(e =>
      e.entry_type !== "moment" && e.mood_score > 0 && e.period === currentBkt
    ) ?? todayEntries.find(e => e.entry_type !== "moment" && e.mood_score > 0);
    const moodVal = entry ? moodScoreEmoji(entry.mood_score) : "--";
    if (moodVal !== "--" && prevMoodRef.current === "--") {
      moodScaleAnim.setValue(0);
      Animated.spring(moodScaleAnim, { toValue: 1, useNativeDriver: true, damping: 10, stiffness: 300 }).start();
    } else if (moodVal !== "--") {
      moodScaleAnim.setValue(1);
    }
    prevMoodRef.current = moodVal;
  }, [loading, todayEntries]);

  // Refresh spin — loop while refreshing
  useEffect(function () {
    if (refreshSpinLoopRef.current) { refreshSpinLoopRef.current.stop(); refreshSpinLoopRef.current = null; }
    if (!refreshing) { refreshSpinAnim.setValue(0); return; }
    const loop = Animated.loop(
      Animated.timing(refreshSpinAnim, { toValue: 1, duration: 750, useNativeDriver: true })
    );
    refreshSpinLoopRef.current = loop;
    loop.start();
    return () => { loop.stop(); };
  }, [refreshing]);

  // Initialize timeline scrubber to current time of day on load
  useEffect(function () {
    if (loading) return;
    const { dayStart, dayEnd } = timelineWindowBounds();
    const now = Date.now();
    const ratio = Math.max(0, Math.min(1, (now - dayStart) / (dayEnd - dayStart)));
    const initX = ratio * (CHART_W - PAD_L);
    timelineScrubberX.current = initX;
    updateTimelineScrubber(initX + PAD_L);
  }, [loading]);

  // ─── Derived values ──────────────────────────────────────────────────────────

  const tir = computeTIR(dayGlucose);
  const lastGlucoseReading = dayGlucose.length > 0 ? dayGlucose[dayGlucose.length - 1] : null;
  const lastGlucoseVal = lastGlucoseReading ? Number(lastGlucoseReading.mg_dl) : null;
  const glucoseOutOfRange = lastGlucoseVal !== null && (lastGlucoseVal < 70 || lastGlucoseVal > 180);

  const insights = useMemo(() => computeInsights({
    dayGlucose, weeklyData, patternEvents, streak, stepsCount, sleepStats, digest,
  }), [dayGlucose, weeklyData, patternEvents, streak, stepsCount, sleepStats, digest]);

  const glucoseChartData = useMemo(() => {
    const allGlucoseValues = [...dayGlucose, ...yesterdayGlucose].map((r) => Number(r.mg_dl));
    const minVal = allGlucoseValues.length ? Math.min(...allGlucoseValues, 70) - 10 : 60;
    const maxVal = allGlucoseValues.length ? Math.max(...allGlucoseValues, 140) + 10 : 200;
    const dayTimes = dayGlucose.map((r) => new Date(r.recorded_at).getTime());
    const windowStart = dayTimes.length ? Math.min(...dayTimes) : Date.now() - 8 * 3600000;
    const windowEnd = dayTimes.length ? Math.max(Math.max(...dayTimes), Date.now()) : Date.now();
    const glucosePoints = dayGlucose
      .map(r => eventX(new Date(r.recorded_at).getTime(), windowStart, windowEnd) + "," + glucoseY(Number(r.mg_dl), minVal, maxVal))
      .join(" ");
    const yesterdayPoints = yesterdayGlucose
      .map(r => eventX(new Date(r.recorded_at).getTime(), windowStart, windowEnd) + "," + glucoseY(Number(r.mg_dl), minVal, maxVal))
      .join(" ");
    return { minVal, maxVal, dayTimes, windowStart, windowEnd, glucosePoints, yesterdayPoints };
  }, [dayGlucose, yesterdayGlucose]);
  const { minVal, maxVal, dayTimes, windowStart, windowEnd, glucosePoints, yesterdayPoints } = glucoseChartData;
  scrubData.current = { windowStart, windowEnd, minVal, maxVal, dayGlucose, yesterdayGlucose };
  const highBandY = glucoseY(180, minVal, maxVal);
  const lowBandY = glucoseY(70, minVal, maxVal);
  const usableH = CHART_H - PAD_T - PAD_B;

  const isWeekStart = new Date().getDay() === 1;
  const showRecap = isWeekStart && !recapDismissed && digest !== null;
  const glucoseAvg = digest ? weekGlucoseAvg(digest.glucose_by_tod) : null;
  const isFirstWeekOfMonth = new Date().getDate() <= 7;

  // ─── Metric chip data ─────────────────────────────────────────────────────

  const currentMoodEntry = entryPerPeriod[currentBucket];
  const chips = buildChips({
    theme,
    glucoseStatus,
    stepsCount,
    sleepStats,
    waterCount,
    todayMeals,
    currentMoodEntry,
    tir,
    onPressMood: () => setShowMoodSheet(true),
  });

  // ─── Render ───────────────────────────────────────────────────────────────

  function renderCard(id: CardId): React.ReactNode {
    switch (id) {
      case "metric_chips":
        return (
          <MetricChipsCard
            loading={loading}
            chips={chips}
            stepsCount={stepsCount}
            waterCount={waterCount}
            glucoseStatus={glucoseStatus}
            stepsCounterAnim={stepsCounterAnim}
            waterCounterAnim={waterCounterAnim}
            glucoseCounterAnim={glucoseCounterAnim}
            chipAnims={chipAnims}
            moodScaleAnim={moodScaleAnim}
            tourChipsRef={tourChipsRef}
            onQuickLog={(kind) => setQuickLogKind(kind)}
          />
        );

      case "wellness_score":
        return (
          <WellnessScoreCard
            dailySummary={dailySummary}
            wellnessHistory={wellnessHistory}
            onPress={() => setScoreModalVisible(true)}
          />
        );

      case "trends_nav":
        return (
          <Pressable
            ref={tourTrendsRef}
            onPress={() => navigation.getParent()?.navigate("Insights")}
            accessibilityRole="button"
            accessibilityLabel="View Trends and Insights"
          >
            <ShadowCard size="card" bg={theme.violet.tint} accent={theme.violet.solid}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: FONT_SIZES.subheading, fontWeight: "900", letterSpacing: -0.5, color: theme.violet.fg }}>Trends & Insights</Text>
                  <Text style={{ color: theme.violet.sub, fontSize: FONT_SIZES.caption, lineHeight: 17, marginTop: 4, fontWeight: "600" }}>
                    See how sleep, spending & glucose relate to your mood
                  </Text>
                </View>
                <Ionicons name="stats-chart" size={28} color={theme.violet.sub} style={{ marginLeft: 12 }} />
              </View>
            </ShadowCard>
          </Pressable>
        );

      case "daily_summary":
        return (
          <View style={{ gap: 12 }}>
            <WhatChangedCard />
            <WhyMightThatBeCard />
          </View>
        );

      case "top_insight":
        return topInsight ? (
          <View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <Text style={{ fontSize: FONT_SIZES.micro, fontWeight: "800", letterSpacing: 0.8, color: theme.textSoft }}>TOP INSIGHT</Text>
              <Pressable onPress={() => navigation.getParent()?.navigate("Insights")} accessibilityRole="button">
                <Text style={{ fontSize: FONT_SIZES.caption, color: theme.teal.solid, fontWeight: "700" }}>See all →</Text>
              </Pressable>
            </View>
            <InsightCard
              insight={topInsight}
              compact
              onDismiss={async (id) => {
                try { await api.dismissInsight(id); } catch {}
                setTopInsight(null);
              }}
              onPin={handlePin}
              isPinned={pinnedIds.has(topInsight.id)}
            />
          </View>
        ) : null;

      case "timeline":
        return (
          <TimelineCard
            loading={loading}
            dayGlucose={dayGlucose}
            yesterdayGlucose={yesterdayGlucose}
            dayEvents={dayEvents}
            patternEvents={patternEvents}
            showAllEvents={showAllEvents}
            setShowAllEvents={setShowAllEvents}
            glucoseOutOfRange={glucoseOutOfRange}
            lastGlucoseVal={lastGlucoseVal}
            lastGlucoseReading={lastGlucoseReading}
            minVal={minVal}
            maxVal={maxVal}
            windowStart={windowStart}
            windowEnd={windowEnd}
            glucosePoints={glucosePoints}
            yesterdayPoints={yesterdayPoints}
            highBandY={highBandY}
            lowBandY={lowBandY}
            usableH={usableH}
            scrub={scrub}
            panResponder={panResponder}
            timelinePanResponder={timelinePanResponder}
            timelineScrubberX={timelineScrubberX}
            timelineScrubberTime={timelineScrubberTime}
            tourTimelineRef={tourTimelineRef}
            eventX={eventX}
            glucoseY={glucoseY}
            interpolateGlucose={interpolateGlucose}
          />
        );

      case "insights":
        return (
          <InsightsPreviewCard
            loading={loading}
            insights={insights}
            tourInsightsRef={tourInsightsRef}
          />
        );

      case "weekly_review":
        return (
          <WeeklyReviewCard
            loading={loading}
            showRecap={showRecap}
            recapDismissed={recapDismissed}
            setRecapDismissed={setRecapDismissed}
            digest={digest}
            glucoseAvg={glucoseAvg}
            onShowDigest={() => setShowDigest(true)}
          />
        );

      case "mood_pattern":
        return (
          <MoodPatternCard
            weeklyData={weeklyData}
            correlation={correlation}
            setCorrelation={setCorrelation}
          />
        );

      case "cross_metric":
        return (
          <CrossMetricCard crossMetricData={crossMetricData} />
        );

      case "monthly_review":
        return (
          <MonthlyReviewCard
            isFirstWeekOfMonth={isFirstWeekOfMonth}
            monthlyReviewDismissed={monthlyReviewDismissed}
            setMonthlyReviewDismissed={setMonthlyReviewDismissed}
            monthlyReview={monthlyReview}
            navigation={navigation}
          />
        );

      default:
        return null;
    }
  }

  return (
    <View style={{ flex: 1 }}>
    <LinearGradient colors={[theme.page, theme.gradientEnd]} style={{ flex: 1 }}>
    <ScreenBackground pageId="overview" />
    <ScrollView
      ref={scrollViewRef}
      style={{ backgroundColor: "transparent" }}
      contentContainerStyle={[{ padding: 16, gap: 12, paddingBottom: 40 }, tourPadding > 0 && { paddingBottom: tourPadding }]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={theme.teal.bar}
          colors={[theme.teal.bar]}
        />
      }
      accessibilityLabel="Today dashboard"
      scrollEventThrottle={16}
      onScroll={(e) => { scrollOffsetRef.current = e.nativeEvent.contentOffset.y; }}
    >
      {refreshing && (
        <View style={{ alignItems: "center", paddingVertical: 6 }}>
          <Animated.View style={{
            width: 38, height: 38, borderRadius: 19, overflow: "hidden",
            borderWidth: 2, borderColor: theme.ink,
            transform: [{ rotate: refreshSpinAnim.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }) }],
          }}>
            <View style={{ flexDirection: "row", flex: 1 }}>
              <View style={{ flex: 1, backgroundColor: theme.teal.solid }} />
              <View style={{ flex: 1, backgroundColor: theme.coral.solid }} />
            </View>
            <View style={{ flexDirection: "row", flex: 1 }}>
              <View style={{ flex: 1, backgroundColor: theme.berry.solid }} />
              <View style={{ flex: 1, backgroundColor: theme.purple.solid }} />
            </View>
          </Animated.View>
        </View>
      )}
      {showTooltip && (
        <TooltipBubble
          message="Your daily wellness snapshot — mood, glucose, sleep, steps, and spending at a glance. Tap any section to log or explore. The score at the top reflects your overall day."
          onDismiss={() => setShowTooltip(false)}
        />
      )}

      {/* ── 1. Header ── */}
      <HeaderCard
        allStreaks={allStreaks}
        weeklyData={weeklyData}
        loading={loading}
        dailySummary={dailySummary}
        userName={userName}
        greetingOpacity={greetingOpacity}
        tourHeaderRef={tourHeaderRef}
        navigation={navigation}
        onEditLayout={() => setShowEditor(true)}
      />

      {/* ── Fasting Timer ── */}
      <FastingTimerCard />

      {/* ── Mood check-in modal (auto-shown at period start) ── */}
      <MoodCheckInModal
        visible={showMoodModal && !showMoodSheet}
        period={currentBucket as MoodPeriod}
        onDismiss={() => setShowMoodModal(false)}
        onSubmitted={() => { setShowMoodModal(false); load(); }}
      />

      {/* ── Mood page sheet (tap MOOD chip) ── */}
      <MoodPageSheet
        visible={showMoodSheet}
        todayEntries={todayEntries}
        currentBucket={currentBucket as MoodPeriod}
        onDismiss={() => setShowMoodSheet(false)}
        onSubmitted={() => { setShowMoodSheet(false); load(); }}
      />

      {/* ── Skeleton shimmer ── */}
      {loading && (
        <View style={{ gap: 12 }}>
          <ShadowCard skeleton skeletonHeight={88} />
          <ShadowCard skeleton skeletonHeight={140} />
          <ShadowCard skeleton skeletonHeight={72} />
          <ShadowCard skeleton skeletonHeight={110} />
        </View>
      )}

      {/* ── Today section ── */}
      <Animated.View style={{ opacity: contentOpacity }}>
        {!loading && (
          <Text style={{ fontSize: 13, fontWeight: "600", color: theme.textSoft, marginBottom: 8 }}>{dashboardGreeting}</Text>
        )}

        {/* ── Pinned Insights ── */}
        {pinnedIds.size > 0 && allInsights.some(i => pinnedIds.has(i.id)) && (
          <View style={{ gap: 6, marginTop: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <ThemedIcon slot="ui.pin" size={10} />
              <Text style={{ fontSize: FONT_SIZES.micro, fontWeight: "800", letterSpacing: 0.8, color: theme.textSoft }}>PINNED INSIGHTS</Text>
            </View>
            {allInsights.filter(i => pinnedIds.has(i.id)).map(insight => (
              <InsightCard key={insight.id} insight={insight} onPin={handlePin} isPinned compact />
            ))}
          </View>
        )}

        {/* ── Dashboard cards in user-defined order ── */}
        {dashboardLayout.order
          .filter(id => !dashboardLayout.hidden.includes(id))
          .map((id, i) => {
            const node = renderCard(id);
            if (!node) return null;
            const anim = cardAnims[i] ?? cardAnims[cardAnims.length - 1];
            return (
              <Animated.View
                key={id}
                style={{
                  opacity: anim,
                  transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
                }}
              >
                <Pressable
                  onLongPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    setShowEditor(true);
                  }}
                  delayLongPress={400}
                  accessibilityHint="Long press to reorder dashboard sections"
                >
                  <View style={{ flexDirection: "row", justifyContent: "flex-end", alignItems: "center", paddingRight: 4, marginBottom: 2, opacity: 0.45 }}>
                    <Ionicons name="reorder-three-outline" size={16} color={theme.textSoft} />
                  </View>
                  {node}
                </Pressable>
              </Animated.View>
            );
          })}
      </Animated.View>
    </ScrollView>
    </LinearGradient>
    {milestoneMessage && (
      <MilestoneBanner
        message={milestoneMessage}
        onDismiss={() => setMilestoneMessage(null)}
      />
    )}
    <DashboardEditorModal
      visible={showEditor}
      layout={dashboardLayout}
      onSave={handleSaveLayout}
      onCancel={() => setShowEditor(false)}
    />
    <QuickLogSheet
      visible={quickLogKind !== null}
      kind={quickLogKind}
      onClose={() => setQuickLogKind(null)}
      onLogWater={quickLogWater}
      onLogMood={quickLogMood}
      onOpenDetail={(k) => {
        if (k === "steps") navigation.getParent()?.navigate("StepsDetail");
        else if (k === "sleep") navigation.getParent()?.navigate("SleepDetail");
        else if (k === "glucose") navigation.getParent()?.navigate("Health");
        else if (k === "meals") navigation.getParent()?.navigate("Meals");
      }}
    />
    <WellnessScoreModal
      visible={scoreModalVisible}
      onClose={() => setScoreModalVisible(false)}
      scores={dailySummary?.scores ?? null}
      date={dailySummary?.date ?? todayStr()}
    />
    <WeeklyDigestModal
      visible={showDigest}
      onClose={() => setShowDigest(false)}
      digest={digest}
      theme={theme}
    />
    <FeatureTour
      steps={HOME_TOUR}
      visible={showTour}
      onDone={() => setShowTour(false)}
      scrollRef={scrollViewRef}
      scrollY={scrollOffsetRef.current}
      onExtraPadding={setTourPadding}
    />
    <FeatureIntroSheet intro={homeIntro} visible={introVisible} onClose={dismissIntro} />
    </View>
  );
}
