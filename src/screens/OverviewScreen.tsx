import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { FeatureIntroSheet } from "../components/FeatureIntroSheet";
import { useFeatureIntro } from "../onboarding/useFeatureIntro";
import { findIntro } from "../onboarding/featureIntros";
import {
  ScrollView,
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  Dimensions,
  RefreshControl,
  PanResponder,
  AccessibilityInfo,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Svg, { Rect, Text as SvgText, Polyline, Circle, Line as SvgLine, Path, Defs, ClipPath } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useTheme } from "../theme/ThemeContext";
import { useReduceMotion } from "../hooks/useReduceMotion";
import { onSolid } from "../theme/colorUtils";
import { coloredShadow } from "../theme/styleUtils";
import { ShadowCard } from "../components/ShadowCard";
import { api } from "../api/client";
import { DailySummaryCard, scoreColor, scoreLabel, type DailySummaryData } from "../components/DailySummaryCard";
import { WellnessScoreModal } from "../components/WellnessScoreModal";
import { WhatChangedCard } from "../components/WhatChangedCard";
import { WhyMightThatBeCard } from "../components/WhyMightThatBeCard";
import { InsightCard, type Insight } from "../components/InsightCard";
import { toast, Msg } from "../lib/toast";
import { MoodCheckInModal, type MoodPeriod } from "../components/MoodCheckInModal";
import { MoodPageSheet } from "../components/MoodPageSheet";
import { MilestoneBanner } from "../components/MilestoneBanner";
import { checkMilestone, milestoneCopy } from "../utils/milestones";
import { resolveLayout, type DashboardLayout, type CardId } from "../constants/dashboardCards";
import { BUCKET_ORDER, BUCKET_LABEL, type MoodBucket } from "../constants";
import { TooltipBubble } from "../components/TooltipBubble";
import { hasSeenTooltip, markTooltipSeen } from "../utils/tooltipSeen";
import { DashboardEditorModal } from "../components/DashboardEditorModal";
import { FeatureTour, type TourStep } from "../components/FeatureTour";
import { useFocusEffect } from "@react-navigation/native";
import { fmtTime, fmtDayLabel, fmtSleep, todayStr } from "../utils/dateUtils";
import { computeTIR, weekGlucoseAvg, interpolateGlucose, glucoseY as glucoseYBase, eventX as eventXBase } from "../utils/glucoseMetrics";
import { maybeFireWeeklyDigest } from "../lib/smartNotifications";
import { getMetricPalette } from "../lib/metricColors";
import { QuickLogSheet, type QuickLogKind } from "../components/QuickLogSheet";
import { ConfettiBurst } from "../components/ConfettiBurst";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getFastStatus, startFast, stopFast, formatElapsed, FastStatus } from "../lib/fastingTimer";
import { ScreenBackground } from "../components/ScreenBackground";
import { ThemedIcon, moodScoreEmoji } from '../theme/iconRegistry';
import { ThemedSurface } from '../theme/pageTemplates';
import { WeeklyDigestModal } from "../components/WeeklyDigestModal";
import { getCached, setCached, invalidateCache } from "../utils/staleCache";
import { CountUpText } from "../components/CountUpText";
import { AnimatedProgressRing } from "../components/AnimatedProgressRing";
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
import {
  SkeletonBox,
  WaterDroplet,
  AnimatedCounterText,
  AnimatedChip,
  timeOfDayBucket,
  getGreeting,
  streakMotivationMessage,
  SCREEN_W,
  CHART_W,
  CHIP_W,
  WATER_GOAL,
  CHART_H,
  PAD_L,
  PAD_B,
  PAD_T,
  CORR_W,
  CORR_H,
  BAR_W,
  STEP,
  type JournalEntry,
  type WeeklyDay,
  type PatternEvent,
  type GlucoseReading,
  type DayEvent,
  type WeeklyDigest,
  type GlucoseStatus,
  type SleepStats,
  type Bucket,
  type ChipData,
} from "./overview/shared";

// ─── Screen-local helpers ─────────────────────────────────────────────────────
// (types, constants, and small components now live in ./overview/shared.tsx)

// Screen-local wrappers that bind chart constants to the generic util functions
function glucoseY(val: number, minVal: number, maxVal: number): number {
  return glucoseYBase(val, minVal, maxVal, CHART_H, PAD_T, PAD_B);
}

function eventX(t: number, windowStart: number, windowEnd: number): number {
  return eventXBase(t, windowStart, windowEnd, CHART_W, PAD_L);
}

function computeInsights(params: {
  dayGlucose: GlucoseReading[];
  weeklyData: WeeklyDay[];
  patternEvents: PatternEvent[];
  streak: number;
  stepsCount: number | null;
  sleepStats: SleepStats | null;
  digest: WeeklyDigest | null;
}): string[] {
  const { dayGlucose, weeklyData, patternEvents, streak, stepsCount, sleepStats, digest } = params;
  const insights: string[] = [];
  const hour = new Date().getHours();

  // Glucose steadiness vs weekly average
  if (dayGlucose.length >= 6 && digest) {
    const todayValues = dayGlucose.map(r => Number(r.mg_dl));
    const todayAvg = todayValues.reduce((s, v) => s + v, 0) / todayValues.length;
    const weeklyAvg = weekGlucoseAvg(digest.glucose_by_tod);
    if (weeklyAvg !== null) {
      const diff = todayAvg - weeklyAvg;
      if (Math.abs(diff) >= 12) {
        if (diff < 0) {
          insights.push(`Glucose is running ${Math.abs(Math.round(diff))} mg/dL lower than your weekly average today.`);
        } else {
          insights.push(`Glucose is running ${Math.round(diff)} mg/dL higher than your weekly average today.`);
        }
      } else {
        const variance = todayValues.reduce((s, v) => s + (v - todayAvg) ** 2, 0) / todayValues.length;
        if (Math.sqrt(variance) < 18) {
          insights.push("Your glucose has been steady today — smaller swings than usual.");
        }
      }
    }
  }

  // Sleep vs rolling average
  if (sleepStats && sleepStats.yesterday_seconds > 0 && sleepStats.seven_day_average_seconds > 0) {
    const diffSecs = sleepStats.yesterday_seconds - sleepStats.seven_day_average_seconds;
    const diffMins = Math.abs(Math.round(diffSecs / 60));
    if (diffMins >= 20) {
      if (diffSecs > 0) {
        insights.push(`You slept ${diffMins} min more than your recent average last night.`);
      } else {
        insights.push(`You got ${diffMins} min less sleep than your recent average last night.`);
      }
    }
  }

  // Meal timing — gentle observation, not prescriptive
  if (hour >= 13 && hour < 16) {
    const hasMiddayMeal = patternEvents.some(e => {
      if (e.type !== "meal") return false;
      const h = new Date(e.time).getHours();
      return h >= 11 && h < 15;
    });
    if (!hasMiddayMeal) {
      insights.push("No midday meal logged yet today.");
    }
  }

  // Streak
  if (streak >= 3) {
    insights.push(`${streak}-day logging streak — great consistency!`);
  }

  // Steps vs daily average
  if (stepsCount !== null && stepsCount > 0 && digest && digest.steps.last_week > 0) {
    const dailyAvg = Math.round(digest.steps.last_week / 7);
    if (dailyAvg > 0) {
      const pct = Math.round((stepsCount / dailyAvg) * 100);
      if (pct >= 70) {
        insights.push(`${stepsCount.toLocaleString()} steps so far — on pace with your weekly average.`);
      }
    }
  }

  return insights.slice(0, 4);
}

// ─── Component ───────────────────────────────────────────────────────────────

export function OverviewScreen() {
  const { theme, mode } = useTheme();
  const navigation = useNavigation<any>();
  const homeIntro = findIntro("home")!;
  const [introVisible, dismissIntro] = useFeatureIntro(homeIntro.key);
  const ink = theme.ink;
  const card = theme.card;
  const styles = useMemo(() => makeStyles(ink, card, theme.cardBorder, theme.teal.solid), [ink, card, theme.cardBorder, theme.teal.solid]);

  // Existing state
  const [todayEntries, setTodayEntries] = useState<JournalEntry[]>([]);
  const [weeklyData, setWeeklyData] = useState<WeeklyDay[]>([]);
  const [patternEvents, setPatternEvents] = useState<PatternEvent[]>([]);
  const [digest, setDigest] = useState<WeeklyDigest | null>(null);
  const [dayGlucose, setDayGlucose] = useState<GlucoseReading[]>([]);
  const [yesterdayGlucose, setYesterdayGlucose] = useState<GlucoseReading[]>([]);
  const [dayEvents, setDayEvents] = useState<DayEvent[]>([]);
  const [streak, setStreak] = useState(0);
  const [allStreaks, setAllStreaks] = useState<{ label: string; slot: string; count: number; color: (t: any) => string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [recapDismissed, setRecapDismissed] = useState(false);
  const [showAllEvents, setShowAllEvents] = useState(false);

  // New state for metric chips
  const [glucoseStatus, setGlucoseStatus] = useState<GlucoseStatus | null>(null);
  const [stepsCount, setStepsCount] = useState<number | null>(null);
  const [sleepStats, setSleepStats] = useState<SleepStats | null>(null);
  const [waterCount, setWaterCount] = useState<number>(0);
  const [todayMeals, setTodayMeals] = useState<any[]>([]);

  const [weekMoods, setWeekMoods] = useState<Array<{ date: string; score: number | null }>>([]);

  const [dailySummary, setDailySummary] = useState<DailySummaryData | null>(null);
  const [wellnessHistory, setWellnessHistory] = useState<{ date: string; overall_score: number | null }[]>([]);
  const [scoreModalVisible, setScoreModalVisible] = useState(false);
  const [topInsight, setTopInsight] = useState<Insight | null>(null);
  const [allInsights, setAllInsights] = useState<Insight[]>([]);
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const [tirPercent, setTirPercent] = useState<number | null>(null);

  // User display name (first name, cached + hydrated from api.me())
  const [userName, setUserName] = useState<string | null>(null);
  useEffect(() => {
    AsyncStorage.getItem("ripple_user_name").then((cached) => {
      if (cached) setUserName(cached);
    }).catch(() => {});
    api.me().then((me: any) => {
      const n: string | null = me?.name ?? null;
      const first = n ? n.split(" ")[0] : null;
      if (first) {
        setUserName(first);
        AsyncStorage.setItem("ripple_user_name", first).catch(() => {});
      }
    }).catch(() => {});
  }, []);

  // Mood modal state
  const [showMoodModal, setShowMoodModal] = useState(false);
  const [showMoodSheet, setShowMoodSheet] = useState(false);
  const [showDigest, setShowDigest] = useState(false);
  const moodModalShownKeyRef = useRef<string | null>(null);

  const [milestoneMessage, setMilestoneMessage] = useState<string | null>(null);
  const [dashboardLayout, setDashboardLayout] = useState<DashboardLayout>({ order: ["monthly_review","metric_chips","trends_nav","daily_summary","top_insight","timeline","insights","weekly_review","mood_pattern","cross_metric"], hidden: [] });
  const [showTooltip, setShowTooltip] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const [tourPadding, setTourPadding] = useState(0);

  // Monthly review card — only visible first 7 days of the month
  type MonthlyReviewData = {
    month: string;
    steps: { best_week: { start: string; total: number } | null; worst_week: { start: string; total: number } | null };
    spending: { total: number | null; prev_total: number | null };
    observation: string | null;
  };
  const [monthlyReview, setMonthlyReview] = useState<MonthlyReviewData | null>(null);
  const [monthlyReviewDismissed, setMonthlyReviewDismissed] = useState(false);
  const isFirstWeekOfMonth = new Date().getDate() <= 7;

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

  // Content crossfade — fades from 0→1 when loading finishes (Feature 15)
  const contentOpacity = useRef(new Animated.Value(0)).current;

  // Time-aware sub-greeting — computed once on mount (Feature 14)
  const dashboardGreeting = useMemo(function () {
    const hour = new Date().getHours();
    if (hour >= 5  && hour < 12) return "Good morning 🌅";
    if (hour >= 12 && hour < 17) return "Good afternoon ☀️";
    if (hour >= 17 && hour < 21) return "Good evening 🌆";
    return "Wind down 🌙";
  }, []);

  // Streak pills stagger-fade on mount / allStreaks change
  const streakAnim = useRef<Animated.Value[]>([]);

  // Streak scale-bounce anims — one per pill, for increment feedback
  const streakScaleAnims = useRef<Animated.Value[]>([]);
  // Track previous streak counts to detect increments
  const prevStreaksRef = useRef<typeof allStreaks>([]);
  const [confettiKeys, setConfettiKeys] = useState<Record<string, number>>({});
  const [quickLogKind, setQuickLogKind] = useState<QuickLogKind | null>(null);

  async function quickLogWater() {
    try {
      const metric = await api.getOrCreateWaterMetric();
      await api.logWater(metric.id);
      setWaterCount(c => c + 1);
      toast("Water logged 💧");
    } catch { toast(Msg.logWater, "error"); }
  }

  async function quickLogMood(score: number, label: string) {
    try {
      await api.logMoodMoment(score, label);
      toast("Mood logged");
    } catch { toast(Msg.logMood, "error"); }
  }

  // Number counter animations (0→1, interpolate to real value)
  const stepsCounterAnim = useRef(new Animated.Value(0)).current;
  const waterCounterAnim = useRef(new Animated.Value(0)).current;
  const glucoseCounterAnim = useRef(new Animated.Value(0)).current;
  // Correlation bar chart grow-on-mount — one scale (0→1) per bar column (up to 7 days)
  const corrBarAnims = useRef<Animated.Value[]>([]);
  const [corrBarScales, setCorrBarScales] = useState<number[]>([]);
  // Per-streak counter anims — rebuilt when allStreaks changes
  const streakCounterAnims = useRef<Animated.Value[]>([]);

  // Per-chip entrance stagger anims
  const chipAnims = useRef<Animated.Value[]>([]);

  // Mood emoji pop-in animation
  const moodScaleAnim = useRef(new Animated.Value(1)).current;
  const prevMoodRef = useRef("--");

  // Fasting pulse ring animation
  const refreshSpinAnim = useRef(new Animated.Value(0)).current;
  const refreshSpinLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  const fastPulseAnim = useRef(new Animated.Value(0.4)).current;
  const fastPulseLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  // Timeline scrubber
  const timelineScrubberX = useRef(0); // pixel offset from left of timeline
  const [timelineScrubberTime, setTimelineScrubberTime] = useState<string | null>(null);
  // Latest scrubber handlers live in refs (updated each render) so the
  // PanResponder — created once in useRef — never calls a stale closure over
  // patternEvents from the first render.
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

  // Stagger card entrance animations — one per slot in the layout order
  const CARD_COUNT = 9; // max slots in dashboardLayout
  const cardAnims = useRef(
    Array.from({ length: CARD_COUNT }, () => new Animated.Value(0))
  ).current;

  const HOME_TOUR: TourStep[] = [
    { ref: tourHeaderRef, title: "Your Home Screen", body: "Your daily wellness dashboard. Everything you track rolls up here. Tap the pencil icon to customize which sections appear." },
    { ref: tourChipsRef,  title: "Key Metrics",      body: "Glucose, steps, sleep, water, meals, and mood — all in one row. Tap the Mood chip to log how you're feeling right now." },
    { ref: tourTrendsRef, title: "Trends & Insights", body: "Tap here to open the Insights tab and explore patterns across all your data." },
    { ref: tourTimelineRef, title: "Today's Timeline", body: "Scrub the glucose chart with your finger to see exact readings. Meals, mood check-ins, and spending appear as markers so you can spot patterns." },
    { ref: tourInsightsRef, title: "Pattern Observations", body: "Observations generated from your data — descriptive only, never prescriptive. They show what happened, not what to do about it." },
  ];

  // Fasting timer
  const [fastingEnabled, setFastingEnabled] = useState(false);
  const [fastStatus, setFastStatus] = useState<FastStatus>({ active: false, startMs: null, elapsedMs: 0 });
  const fastTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Correlation toggle
  const [correlation, setCorrelation] = useState<"sleep" | "spend">("sleep");

  // Cross-metric correlation data
  const [crossMetricData, setCrossMetricData] = useState<{
    exercise: { with_avg: number | null; without_avg: number | null; with_count: number; without_count: number };
    sleep: { good_avg: number | null; poor_avg: number | null; good_count: number; poor_count: number };
    total_days: number;
  } | null>(null);

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

  // Timeline scrubber helpers — operate on patternEvents time range
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
    // Find nearest event
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

  const applyOverviewData = useCallback(function (data: {
    entries: JournalEntry[];
    weeklyArr: WeeklyDay[];
    patternEvents: PatternEvent[];
    dig: WeeklyDigest | null;
    mealStreak: number; moodStreak: number; stepsStreak: number; exerciseStreak: number; readingStreak: number; waterStreak: number; hobbyStreak: number;
    glucSt: GlucoseStatus | null;
    meals: any[];
    stepsVal: number | null;
    sleep: any;
    dse: any;
    activeInsights: Insight[];
    tirPct: number | null;
    dayGlucoseData: GlucoseReading[];
    dayEventsData: DayEvent[];
    yesterdayGlucoseData: GlucoseReading[];
    wCount: number;
  }) {
    setTodayEntries(data.entries);
    setWeeklyData(data.weeklyArr);
    setWeekMoods(data.weeklyArr.map(d => ({ date: d.date, score: d.avg_mood })));
    setPatternEvents(data.patternEvents);
    setDigest(data.dig);
    if (data.dig) {
      const dig = data.dig;
      api.getSettings()
        .then((s: any) => maybeFireWeeklyDigest(s?.smart_notifications?.weekly_digest_push?.enabled === true, dig))
        .catch(() => {});
    }
    setStreak(data.mealStreak);
    setAllStreaks([
      { label: "Meals",    slot: "screen.meals",          count: data.mealStreak,     color: (t: any) => t.teal.solid },
      { label: "Mood",     slot: "metric.mood",           count: data.moodStreak,     color: (t: any) => t.violet?.solid ?? t.purple.solid },
      { label: "Steps",    slot: "social.steps_streak",   count: data.stepsStreak,    color: (t: any) => t.teal.solid },
      { label: "Exercise", slot: "ui.gym",                count: data.exerciseStreak, color: (t: any) => t.coral.solid },
      { label: "Reading",  slot: "empty.books",           count: data.readingStreak,  color: (t: any) => t.amber.solid },
      { label: "Water",    slot: "screen.water",          count: data.waterStreak,    color: (t: any) => (t as any).blue?.solid ?? t.teal.solid },
      { label: "Hobbies",  slot: "screen.hobbies",        count: data.hobbyStreak,    color: (t: any) => t.coral.solid },
    ].filter(s => s.count >= 2));
    setGlucoseStatus(data.glucSt);
    setTodayMeals(data.meals);
    setStepsCount(data.stepsVal);
    setTirPercent(data.tirPct);
    setSleepStats(data.sleep ?? null);
    setWaterCount(data.wCount);
    setDailySummary(data.dse ?? null);
    setAllInsights(data.activeInsights);
    setTopInsight(data.activeInsights[0] ?? null);
    setDayGlucose(data.dayGlucoseData);
    setDayEvents(data.dayEventsData);
    setYesterdayGlucose(data.yesterdayGlucoseData);
  }, []);

  const load = useCallback(async function (force = false) {
    const today = todayStr();
    const cacheKey = `overview:main:${today}`;

    const cached = force ? null : getCached<{
      entries: JournalEntry[];
      weeklyArr: WeeklyDay[];
      patternEvents: PatternEvent[];
      dig: WeeklyDigest | null;
      mealStreak: number; moodStreak: number; stepsStreak: number; exerciseStreak: number; readingStreak: number; waterStreak: number; hobbyStreak: number;
      glucSt: GlucoseStatus | null;
      meals: any[];
      stepsVal: number | null;
      sleep: any;
      dse: any;
      activeInsights: Insight[];
      tirPct: number | null;
      dayGlucoseData: GlucoseReading[];
      dayEventsData: DayEvent[];
      yesterdayGlucoseData: GlucoseReading[];
      wCount: number;
    }>(cacheKey);

    if (cached) {
      applyOverviewData(cached);
      setLoading(false);
      return;
    }

    try {
      const dayMs = 24 * 60 * 60 * 1000;
      // One batched request replaces ~16 individual calls (see /api/dashboard)
      const dash: any = await api.dashboard(today);
      const entries = dash.journal_today;
      const weekly = dash.weekly_mood;
      const pattern = dash.pattern;
      const dig = dash.weekly_digest;
      const day = dash.day;
      const streakData = dash.streaks;
      const glucSt = dash.glucose_status;
      const meals = dash.meals;
      const steps = dash.steps;
      const sleep = dash.sleep_stats;
      const dse = dash.daily_summary;
      const insightsList = dash.insights;
      const yestGluc = dash.yesterday_glucose;
      const tirRes = dash.glucose_tir;
      const wCount = Number(dash.water?.count ?? 0);

      const mealStreak     = Number(streakData?.meal_streak     ?? 0);
      const moodStreak     = Number(streakData?.mood_streak     ?? 0);
      const stepsStreak    = Number(streakData?.steps_streak    ?? 0);
      const exerciseStreak = Number(streakData?.exercise_streak ?? 0);
      const readingStreak  = Number(streakData?.reading_streak  ?? 0);
      const waterStreak    = Number(streakData?.water_streak    ?? 0);
      const hobbyStreak    = Number(streakData?.hobby_streak    ?? 0);
      const stepsVal = steps?.steps ?? null;
      const weeklyArr: WeeklyDay[] = Array.isArray(weekly) ? weekly : [];
      const activeInsights: Insight[] = Array.isArray(insightsList) ? insightsList : [];
      const yestArray = Array.isArray(yestGluc) ? yestGluc : [];
      const yesterdayGlucoseData = yestArray.map((r: GlucoseReading) => ({
        ...r,
        recorded_at: new Date(new Date(r.recorded_at).getTime() + dayMs).toISOString(),
      }));

      const payload = {
        entries: Array.isArray(entries) ? entries : [],
        weeklyArr,
        patternEvents: Array.isArray(pattern) ? pattern : [],
        dig: dig ?? null,
        mealStreak, moodStreak, stepsStreak, exerciseStreak, readingStreak, waterStreak, hobbyStreak,
        glucSt,
        meals: Array.isArray(meals) ? meals : [],
        stepsVal,
        sleep,
        dse,
        activeInsights,
        tirPct: tirRes?.tir_percent ?? null,
        dayGlucoseData: day && Array.isArray(day.glucose) ? day.glucose : [],
        dayEventsData: day && Array.isArray(day.events) ? day.events : [],
        yesterdayGlucoseData,
        wCount,
      };

      setCached(cacheKey, payload);
      applyOverviewData(payload);

      // Milestone checks — fire at most one celebration per load
      const candidates = await Promise.all([
        stepsVal !== null ? checkMilestone("steps_daily", stepsVal) : null,
        mealStreak > 0 ? checkMilestone("meal_streak", mealStreak) : null,
        moodStreak > 0 ? checkMilestone("mood_streak", moodStreak) : null,
      ]);
      const winner = candidates.find(c => c?.isNew);
      if (winner) setMilestoneMessage(milestoneCopy(winner));

      api.crossMetric().then((cm: any) => { if (cm) setCrossMetricData(cm); }).catch(() => {});
    } catch {
      toast(Msg.loadData, "error", 5000, { label: "Retry", onPress: () => { load(true); } });
    } finally {
      setLoading(false);
    }
  }, [applyOverviewData]);

  async function handleRefresh() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRefreshing(true);
    invalidateCache(`overview:main:${todayStr()}`);
    try { await load(); } finally { setRefreshing(false); }
  }

  async function handleSaveLayout(newLayout: DashboardLayout) {
    setDashboardLayout(newLayout);
    setShowEditor(false);
    try {
      await api.patchSettings({ dashboard_layout: newLayout });
    } catch (_) {
      toast("Couldn't save your layout — it will reset next launch.", "error");
    }
  }

  // First focus uses the day cache for instant paint; later focuses force a
  // silent refetch so logs made on other tabs show up without a tab-switch lag.
  const hasFocusLoadedRef = useRef(false);
  useFocusEffect(useCallback(() => {
    load(hasFocusLoadedRef.current);
    hasFocusLoadedRef.current = true;
  }, [load]));

  // Content crossfade — animate opacity 0→1 when loading finishes (Feature 15)
  useEffect(function () {
    if (!loading) {
      Animated.timing(contentOpacity, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    } else {
      contentOpacity.setValue(0);
    }
  }, [loading]);

  // Fire stagger entrance when data finishes loading
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

  useEffect(function () {
    api.getSettings()
      .then(function (s: any) { setDashboardLayout(resolveLayout(s?.dashboard_layout)); })
      .catch(function () {});
    api.wellnessHistory(7)
      .then(function (r) { setWellnessHistory(r.history ?? []); })
      .catch(function () {});
  }, []);

  // Monthly review: lazy fetch + dismissal check — only runs during first 7 days of month
  useEffect(function () {
    if (!isFirstWeekOfMonth) return;
    const reviewMonth = (function () {
      const d = new Date();
      const y = d.getFullYear();
      const m = d.getMonth(); // current month 0-indexed
      const prev = new Date(y, m - 1, 1);
      return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
    })();
    const dismissKey = `ripple.monthlyReview.dismissed`;
    AsyncStorage.getItem(dismissKey).then(function (val) {
      if (val === reviewMonth) { setMonthlyReviewDismissed(true); return; }
      api.monthlyReview().then(setMonthlyReview).catch(function () {});
    }).catch(function () {
      api.monthlyReview().then(setMonthlyReview).catch(function () {});
    });
  }, [isFirstWeekOfMonth]);

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
    const anim = Animated.timing(greetingOpacity, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    });
    anim.start();
    return () => {
      anim.stop();
      greetingOpacity.setValue(0);
    };
  }, [greetingOpacity]));

  // Mood period helpers
  const entryPerPeriod: Partial<Record<Bucket, JournalEntry>> = {};
  for (const entry of todayEntries) {
    if (entry.entry_type === "moment") continue;
    const p = (entry.period ?? timeOfDayBucket(new Date(entry.logged_at))) as Bucket;
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

  // Fasting timer — load on focus, tick every minute while active
  useFocusEffect(useCallback(() => {
    let cancelled = false;
    AsyncStorage.getItem("fasting_timer_enabled").then((v) => { if (!cancelled) setFastingEnabled(v === "1"); }).catch(() => {});
    getFastStatus().then((s) => { if (!cancelled) setFastStatus(s); });
    const interval = setInterval(async () => {
      const s = await getFastStatus();
      if (!cancelled) setFastStatus(s);
    }, 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []));

  // Pinned insights — load on focus
  useFocusEffect(useCallback(() => {
    let cancelled = false;
    AsyncStorage.getItem("pinned_insight_ids").then((raw) => {
      if (!cancelled) {
        const ids: string[] = raw ? JSON.parse(raw) : [];
        setPinnedIds(new Set(ids));
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []));

  // Streak pills stagger-fade whenever allStreaks changes
  useEffect(function () {
    if (allStreaks.length === 0) return;
    // Rebuild the animated value array if length changed
    if (streakAnim.current.length !== allStreaks.length) {
      streakAnim.current = allStreaks.map(() => new Animated.Value(0));
    } else {
      streakAnim.current.forEach(v => v.setValue(0));
    }
    Animated.stagger(
      60,
      streakAnim.current.map(v =>
        Animated.timing(v, { toValue: 1, duration: 280, useNativeDriver: true })
      )
    ).start();
  }, [allStreaks]);

  // Streak scale-bounce — fire when a streak count increases
  useEffect(function () {
    if (allStreaks.length === 0) return;
    // Ensure scale anim array is sized correctly
    if (streakScaleAnims.current.length !== allStreaks.length) {
      streakScaleAnims.current = allStreaks.map(() => new Animated.Value(1));
    }
    const prev = prevStreaksRef.current;
    allStreaks.forEach((s, i) => {
      const prevEntry = prev.find(p => p.label === s.label);
      if (prevEntry && s.count > prevEntry.count) {
        // Increment detected — spring bounce + haptic + confetti
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setConfettiKeys(k => ({ ...k, [s.label]: (k[s.label] ?? 0) + 1 }));
        const scaleAnim = streakScaleAnims.current[i];
        if (scaleAnim) {
          scaleAnim.setValue(1);
          Animated.sequence([
            Animated.spring(scaleAnim, { toValue: 1.2, useNativeDriver: true, damping: 6, stiffness: 400 }),
            Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, damping: 10, stiffness: 300 }),
          ]).start();
        }
      }
    });
    prevStreaksRef.current = allStreaks;
  }, [allStreaks]);

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

  // Streak counter anims — rebuild when allStreaks changes
  useEffect(function () {
    if (allStreaks.length === 0) return;
    if (streakCounterAnims.current.length !== allStreaks.length) {
      streakCounterAnims.current = allStreaks.map(() => new Animated.Value(0));
    } else {
      streakCounterAnims.current.forEach(v => v.setValue(0));
    }
    Animated.stagger(
      80,
      streakCounterAnims.current.map(v =>
        Animated.timing(v, { toValue: 1, duration: 600, useNativeDriver: false })
      )
    ).start();
  }, [allStreaks]);

  // Correlation bar grow-on-mount — staggered per-bar animation when data loads or type changes
  useEffect(function () {
    const n = weeklyData.length;
    if (n === 0) return;
    // Rebuild anim array if size changed
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

  // Chip entrance stagger — fires when loading finishes and chips are ready
  useEffect(function () {
    if (loading) return;
    const count = 6; // chips array always has 6 entries
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

  // Mood emoji pop-in — spring bounce when mood data first appears
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

  // Fasting pulse ring — loop while fast is active
  useEffect(function () {
    if (fastPulseLoopRef.current) { fastPulseLoopRef.current.stop(); fastPulseLoopRef.current = null; }
    if (!fastStatus.active) { fastPulseAnim.setValue(0.4); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(fastPulseAnim, { toValue: 0.05, duration: 1000, useNativeDriver: true }),
        Animated.timing(fastPulseAnim, { toValue: 0.4,  duration: 1000, useNativeDriver: true }),
      ])
    );
    fastPulseLoopRef.current = loop;
    loop.start();
    return () => { loop.stop(); };
  }, [fastStatus.active]);

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

  async function handlePin(id: string, pinned: boolean) {
    setPinnedIds(prev => {
      const next = new Set(prev);
      if (pinned) next.add(id); else next.delete(id);
      AsyncStorage.setItem("pinned_insight_ids", JSON.stringify([...next])).catch(() => {});
      return next;
    });
    Haptics.selectionAsync();
    toast(pinned ? "Insight pinned." : "Insight unpinned.");
  }

  async function handleToggleFast() {
    if (fastStatus.active) {
      await stopFast();
    } else {
      await startFast();
    }
    const s = await getFastStatus();
    setFastStatus(s);
  }

  // Derived values
  const tir = computeTIR(dayGlucose);
  const lastGlucoseReading = dayGlucose.length > 0 ? dayGlucose[dayGlucose.length - 1] : null;
  const lastGlucoseVal = lastGlucoseReading ? Number(lastGlucoseReading.mg_dl) : null;
  const glucoseOutOfRange = lastGlucoseVal !== null && (lastGlucoseVal < 70 || lastGlucoseVal > 180);
  const insights = useMemo(() => computeInsights({
    dayGlucose, weeklyData, patternEvents, streak, stepsCount, sleepStats, digest,
  }), [dayGlucose, weeklyData, patternEvents, streak, stepsCount, sleepStats, digest]);

  // Glucose chart
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

  // Weekly recap (Monday only)
  const isWeekStart = new Date().getDay() === 1;
  const showRecap = isWeekStart && !recapDismissed && digest !== null;
  const glucoseAvg = digest ? weekGlucoseAvg(digest.glucose_by_tod) : null;

  // Date string for header
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  // ─── Metric chip data ─────────────────────────────────────────────────────

  const currentMoodEntry = entryPerPeriod[currentBucket];
  const chips: ChipData[] = [
    {
      label: "GLUCOSE",
      value: glucoseStatus?.hasData && glucoseStatus.mg_dl != null
        ? String(glucoseStatus.mg_dl) + (glucoseStatus.arrow ? " " + glucoseStatus.arrow : "")
        : "--",
      sub: tir !== null ? tir + "% in range" : "mg/dL",
      color: getMetricPalette("glucose", glucoseStatus?.hasData ? glucoseStatus.mg_dl ?? null : null, theme as any).border,
      icon: "pulse",
      slot: "metric.glucose",
      empty: !glucoseStatus?.hasData,
      tileId: "overview_glucose",
      quickLog: "glucose",
    },
    {
      label: "STEPS",
      value: stepsCount != null ? stepsCount.toLocaleString() : "--",
      sub: "today",
      color: theme.teal.solid,
      icon: "walk",
      slot: "metric.steps",
      empty: stepsCount === null,
      tileId: "overview_steps",
      quickLog: "steps",
    },
    {
      label: "SLEEP",
      value: sleepStats && sleepStats.yesterday_seconds > 0
        ? fmtSleep(sleepStats.yesterday_seconds)
        : "--",
      sub: "last night",
      color: theme.amber.solid,
      icon: "moon-outline",
      slot: "metric.sleep",
      empty: !sleepStats || sleepStats.yesterday_seconds === 0,
      tileId: "overview_sleep",
      quickLog: "sleep",
    },
    {
      label: "WATER",
      value: waterCount > 0 ? String(waterCount) : "--",
      sub: "glasses",
      color: theme.blue.solid,
      icon: "water-outline",
      slot: "metric.water",
      empty: waterCount === 0,
      tileId: "overview_water",
      quickLog: "water",
    },
    {
      label: "MEALS",
      value: todayMeals.length > 0 ? String(todayMeals.length) : "--",
      sub: "logged",
      color: theme.coral.solid,
      icon: "restaurant",
      empty: todayMeals.length === 0,
      quickLog: "meals",
    },
    {
      label: "MOOD",
      value: currentMoodEntry ? moodScoreEmoji(currentMoodEntry.mood_score) : "--",
      sub: currentMoodEntry?.mood_label ?? "not logged",
      color: theme.violet.solid,
      icon: "happy-outline",
      empty: !currentMoodEntry,
      onPress: () => setShowMoodSheet(true),
      tileId: "overview_mood",
      quickLog: "mood",
    },
  ];

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

      case "wellness_score": {
        const wsScores = dailySummary?.scores ?? null;
        const wsOverall = wsScores?.overall ?? null;
        // Merge history with today's live score so the sparkline includes today
        const todayD = todayStr();
        const histPts = wellnessHistory
          .filter(h => h.overall_score !== null && h.date !== todayD)
          .map(h => h.overall_score as number);
        if (wsOverall !== null) histPts.push(wsOverall);
        const wsColor = scoreColor(wsOverall, theme);
        const SPARK_W = 120, SPARK_H = 36;
        const sparkPoints = histPts.length >= 2
          ? histPts.map((v, i) => {
              const x = (i / (histPts.length - 1)) * SPARK_W;
              const y = SPARK_H - (Math.min(Math.max(v, 0), 100) / 100) * SPARK_H;
              return `${x.toFixed(1)},${y.toFixed(1)}`;
            }).join(" ")
          : null;
        return (
          <Pressable onPress={() => setScoreModalVisible(true)} accessibilityRole="button" accessibilityLabel="Wellness score details">
            <ShadowCard size="card" cardId="wellness_score">
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <AnimatedProgressRing
                    size={58}
                    strokeWidth={4}
                    progress={wsOverall !== null ? wsOverall / 100 : 0}
                    color={wsColor}
                    duration={500}
                  >
                    <CountUpText
                      value={wsOverall}
                      duration={450}
                      fallback="--"
                      style={{ fontSize: 22, fontWeight: "800", color: wsColor }}
                    />
                  </AnimatedProgressRing>
                  <View>
                    <Text style={[styles.cardTitle, { color: theme.textStrong, marginBottom: 2 }]}>Wellness score</Text>
                    <Text style={{ fontSize: 12, color: theme.textSoft }}>
                      {wsOverall !== null ? scoreLabel(wsOverall) + " · tap for breakdown" : "No data yet today"}
                    </Text>
                  </View>
                </View>
                {sparkPoints ? (
                  <Svg width={SPARK_W} height={SPARK_H}>
                    <Polyline points={sparkPoints} fill="none" stroke={wsColor} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                  </Svg>
                ) : null}
              </View>
            </ShadowCard>
          </Pressable>
        );
      }

      case "trends_nav":
        return (
          <Pressable
            ref={tourTrendsRef}
            onPress={() => navigation.getParent()?.navigate("Insights")}
            accessibilityRole="button"
            accessibilityLabel="View Trends and Insights"
          >
            <ShadowCard size="card" bg={theme.violet.tint} accent={theme.violet.solid} rotate={0.5}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardTitle, { color: theme.violet.fg }]}>Trends & Insights</Text>
                  <Text style={{ color: theme.violet.sub, fontSize: 12, lineHeight: 17, marginTop: 4, fontWeight: "600" }}>
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
            {dailySummary ? <DailySummaryCard data={dailySummary} /> : null}
            {/* Sits under the daily summary — same section slot, so hiding
                the daily-summary tile also hides this. No-ops until the
                user has ≥3 days logged in each of the two weeks compared. */}
            <WhatChangedCard />
            <WhyMightThatBeCard />
          </View>
        );

      case "top_insight":
        return topInsight ? (
          <View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <Text style={{ fontSize: 10, fontWeight: "800", letterSpacing: 0.8, color: theme.textSoft }}>TOP INSIGHT</Text>
              <Pressable onPress={() => navigation.getParent()?.navigate("Insights")} accessibilityRole="button">
                <Text style={{ fontSize: 11, color: theme.teal.solid, fontWeight: "700" }}>See all →</Text>
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
        return loading ? (
          <ShadowCard size="card">
            <SkeletonBox style={{ height: 18, width: "40%", marginBottom: 12 }} />
            <SkeletonBox style={{ height: 14, width: "90%", marginBottom: 8 }} />
            <SkeletonBox style={{ height: 14, width: "75%" }} />
          </ShadowCard>
        ) : insights.length > 0 ? (
          <View ref={tourInsightsRef}>
          <ShadowCard size="card" accent={theme.violet.solid} cardId="insights_preview">
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <View style={[styles.insightIcon, { backgroundColor: theme.violet.solid }]}>
                <Ionicons name="bulb-outline" size={14} color={onSolid(theme.violet.solid)} />
              </View>
              <Text style={[styles.cardTitle, { color: theme.textStrong }]}>Insights</Text>
            </View>
            {insights.map((obs, i) => (
              <View key={i} style={styles.insightRow}>
                <View style={[styles.insightDot, { backgroundColor: theme.violet.solid }]} />
                <Text style={{ color: theme.textStrong, fontSize: 13, lineHeight: 18, flex: 1, fontWeight: "600" }}>{obs}</Text>
              </View>
            ))}
          </ShadowCard>
          </View>
        ) : null;

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
            corrBarScales={corrBarScales}
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
      contentContainerStyle={[styles.content, tourPadding > 0 && { paddingBottom: tourPadding }]}
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
      <View ref={tourHeaderRef} style={styles.headerBlock}>
        <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
          <View style={{ flex: 1 }}>
            <Animated.View style={{ opacity: greetingOpacity }}>
              {(function () {
                const g = getGreeting();
                const hasImgOverride = !!(theme as any).iconOverrides?.[g.emojiSlot];
                return (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: hasImgOverride ? 10 : 6 }}>
                    <ThemedIcon slot={g.emojiSlot} size={hasImgOverride ? 56 : 24} />
                    <Text style={[styles.greeting, { color: theme.textStrong }]} accessibilityRole="header">
                      {g.text}{userName ? `, ${userName}` : ""}
                    </Text>
                  </View>
                );
              })()}
            </Animated.View>
            <Text style={[styles.dateText, { color: theme.textSoft }]}>{dateStr}</Text>
            {(function () {
              const overall = dailySummary?.scores?.overall ?? null;
              const topStreak = allStreaks.reduce((m, s) => Math.max(m, s.count), 0);
              if (overall === null && topStreak < 2) return null;
              const parts: string[] = [];
              if (overall !== null) parts.push(`Score ${overall}`);
              if (topStreak >= 2) parts.push(`${topStreak}-day streak 🔥`);
              return (
                <Text style={{ fontSize: 12, fontWeight: "700", color: scoreColor(overall, theme), marginTop: 2 }}>
                  {parts.join(" · ")}
                </Text>
              );
            })()}
          </View>
          <Pressable
            onPress={() => setShowEditor(true)}
            hitSlop={10}
            style={{ marginTop: 2 }}
            accessibilityLabel="Edit dashboard layout"
            accessibilityRole="button"
          >
            <Ionicons name="pencil-outline" size={19} color={theme.textSoft} />
          </Pressable>
        </View>

        {allStreaks.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
            <View style={{ flexDirection: "row", gap: 6, paddingRight: 4 }}>
              {allStreaks.map((s, index) => {
                const animVal = streakAnim.current[index] ?? new Animated.Value(1);
                const counterAnim = streakCounterAnims.current[index];
                const scaleAnim = streakScaleAnims.current[index] ?? new Animated.Value(1);
                const isFreeze = s.count > 0 && s.count % 7 === 0;
                return (
                  <Animated.View
                    key={s.label}
                    style={{
                      opacity: animVal,
                      transform: [
                        { translateY: animVal.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) },
                        { scale: scaleAnim },
                      ],
                    }}
                  >
                    <Pressable
                      onPress={() => {
                        Haptics.selectionAsync();
                        if (s.label === "Meals") navigation.getParent()?.navigate("Meals");
                        else if (s.label === "Steps") navigation.getParent()?.navigate("StepsDetail");
                        else if (s.label === "Exercise") navigation.getParent()?.navigate("Exercise");
                        else if (s.label === "Reading") navigation.getParent()?.navigate("Life");
                      }}
                      style={[
                        styles.streakPill,
                        { backgroundColor: isFreeze ? theme.blue.tint : s.color(theme) },
                        // Milestone styling: gold ring at 7+, brighter at 30+
                        s.count >= 30
                          ? { borderWidth: 2, borderColor: theme.amber.solid }
                          : s.count >= 7
                          ? { borderWidth: 1.5, borderColor: theme.amber.sub }
                          : null,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`${s.count} day ${s.label} streak`}
                    >
                      <ThemedIcon slot={s.slot} size={11} style={{ marginRight: 4 } as any} />
                      {counterAnim ? (
                        <AnimatedCounterText
                          animValue={counterAnim}
                          targetValue={s.count}
                          style={[styles.streakPillText, { color: isFreeze ? theme.blue.sub : onSolid(s.color(theme)) }]}
                          format={(v) => v + "d " + s.label.toUpperCase()}
                        />
                      ) : (
                        <Text style={[styles.streakPillText, { color: isFreeze ? theme.blue.sub : onSolid(s.color(theme)) }]}>
                          {s.count}d {s.label.toUpperCase()}
                        </Text>
                      )}
                      {isFreeze && (
                        <ThemedIcon slot="ui.freeze" size={10} style={{ position: "absolute", top: -4, right: -4 } as any} />
                      )}
                    </Pressable>
                    <ConfettiBurst burstKey={confettiKeys[s.label] ?? 0} />
                  </Animated.View>
                );
              })}
            </View>
          </ScrollView>
        ) : null}

        {/* Weekly activity summary — one-liner below streak pills */}
        {!loading && weeklyData.length > 0 && (() => {
          const moodDays = weeklyData.filter(d => d.avg_mood !== null).length;
          const activeDays = weeklyData.filter(d => d.avg_mood !== null || d.sleep_hours > 0 || d.total_spent > 0).length;
          if (activeDays === 0) return null;
          const topStreak = allStreaks.length > 0 ? allStreaks.reduce((best, s) => s.count > best.count ? s : best) : null;
          return (
            <Text style={{ fontSize: 11, color: theme.textSoft, marginTop: 8, fontWeight: "600" }}>
              {moodDays > 0 ? `${moodDays}/${weeklyData.length} mood days` : `${activeDays}/${weeklyData.length} active days`}
              {topStreak && topStreak.count >= 2 ? ` · ${topStreak.count}d ${topStreak.label.toLowerCase()} streak 🔥` : ""}
            </Text>
          );
        })()}
        {/* Motivational milestone message */}
        {!loading && allStreaks.length > 0 && (() => {
          const best = Math.max(...allStreaks.map(s => s.count));
          const msg = streakMotivationMessage(best);
          if (!msg) return null;
          return (
            <Text style={{ fontSize: 12, color: theme.teal.solid, marginTop: 5, fontWeight: "700" }}>{msg}</Text>
          );
        })()}
      </View>

      {/* ── Fasting Timer ── */}
      {fastingEnabled && <Pressable
        onPress={handleToggleFast}
        style={{
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: fastStatus.active ? theme.teal.tint : theme.card,
          borderWidth: 2,
          borderColor: fastStatus.active ? theme.teal.solid : theme.cardBorder,
          borderRadius: 18,
          paddingHorizontal: 14,
          paddingVertical: 10,
          gap: 10,
          overflow: "visible",
        }}
      >
        {/* Pulse ring — rendered first so it sits behind content */}
        {fastStatus.active && (
          <Animated.View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: -6,
              left: -6,
              right: -6,
              bottom: -6,
              borderRadius: 24,
              borderWidth: 2,
              borderColor: theme.amber.solid,
              opacity: fastPulseAnim,
            }}
          />
        )}
        {/* Fasting progress ring */}
        {(() => {
          const TARGET_MS = 16 * 3600_000;
          const pct = fastStatus.active ? Math.min(fastStatus.elapsedMs / TARGET_MS, 1) : 0;
          const R = 14;
          const CIRC = 2 * Math.PI * R;
          return (
            <View style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}>
              {fastStatus.active && (
                <Svg width={36} height={36} viewBox="0 0 36 36" style={{ position: "absolute" }}>
                  <Circle cx="18" cy="18" r={R} stroke={theme.cardBorder} strokeWidth="3" fill="none" />
                  <Circle
                    cx="18" cy="18" r={R}
                    stroke={theme.teal.solid}
                    strokeWidth="3"
                    fill="none"
                    strokeDasharray={`${CIRC}`}
                    strokeDashoffset={`${CIRC * (1 - pct)}`}
                    strokeLinecap="round"
                    rotation="-90"
                    origin="18, 18"
                  />
                </Svg>
              )}
              <Text style={{ fontSize: 18 }}>⏱️</Text>
            </View>
          );
        })()}
        <View style={{ flex: 1 }}>
          <Text style={{ color: fastStatus.active ? theme.teal.fg : theme.textStrong, fontWeight: "800", fontSize: 13 }}>
            {fastStatus.active ? "Fasting · " + formatElapsed(fastStatus.elapsedMs) : "Start a Fast"}
          </Text>
          {fastStatus.active ? (
            <Text style={{ color: theme.teal.sub, fontSize: 11, marginTop: 1 }}>Tap to end fast</Text>
          ) : (
            <Text style={{ color: theme.textSoft, fontSize: 11, marginTop: 1 }}>Notifications at 12h, 16h, 24h</Text>
          )}
        </View>
        <View style={{
          backgroundColor: fastStatus.active ? theme.teal.solid : theme.teal.tint,
          borderRadius: 12,
          paddingHorizontal: 10,
          paddingVertical: 4,
        }}>
          <Text style={{ color: fastStatus.active ? "#fff" : theme.teal.fg, fontWeight: "800", fontSize: 11 }}>
            {fastStatus.active ? "STOP" : "START"}
          </Text>
        </View>
      </Pressable>}

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

      {/* ── Skeleton shimmer — shown while initial data loads ── */}
      {loading && (
        <View style={{ gap: 12 }}>
          <ShadowCard skeleton skeletonHeight={88} />
          <ShadowCard skeleton skeletonHeight={140} />
          <ShadowCard skeleton skeletonHeight={72} />
          <ShadowCard skeleton skeletonHeight={110} />
        </View>
      )}

      {/* ── Today's Snapshot label + time-aware greeting (Features 14 & 15) ── */}
      <Animated.View style={{ opacity: contentOpacity }}>
        {!loading && (
          <>
            <Text style={{ fontSize: 13, fontWeight: "600", color: theme.textSoft, marginBottom: 2 }}>{dashboardGreeting}</Text>
            <Text style={{ fontSize: 28, fontWeight: "900", letterSpacing: 0.4, color: theme.textStrong }}>Today's Snapshot</Text>
            <View style={{ height: 1, backgroundColor: theme.cardBorder, marginTop: 10, marginBottom: 2 }} />
          </>
        )}

        {/* ── Pinned Insights ── */}
        {pinnedIds.size > 0 && allInsights.some(i => pinnedIds.has(i.id)) && (
          <View style={{ gap: 6, marginTop: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <ThemedIcon slot="ui.pin" size={10} />
              <Text style={{ fontSize: 10, fontWeight: "800", letterSpacing: 0.8, color: theme.textSoft }}>PINNED INSIGHTS</Text>
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
                  transform: [{
                    translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }),
                  }],
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
                  {/* Drag handle indicator — shown as a subtle row above each card */}
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

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(ink: string, card: string, border: string, teal: string = "#3FA0A6") {
  return StyleSheet.create({
    content: { padding: 16, gap: 12, paddingBottom: 40 },

    headerBlock: { marginBottom: 4 },
    greeting: { fontSize: 26, fontWeight: "900", letterSpacing: -0.8, marginBottom: 2 },
    dateText: { fontSize: 13, marginBottom: 8, fontWeight: "600" },
    streakPill: {
      flexDirection: "row",
      alignSelf: "flex-start",
      alignItems: "center",
      borderWidth: 2,
      borderColor: ink,
      borderRadius: 20,
      paddingHorizontal: 10,
      paddingVertical: 4,
      shadowColor: "rgba(60,40,20,0.1)",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.08,
      shadowRadius: 10,
      elevation: 2,
    },
    streakPillText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },

    card: {
      borderRadius: 22,
      borderWidth: 2,
      borderColor: border,
      padding: 14,
      ...coloredShadow(teal),
    },
    cardTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
    cardTitle: { fontSize: 19, fontWeight: "900", letterSpacing: -0.5 },

    dueNowPill: {
      borderWidth: 2,
      borderColor: ink,
      borderRadius: 20,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    dueNowText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },

    momentBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      borderWidth: 2,
      borderColor: ink,
      borderRadius: 20,
      paddingHorizontal: 8,
      paddingVertical: 4,
      shadowColor: "rgba(60,40,20,0.1)",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.08,
      shadowRadius: 10,
      elevation: 2,
    },
    momentBtnText: { fontSize: 9, fontWeight: "800", color: ink, letterSpacing: 0.4 },

    periodRow: { flexDirection: "row", gap: 6 },
    periodTile: {
      flex: 1,
      borderRadius: 16,
      paddingVertical: 8,
      alignItems: "center",
      gap: 1,
      shadowColor: "rgba(60,40,20,0.1)",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.08,
      shadowRadius: 10,
      elevation: 2,
    },
    periodLabel: { fontSize: 9, fontWeight: "800", color: ink, letterSpacing: 0.5 },

    pickerBox: {
      marginTop: 12,
      borderWidth: 2,
      borderColor: ink,
      borderRadius: 22,
      padding: 12,
      shadowColor: "rgba(60,40,20,0.1)",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.1,
      shadowRadius: 12,
      elevation: 3,
    },
    pickerTitle: { color: ink, fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 },
    moodOptionsRow: { flexDirection: "row", gap: 6, flexWrap: "wrap", marginBottom: 10 },
    moodTile: {
      flex: 1,
      minWidth: 56,
      borderRadius: 16,
      paddingVertical: 10,
      alignItems: "center",
      shadowColor: "rgba(60,40,20,0.1)",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.08,
      shadowRadius: 10,
      elevation: 2,
    },
    moodTileLabel: { fontSize: 9, fontWeight: "800", letterSpacing: 0.4 },
    noteInput: {
      borderWidth: 2,
      borderColor: ink,
      borderRadius: 16,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 13,
      marginBottom: 10,
      backgroundColor: card,
      shadowColor: "rgba(60,40,20,0.1)",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.08,
      shadowRadius: 10,
      elevation: 2,
    },
    pickerActions: { flexDirection: "row", gap: 8, justifyContent: "flex-end" },
    cancelBtn: {
      borderWidth: 2,
      borderColor: ink,
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 8,
      backgroundColor: card,
      shadowColor: "rgba(60,40,20,0.1)",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.08,
      shadowRadius: 10,
      elevation: 2,
    },
    cancelBtnText: { color: ink, fontSize: 11, fontWeight: "800", letterSpacing: 0.4 },
    logBtn: {
      borderRadius: 16,
      borderWidth: 2,
      borderColor: ink,
      paddingHorizontal: 20,
      paddingVertical: 8,
      minWidth: 60,
      alignItems: "center",
      shadowColor: "rgba(60,40,20,0.1)",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.08,
      shadowRadius: 10,
      elevation: 2,
    },
    logBtnText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.4 },

    // Insights
    insightIcon: {
      width: 26,
      height: 26,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: ink,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: "rgba(60,40,20,0.1)",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.08,
      shadowRadius: 10,
      elevation: 2,
    },
    insightRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 5 },
    insightDot: { width: 7, height: 7, borderRadius: 4, marginTop: 6, flexShrink: 0 },

  });
}
