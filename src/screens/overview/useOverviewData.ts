/**
 * overview/useOverviewData.ts
 * Data-loading hook for OverviewScreen.
 * Owns all server-state, API calls, cache, and milestone detection.
 * Extracted from OverviewScreen.tsx — no logic changes.
 */
import { useState, useCallback, useRef, useEffect } from "react";
import { useFocusEffect } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "../../api/client";
import { type DailySummaryData } from "../../components/DailySummaryCard";
import { type Insight } from "../../components/InsightCard";
import { toast, Msg } from "../../lib/toast";
import { checkMilestone, milestoneCopy } from "../../utils/milestones";
import { resolveLayout, type DashboardLayout } from "../../constants/dashboardCards";
import { maybeFireWeeklyDigest } from "../../lib/smartNotifications";
import { todayStr } from "../../utils/dateUtils";
import { getCached, setCached, invalidateCache } from "../../utils/staleCache";
import { timeOfDayBucket } from "./shared";
import type {
  JournalEntry,
  WeeklyDay,
  PatternEvent,
  GlucoseReading,
  DayEvent,
  WeeklyDigest,
  GlucoseStatus,
  SleepStats,
} from "./shared";

type MonthlyReviewData = {
  month: string;
  steps: { best_week: { start: string; total: number } | null; worst_week: { start: string; total: number } | null };
  spending: { total: number | null; prev_total: number | null };
  observation: string | null;
};

type StreakEntry = { label: string; slot: string; count: number; color: (t: any) => string };

export type OverviewData = {
  // Data state
  todayEntries: JournalEntry[];
  weeklyData: WeeklyDay[];
  patternEvents: PatternEvent[];
  digest: WeeklyDigest | null;
  dayGlucose: GlucoseReading[];
  yesterdayGlucose: GlucoseReading[];
  dayEvents: DayEvent[];
  streak: number;
  allStreaks: StreakEntry[];
  loading: boolean;
  refreshing: boolean;
  recapDismissed: boolean;
  setRecapDismissed: (v: boolean) => void;
  glucoseStatus: GlucoseStatus | null;
  stepsCount: number | null;
  sleepStats: SleepStats | null;
  waterCount: number;
  setWaterCount: (fn: (c: number) => number) => void;
  todayMeals: any[];
  weekMoods: Array<{ date: string; score: number | null }>;
  dailySummary: DailySummaryData | null;
  wellnessHistory: { date: string; overall_score: number | null }[];
  topInsight: Insight | null;
  setTopInsight: (v: Insight | null) => void;
  allInsights: Insight[];
  pinnedIds: Set<string>;
  tirPercent: number | null;
  crossMetricData: {
    exercise: { with_avg: number | null; without_avg: number | null; with_count: number; without_count: number };
    sleep: { good_avg: number | null; poor_avg: number | null; good_count: number; poor_count: number };
    total_days: number;
  } | null;
  monthlyReview: MonthlyReviewData | null;
  monthlyReviewDismissed: boolean;
  setMonthlyReviewDismissed: (v: boolean) => void;
  milestoneMessage: string | null;
  setMilestoneMessage: (v: string | null) => void;
  dashboardLayout: DashboardLayout;
  userName: string | null;
  // Actions
  load: (force?: boolean) => Promise<void>;
  handleRefresh: () => Promise<void>;
  handleSaveLayout: (layout: DashboardLayout) => Promise<void>;
  handlePin: (id: string, pinned: boolean) => Promise<void>;
};

export function useOverviewData(): OverviewData {
  const [todayEntries, setTodayEntries] = useState<JournalEntry[]>([]);
  const [weeklyData, setWeeklyData] = useState<WeeklyDay[]>([]);
  const [patternEvents, setPatternEvents] = useState<PatternEvent[]>([]);
  const [digest, setDigest] = useState<WeeklyDigest | null>(null);
  const [dayGlucose, setDayGlucose] = useState<GlucoseReading[]>([]);
  const [yesterdayGlucose, setYesterdayGlucose] = useState<GlucoseReading[]>([]);
  const [dayEvents, setDayEvents] = useState<DayEvent[]>([]);
  const [streak, setStreak] = useState(0);
  const [allStreaks, setAllStreaks] = useState<StreakEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [recapDismissed, setRecapDismissed] = useState(false);
  const [glucoseStatus, setGlucoseStatus] = useState<GlucoseStatus | null>(null);
  const [stepsCount, setStepsCount] = useState<number | null>(null);
  const [sleepStats, setSleepStats] = useState<SleepStats | null>(null);
  const [waterCount, setWaterCount] = useState<number>(0);
  const [todayMeals, setTodayMeals] = useState<any[]>([]);
  const [weekMoods, setWeekMoods] = useState<Array<{ date: string; score: number | null }>>([]);
  const [dailySummary, setDailySummary] = useState<DailySummaryData | null>(null);
  const [wellnessHistory, setWellnessHistory] = useState<{ date: string; overall_score: number | null }[]>([]);
  const [topInsight, setTopInsight] = useState<Insight | null>(null);
  const [allInsights, setAllInsights] = useState<Insight[]>([]);
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const [tirPercent, setTirPercent] = useState<number | null>(null);
  const [crossMetricData, setCrossMetricData] = useState<{
    exercise: { with_avg: number | null; without_avg: number | null; with_count: number; without_count: number };
    sleep: { good_avg: number | null; poor_avg: number | null; good_count: number; poor_count: number };
    total_days: number;
  } | null>(null);
  const [monthlyReview, setMonthlyReview] = useState<MonthlyReviewData | null>(null);
  const [monthlyReviewDismissed, setMonthlyReviewDismissed] = useState(false);
  const [milestoneMessage, setMilestoneMessage] = useState<string | null>(null);
  const [dashboardLayout, setDashboardLayout] = useState<DashboardLayout>({ order: ["monthly_review","metric_chips","trends_nav","daily_summary","top_insight","timeline","insights","weekly_review","mood_pattern","cross_metric"], hidden: [] });
  const [userName, setUserName] = useState<string | null>(null);

  const isFirstWeekOfMonth = new Date().getDate() <= 7;

  // User name — cached + hydrated from api.me()
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
    const { default: Haptics } = await import("expo-haptics");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRefreshing(true);
    invalidateCache(`overview:main:${todayStr()}`);
    try { await load(); } finally { setRefreshing(false); }
  }

  async function handleSaveLayout(newLayout: DashboardLayout) {
    setDashboardLayout(newLayout);
    try {
      await api.patchSettings({ dashboard_layout: newLayout });
    } catch (_) {
      toast("Couldn't save your layout — it will reset next launch.", "error");
    }
  }

  const hasFocusLoadedRef = useRef(false);
  useFocusEffect(useCallback(() => {
    load(hasFocusLoadedRef.current);
    hasFocusLoadedRef.current = true;
  }, [load]));

  useEffect(function () {
    api.getSettings()
      .then(function (s: any) { setDashboardLayout(resolveLayout(s?.dashboard_layout)); })
      .catch(function () {});
    api.wellnessHistory(7)
      .then(function (r) { setWellnessHistory(r.history ?? []); })
      .catch(function () {});
  }, []);

  useEffect(function () {
    if (!isFirstWeekOfMonth) return;
    const reviewMonth = (function () {
      const d = new Date();
      const y = d.getFullYear();
      const m = d.getMonth();
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

  async function handlePin(id: string, pinned: boolean) {
    const { default: Haptics } = await import("expo-haptics");
    setPinnedIds(prev => {
      const next = new Set(prev);
      if (pinned) next.add(id); else next.delete(id);
      AsyncStorage.setItem("pinned_insight_ids", JSON.stringify([...next])).catch(() => {});
      return next;
    });
    Haptics.selectionAsync();
    toast(pinned ? "Insight pinned." : "Insight unpinned.");
  }

  return {
    todayEntries,
    weeklyData,
    patternEvents,
    digest,
    dayGlucose,
    yesterdayGlucose,
    dayEvents,
    streak,
    allStreaks,
    loading,
    refreshing,
    recapDismissed,
    setRecapDismissed,
    glucoseStatus,
    stepsCount,
    sleepStats,
    waterCount,
    setWaterCount,
    todayMeals,
    weekMoods,
    dailySummary,
    wellnessHistory,
    topInsight,
    setTopInsight,
    allInsights,
    pinnedIds,
    tirPercent,
    crossMetricData,
    monthlyReview,
    monthlyReviewDismissed,
    setMonthlyReviewDismissed,
    milestoneMessage,
    setMilestoneMessage,
    dashboardLayout,
    userName,
    load,
    handleRefresh,
    handleSaveLayout,
    handlePin,
  };
}
