import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
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
  Alert,
  useWindowDimensions,
} from "react-native";
import Svg, { Circle } from "react-native-svg";
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

// ─── Local sub-components ─────────────────────────────────────────────────────

interface RingProps {
  score: number; // 0–100
  color: string;
  label: string;
  valueLabel: string;
}

function MiniRing({ score, color, label, valueLabel }: RingProps) {
  const { theme } = useTheme();
  const SIZE = 52;
  const STROKE = 4;
  const R = (SIZE - STROKE) / 2;
  const CIRC = 2 * Math.PI * R;
  const progress = CIRC * (1 - Math.min(100, Math.max(0, score)) / 100);
  return (
    <View style={{ alignItems: "center", gap: 4 }}>
      <View style={{ width: SIZE, height: SIZE }}>
        <Svg width={SIZE} height={SIZE}>
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            stroke={theme.cardBorder}
            strokeWidth={STROKE}
            fill="none"
          />
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            stroke={color}
            strokeWidth={STROKE}
            fill="none"
            strokeDasharray={`${CIRC}`}
            strokeDashoffset={progress}
            strokeLinecap="round"
            rotation="-90"
            origin={`${SIZE / 2}, ${SIZE / 2}`}
          />
        </Svg>
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 10, fontWeight: "800", color: theme.textStrong }}>{valueLabel}</Text>
        </View>
      </View>
      <Text style={{ fontSize: 10, fontWeight: "700", color: theme.textSoft }}>{label}</Text>
    </View>
  );
}

interface TodayAtAGlanceProps {
  sleepStats: { yesterday_seconds: number; seven_day_average_seconds: number } | null;
  stepsCount: number | null;
  waterCount: number;
}

function TodayAtAGlanceStrip({ sleepStats, stepsCount, waterCount }: TodayAtAGlanceProps) {
  const { theme } = useTheme();

  const sleepScore = sleepStats?.yesterday_seconds
    ? Math.min(100, Math.round((sleepStats.yesterday_seconds / (8 * 3600)) * 100))
    : 0;
  const sleepSecs = sleepStats?.yesterday_seconds ?? 0;
  const sleepH = Math.floor(sleepSecs / 3600);
  const sleepM = Math.floor((sleepSecs % 3600) / 60);
  const sleepLabel = sleepSecs > 0 ? `${sleepH}h${sleepM > 0 ? sleepM + "m" : ""}` : "—";

  const stepsScore = stepsCount !== null ? Math.min(100, Math.round((stepsCount / 8000) * 100)) : 0;
  const stepsLabel = stepsCount !== null ? stepsCount.toLocaleString() : "—";

  const waterScore = Math.min(100, Math.round((waterCount / 8) * 100));
  const waterLabel = `${waterCount}gl`;

  return (
    <View style={{
      flexDirection: "row",
      justifyContent: "space-around",
      alignItems: "flex-start",
      paddingVertical: 10,
      paddingHorizontal: 8,
      marginBottom: 4,
    }}>
      <MiniRing score={sleepScore} color={theme.amber?.solid ?? "#B88820"} label="Sleep" valueLabel={sleepLabel} />
      <MiniRing score={stepsScore} color={theme.teal.solid} label="Steps" valueLabel={stepsLabel} />
      <MiniRing score={waterScore} color={theme.blue.solid} label="Water" valueLabel={waterLabel} />
    </View>
  );
}

interface QuickWinChipsProps {
  waterCount: number;
  hasMoodToday: boolean;
  stepsCount: number | null;
  onLogWater: () => void;
  onLogMood: () => void;
  onNavigateExercise: () => void;
}

function QuickWinChips({ waterCount, hasMoodToday, stepsCount, onLogWater, onLogMood, onNavigateExercise }: QuickWinChipsProps) {
  const { theme } = useTheme();

  const chips: Array<{ label: string; onPress: () => void }> = [];
  if (waterCount < 4) chips.push({ label: "Drink water 💧", onPress: onLogWater });
  if (!hasMoodToday) chips.push({ label: "Log mood 😊", onPress: onLogMood });
  if (stepsCount !== null && stepsCount < 3000) chips.push({ label: "Take a walk 🚶", onPress: onNavigateExercise });

  if (chips.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ flexDirection: "row", gap: 8, paddingHorizontal: 2, paddingVertical: 4, marginBottom: 4 }}
    >
      {chips.map(function (chip) {
        return (
          <Pressable
            key={chip.label}
            onPress={chip.onPress}
            accessibilityRole="button"
            style={{
              borderRadius: 20,
              borderWidth: 1.5,
              borderColor: theme.cardBorder,
              backgroundColor: theme.card,
              paddingHorizontal: 14,
              paddingVertical: 7,
            }}
          >
            <Text style={{ fontSize: FONT_SIZES.caption, fontWeight: "700", color: theme.textStrong }}>
              {chip.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
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

  const [freezeStatus, setFreezeStatus] = useState<{ available: boolean; used_this_month: boolean; freeze_count_remaining: number } | null>(null);

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

  // Adaptive card ordering
  const [tapCounts, setTapCounts] = useState<Record<string, number>>({});
  const [adaptiveBannerVisible, setAdaptiveBannerVisible] = useState(false);

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

  // Minute-level tick so time-derived values (greeting, mood period bucket)
  // re-evaluate while the screen stays mounted.
  const [minuteTick, setMinuteTick] = useState(0);
  useEffect(function () {
    const id = setInterval(function () { setMinuteTick(function (t) { return t + 1; }); }, 60 * 1000);
    return function () { clearInterval(id); };
  }, []);

  // Time-aware sub-greeting — recomputed each minute + on focus
  const dashboardGreeting = useMemo(function () {
    const hour = new Date().getHours();
    if (hour >= 5  && hour < 12) return "Good morning 🌅";
    if (hour >= 12 && hour < 17) return "Good afternoon ☀️";
    if (hour >= 17 && hour < 21) return "Good evening 🌆";
    return "Wind down 🌙";
  }, [minuteTick]);

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

  // Stagger card entrance animations — safely larger than the dashboard
  // layout's card count (default order has 10 entries; see useOverviewData).
  const CARD_COUNT = 12;
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

  async function handleFreezeStreak() {
    Alert.alert(
      "Freeze Streak?",
      "Use your monthly streak freeze to protect this streak?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Freeze it",
          onPress: async () => {
            try {
              await api.freezeStreak("mood", todayStr());
              toast("Streak frozen! ❄️");
              setFreezeStatus(prev => prev ? { ...prev, available: false, used_this_month: true } : null);
            } catch (e: any) {
              toast(e?.message ?? "Could not freeze streak.", "error");
            }
          },
        },
      ]
    );
  }

  // ─── Adaptive ordering helpers ───────────────────────────────────────────────

  async function updateTapCount(cardId: string) {
    try {
      const raw = await AsyncStorage.getItem("ripple_card_tap_counts");
      const counts = raw ? JSON.parse(raw) : {};
      counts[cardId] = (counts[cardId] ?? 0) + 1;
      await AsyncStorage.setItem("ripple_card_tap_counts", JSON.stringify(counts));
      setTapCounts({ ...counts });
      // Check if banner should show
      const total = Object.values(counts as Record<string, number>).reduce((s, v) => s + v, 0);
      if (total >= 50) {
        const dismissed = await AsyncStorage.getItem("ripple_adaptive_order_dismissed");
        if (!dismissed) {
          const topId = Object.entries(counts as Record<string, number>).sort((a, b) => b[1] - a[1])[0]?.[0];
          const visibleOrder = dashboardLayout.order.filter(id => !dashboardLayout.hidden.includes(id));
          const topIdxInOrder = visibleOrder.indexOf(topId as any);
          if (topIdxInOrder > 2) {
            setAdaptiveBannerVisible(true);
          }
        }
      }
    } catch {}
  }

  function getMostTappedCardInfo(): { id: string; name: string } | null {
    const entries = Object.entries(tapCounts);
    if (entries.length === 0) return null;
    const [id] = entries.sort((a, b) => b[1] - a[1])[0];
    const card = (require("../constants/dashboardCards").DASHBOARD_CARDS as Array<{ id: string; label: string }>).find(c => c.id === id);
    return card ? { id, name: card.label } : null;
  }

  async function handleSuggestReorder() {
    const info = getMostTappedCardInfo();
    if (!info) return;
    const newOrder = [
      info.id as import("../constants/dashboardCards").CardId,
      ...dashboardLayout.order.filter(id => id !== info.id),
    ];
    const newLayout = { ...dashboardLayout, order: newOrder };
    await handleSaveLayout(newLayout);
    setAdaptiveBannerVisible(false);
    await AsyncStorage.setItem("ripple_adaptive_order_dismissed", "1");
  }

  async function dismissSuggestion() {
    setAdaptiveBannerVisible(false);
    try { await AsyncStorage.setItem("ripple_adaptive_order_dismissed", "1"); } catch {}
  }

  // ─── Effects ────────────────────────────────────────────────────────────────

  // Load tap counts and check adaptive banner on mount
  useEffect(function () {
    async function loadTapCounts() {
      try {
        const raw = await AsyncStorage.getItem("ripple_card_tap_counts");
        if (raw) {
          const counts = JSON.parse(raw);
          setTapCounts(counts);
          const total = Object.values(counts as Record<string, number>).reduce((s, v) => s + v, 0);
          if (total >= 50) {
            const dismissed = await AsyncStorage.getItem("ripple_adaptive_order_dismissed");
            if (!dismissed) {
              const topId = Object.entries(counts as Record<string, number>).sort((a, b) => b[1] - a[1])[0]?.[0];
              const visibleOrder = dashboardLayout.order.filter(id => !dashboardLayout.hidden.includes(id));
              if (visibleOrder.indexOf(topId as any) > 2) {
                setAdaptiveBannerVisible(true);
              }
            }
          }
        }
      } catch {}
    }
    loadTapCounts();
  }, []);

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
    // Fetch streak freeze status on focus
    api.getStreakFreezeStatus()
      .then(status => { if (!cancelled) setFreezeStatus(status); })
      .catch(() => {});
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
  }, [loading, todayEntries, currentBucket, minuteTick]);

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

  const adaptiveGreeting = useMemo(function () {
    if (sleepStats?.yesterday_seconds) {
      const h = Math.floor(sleepStats.yesterday_seconds / 3600);
      const m = Math.floor((sleepStats.yesterday_seconds % 3600) / 60);
      const label = h >= 7 ? "Great sleep last night" : h >= 5 ? "Light sleep last night" : "Tough night";
      return (`${label} · ${h}h ${m > 0 ? m + "m" : ""}`).trim();
    }
    if (stepsCount !== null && stepsCount > 0) {
      return `${stepsCount.toLocaleString()} steps so far today`;
    }
    return null;
  }, [sleepStats, stepsCount]);

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
            allInsights={allInsights}
            onSeeAll={() => navigation.getParent()?.navigate("Insights")}
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
      contentContainerStyle={[{ padding: 16, gap: 12, paddingBottom: 96 }, tourPadding > 0 && { paddingBottom: Math.max(tourPadding, 96) }]}
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
        freezeStatus={freezeStatus}
        onFreezeStreak={handleFreezeStreak}
        adaptiveGreeting={adaptiveGreeting}
      />

      {/* ── Today at a glance strip ── */}
      {!loading && (
        <TodayAtAGlanceStrip
          sleepStats={sleepStats}
          stepsCount={stepsCount}
          waterCount={waterCount}
        />
      )}

      {/* ── Quick-win action chips ── */}
      {!loading && (
        <QuickWinChips
          waterCount={waterCount}
          hasMoodToday={!!entryPerPeriod[currentBucket]}
          stepsCount={stepsCount}
          onLogWater={quickLogWater}
          onLogMood={() => setShowMoodModal(true)}
          onNavigateExercise={() => navigation.getParent()?.navigate("Exercise")}
        />
      )}

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

        {/* ── Adaptive reorder suggestion banner ── */}
        {adaptiveBannerVisible && (() => {
          const info = getMostTappedCardInfo();
          if (!info) return null;
          return (
            <View style={{ backgroundColor: theme.teal.bg, borderRadius: 12, padding: 12, flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <Ionicons name="bulb-outline" size={18} color={theme.teal.fg} />
              <Text style={{ flex: 1, fontSize: FONT_SIZES.caption, color: theme.teal.fg }}>
                {"You tap " + info.name + " most — want to move it to the top?"}
              </Text>
              <Pressable onPress={handleSuggestReorder} accessibilityRole="button">
                <Text style={{ fontSize: FONT_SIZES.label, color: theme.teal.solid, fontWeight: "800" }}>Move it</Text>
              </Pressable>
              <Pressable onPress={dismissSuggestion} hitSlop={14} accessibilityRole="button" accessibilityLabel="Dismiss suggestion">
                <Ionicons name="close" size={16} color={theme.teal.sub} />
              </Pressable>
            </View>
          );
        })()}

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
                  onPress={() => updateTapCount(id)}
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
