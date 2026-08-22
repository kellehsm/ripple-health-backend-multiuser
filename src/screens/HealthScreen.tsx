import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { ScrollView, View, Text, Pressable, StyleSheet, Platform, Alert, RefreshControl, Animated } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useFocusEffect } from "@react-navigation/core";
import { StaleSyncBanner } from "../components/StaleSyncBanner";
import { shouldNotifyStale, markStaleNotified } from "../utils/staleSyncState";
import * as Haptics from "expo-haptics";
import { Gesture } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";
import { useTheme } from "../theme/ThemeContext";
import { coloredShadow, layeredShadow } from "../theme/styleUtils";
import { Ionicons } from "@expo/vector-icons";
import { ThemedIcon } from "../theme/iconRegistry";
import { api } from "../api/client";

import { requestHealthPermissions, syncHealthData } from "../lib/healthConnect";
import { TooltipBubble } from "../components/TooltipBubble";
import { hasSeenTooltip, markTooltipSeen } from "../utils/tooltipSeen";
import {
  startForegroundService,
  stopForegroundService,
  isForegroundServiceRunning,
} from "../lib/foregroundService";
import * as IntentLauncher from "expo-intent-launcher";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ScreenBackground } from "../components/ScreenBackground";
import { type SleepStages } from "../lib/healthConnect";
import { getCached, setCached, invalidateCache } from "../utils/staleCache";
import { toast } from "../lib/toast";
import { MetricChipRow } from "./health/MetricChipRow";
import { GlucoseChartCard } from "./health/GlucoseChartCard";
import { HeartRateCard } from "./health/HeartRateCard";
import {
  buildPoints, formatSleepDuration, sumTodayLogs,
  SectionDivider,
  DEFAULT_WATER_GOAL, CHART_WIDTH, CARD_GAP,
  HALF_CARD_WIDTH, CHART_HEIGHT, PAD_LEFT, PAD_BOTTOM, PAD_TOP,
  type GlucoseReading, type HRReading, type GlucoseStatus,
} from "./health/healthScreenShared";

// Types, constants, and helpers moved to ./health/healthScreenShared.tsx

export function HealthScreen() {
  const themeCtx = useTheme();
  const theme = themeCtx.theme;
  const mode = themeCtx.mode;
  const ink = theme.ink;
  const card = theme.card;
  const styles = useMemo(() => makeStyles(ink, card, theme.teal.solid), [ink, card, theme.teal.solid]);

  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const scrollViewRef = useRef<ScrollView | null>(null);
  const sectionYRef = useRef<{ glucose: number | null; sleep: number | null }>({ glucose: null, sleep: null });
  const [rangeHours, setRangeHours] = useState(6);
  const [todayReadings, setTodayReadings] = useState<GlucoseReading[]>([]);
  const [yesterdayReadings, setYesterdayReadings] = useState<GlucoseReading[]>([]);
  const [status, setStatus] = useState<GlucoseStatus | null>(null);
  const [dexcomSyncing, setDexcomSyncing] = useState(false);
  const [dexcomSyncMsg, setDexcomSyncMsg] = useState<{ text: string; kind: "ok" | "warn" | "err" } | null>(null);
  const [loading, setLoading] = useState(true);
  const [waterMetricId, setWaterMetricId] = useState<string | null>(null);
  const [waterCount, setWaterCount] = useState<number | null>(null);
  const [waterStatLine, setWaterStatLine] = useState<string | null>(null);
  const [stepsCount, setStepsCount] = useState<number | null>(null);
  const [stepsWeekTotal, setStepsWeekTotal] = useState<number | null>(null);
  const [stepsMetricId, setStepsMetricId] = useState<string | null>(null);
  const [weekStepsStart, setWeekStepsStart] = useState(1);
  const [sleepDisplay, setSleepDisplay] = useState<string | null>(null);
  const [sleepStatLine, setSleepStatLine] = useState<string | null>(null);
  const [sleepAvgSecs, setSleepAvgSecs] = useState<number | null>(null);
  const [sleepWeekDays, setSleepWeekDays] = useState<{ date: string; seconds: number }[]>([]);
  const [weekAvgGlucose, setWeekAvgGlucose] = useState<number | null>(null);
  const [hrRangeHours, setHrRangeHours] = useState(6);
  const [hrReadings, setHrReadings] = useState<HRReading[]>([]);
  const [hr7DayReadings, setHr7DayReadings] = useState<HRReading[]>([]);
  const [hrLoading, setHrLoading] = useState(false);
  const [hcSyncing, setHcSyncing] = useState(false);
  const [hcResult, setHcResult] = useState<string | null>(null);
  const [chipsHydrated, setChipsHydrated] = useState(false);
  const [liveTracking, setLiveTracking] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [staleBannerMessage, setStaleBannerMessage] = useState<string | null>(null);
  const [waterGoal, setWaterGoal] = useState(DEFAULT_WATER_GOAL);
  const [sleepStages, setSleepStages] = useState<SleepStages | null>(null);
  const [sleepScore, setSleepScore] = useState<number | null>(null);
  const [stepGoal, setStepGoal] = useState(10000);
  const [showGoalNudge, setShowGoalNudge] = useState(false);
  const [mindStats, setMindStats] = useState<{ streak: number; week_minutes: number; total_sessions: number } | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);

  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const waterFlashAnim = useRef(new Animated.Value(0)).current;
  const waterCelebAnim = useRef(new Animated.Value(0)).current;
  const waterCountScaleAnim = useRef(new Animated.Value(1)).current;
  const prevWaterRef = useRef<number>(0);

  // Steps goal ring flash (Feature 12)
  const stepsGoalAnim = useRef(new Animated.Value(0)).current;
  const prevStepsRef = useRef<number | null>(null);
  const lastSyncTimeRef = useRef<number | null>(null);
  const [lastSyncMinutes, setLastSyncMinutes] = useState<number | null>(null);

  // Annotations
  type Annotation = { id: string; annotated_at: string; label: string };
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [annotationModalVisible, setAnnotationModalVisible] = useState(false);
  const [annotationLabel, setAnnotationLabel] = useState("");
  const [annotationSaving, setAnnotationSaving] = useState(false);
  const [activeAnnotation, setActiveAnnotation] = useState<Annotation | null>(null);

  // Glucose chart scrubbing
  const [scrubInfo, setScrubInfo] = useState<{
    px: number;
    time: string;
    todayVal: number | null;
    yestVal: number | null;
    delta: number | null;
  } | null>(null);
  // Ref holds latest chart data for the stable gesture callbacks
  const scrubCtx = useRef({
    todayReadings: [] as GlucoseReading[],
    yesterdayReadings: [] as GlucoseReading[],
    windowStart: 0,
    windowEnd: 0,
  });
  const lastSnappedRef = useRef<string | null>(null);
  const mindfulnessScale = useRef(new Animated.Value(1)).current;
  const entranceAnim = useRef(new Animated.Value(0)).current;
  // Per-card stagger — each card gets its own value, kicked off with 60ms offset.
  const chipEntranceAnim = useRef(new Animated.Value(0)).current;
  const mindfulnessEntranceAnim = useRef(new Animated.Value(0)).current;
  const glucoseEntranceAnim = useRef(new Animated.Value(0)).current;
  const bottomCardsEntranceAnim = useRef(new Animated.Value(0)).current;
  // Chart fade — briefly dips opacity when range changes so the swap is a smooth crossfade.
  const chartFadeAnim = useRef(new Animated.Value(1)).current;

  const loadStepsAndSleep = useCallback(async function (forceRefresh = false) {
    const _now = new Date();
    const today = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, "0")}-${String(_now.getDate()).padStart(2, "0")}`;
    const cacheKey = `health:stepsAndSleep:${today}`;

    if (!forceRefresh) {
      const cached = getCached<{
        stepsCount: number | null;
        stepsMetricId: string | null;
        stepsWeekTotal: number | null;
        weekStepsStart: number;
        sleepDisplay: string | null;
        sleepStatLine: string | null;
        sleepAvgSecs: number | null;
        sleepWeekDays: { date: string; seconds: number }[];
      }>(cacheKey);
      if (cached) {
        setStepsCount(cached.stepsCount);
        setStepsMetricId(cached.stepsMetricId);
        setStepsWeekTotal(cached.stepsWeekTotal);
        setWeekStepsStart(cached.weekStepsStart);
        setSleepDisplay(cached.sleepDisplay);
        setSleepStatLine(cached.sleepStatLine);
        if (cached.sleepAvgSecs !== null) setSleepAvgSecs(cached.sleepAvgSecs);
        setSleepWeekDays(cached.sleepWeekDays);
        // still load step goal from AsyncStorage (fast, local)
        try {
          const saved = await AsyncStorage.getItem("ripple_step_goal");
          if (saved) { setStepGoal(Number(saved)); setShowGoalNudge(false); }
          else {
            const dismissed = await AsyncStorage.getItem("ripple_step_goal_nudge_dismissed");
            setShowGoalNudge(dismissed !== "true");
          }
        } catch (_) {}
        return;
      }
    }

    let stepsCountVal: number | null = null;
    let stepsMetricIdVal: string | null = null;
    let stepsWeekTotalVal: number | null = null;
    let weekStepsStartVal = 1;
    let sleepDisplayVal: string | null = null;
    let sleepStatLineVal: string | null = null;
    let sleepAvgSecsVal: number | null = null;
    let sleepWeekDaysVal: { date: string; seconds: number }[] = [];

    await Promise.all([
      // Steps today — independent
      api.stepsToday(today)
        .then((s: any) => {
          stepsCountVal = s?.steps ?? null;
          setStepsCount(stepsCountVal);
          lastSyncTimeRef.current = Date.now();
          setLastSyncMinutes(0);
        })
        .catch((e: any) => { if (__DEV__) console.error("Failed to load steps", e); }),

      // Steps metric chain — getStepsMetric → getSettings → stepsWeeklyTotal (sequential internally)
      (async () => {
        try {
          const stepsList = await api.getStepsMetric();
          if (stepsList && stepsList.length > 0) {
            stepsMetricIdVal = stepsList[0].id;
            setStepsMetricId(stepsMetricIdVal);
            const settings = await api.getSettings().catch(() => null);
            weekStepsStartVal = settings?.week_start?.steps ?? 1;
            setWeekStepsStart(weekStepsStartVal);
            const weekly = await api.stepsWeeklyTotal(stepsList[0].id, weekStepsStartVal);
            stepsWeekTotalVal = weekly?.week_total ?? null;
            setStepsWeekTotal(stepsWeekTotalVal);
          }
        } catch (_) {}
      })(),

      // Sleep today — independent
      api.sleepToday(today)
        .then((session: any) => {
          if (session?.start_time && session?.end_time) {
            sleepDisplayVal = formatSleepDuration(session.start_time, session.end_time);
            setSleepDisplay(sleepDisplayVal);
          } else {
            setSleepDisplay(null);
          }
        })
        .catch((e: any) => { if (__DEV__) console.error("Failed to load sleep", e); }),

      // Sleep stats — independent
      api.sleepStats()
        .then((stats: any) => {
          const fmt = (s: number) => {
            const h = Math.floor(s / 3600);
            const m = Math.floor((s % 3600) / 60);
            return m > 0 ? h + "h " + m + "m" : h + "h";
          };
          const yest = stats?.yesterday_seconds > 0 ? fmt(stats.yesterday_seconds) : "--";
          const avg = stats?.seven_day_average_seconds > 0 ? fmt(stats.seven_day_average_seconds) : "--";
          sleepStatLineVal = "Yesterday: " + yest + " · 7d avg: " + avg;
          setSleepStatLine(sleepStatLineVal);
          if (stats?.seven_day_average_seconds > 0) {
            sleepAvgSecsVal = stats.seven_day_average_seconds;
            setSleepAvgSecs(sleepAvgSecsVal);
          }
          if (Array.isArray(stats?.week_days)) {
            sleepWeekDaysVal = stats.week_days;
            setSleepWeekDays(sleepWeekDaysVal);
          }
        })
        .catch((e: any) => { if (__DEV__) console.error("Failed to load sleep stats", e); }),

      // AsyncStorage reads — independent
      (async () => {
        try {
          const cachedStages = await AsyncStorage.getItem("ripple_sleep_stages");
          if (cachedStages) setSleepStages(JSON.parse(cachedStages));
        } catch (_) {}
      })(),
      (async () => {
        try {
          const saved = await AsyncStorage.getItem("ripple_step_goal");
          if (saved) {
            setStepGoal(Number(saved));
            setShowGoalNudge(false);
          } else {
            const dismissed = await AsyncStorage.getItem("ripple_step_goal_nudge_dismissed");
            setShowGoalNudge(dismissed !== "true");
          }
        } catch (_) {}
      })(),
    ]);

    setCached(cacheKey, {
      stepsCount: stepsCountVal,
      stepsMetricId: stepsMetricIdVal,
      stepsWeekTotal: stepsWeekTotalVal,
      weekStepsStart: weekStepsStartVal,
      sleepDisplay: sleepDisplayVal,
      sleepStatLine: sleepStatLineVal,
      sleepAvgSecs: sleepAvgSecsVal,
      sleepWeekDays: sleepWeekDaysVal,
    });
  }, []);

  // Load sleep score (from daily summary) + sleep insights (from insights endpoint)
  const loadSleepExtras = useCallback(async function () {
    try {
      const summary = await api.dailySummary();
      if (summary?.scores?.sleep != null) setSleepScore(Number(summary.scores.sleep));
    } catch (_) {}
  }, []);

  const loadWater = useCallback(async function (forceRefresh = false) {
    const today = new Date().toDateString();
    const cacheKey = `health:water:${today}`;
    if (!forceRefresh) {
      const cached = getCached<{ metricId: string; count: number; statLine: string | null }>(cacheKey);
      if (cached) {
        setWaterMetricId(cached.metricId);
        setWaterCount(cached.count);
        // Seed the previous-count ref so goal-celebration logic survives reopen
        prevWaterRef.current = cached.count;
        if (cached.statLine) setWaterStatLine(cached.statLine);
        return;
      }
    }
    try {
      const metric = await api.getOrCreateWaterMetric();
      setWaterMetricId(metric.id);
      const logs = await api.todaysWaterCount(metric.id);
      const count = sumTodayLogs(Array.isArray(logs) ? logs : []);
      setWaterCount(count);
      prevWaterRef.current = count;
      let statLine: string | null = null;
      try {
        const stats = await api.waterStats(metric.id);
        const yest = stats?.yesterday_total > 0 ? stats.yesterday_total + " glasses" : "--";
        const avg = stats?.seven_day_average > 0 ? Math.round(stats.seven_day_average) + " glasses" : "--";
        statLine = "Yesterday: " + yest + " · 7d avg: " + avg;
        setWaterStatLine(statLine);
      } catch (_) {}
      setCached(cacheKey, { metricId: metric.id, count, statLine });
    } catch (e) {
      if (__DEV__) console.error("Failed to load water data", e);
    }
  }, []);

  const loadHeartRate = useCallback(async function (hours: number) {
    const nowHour = new Date().toISOString().slice(0, 13); // hour-granularity bucket
    const cacheKey = `health:heartRate:${hours}h:${nowHour}`;
    const cached = getCached<{ readings: HRReading[]; sevenDay: HRReading[] }>(cacheKey);
    if (cached) {
      setHrReadings(cached.readings);
      setHr7DayReadings(cached.sevenDay);
      return;
    }
    setHrLoading(true);
    try {
      const now = new Date();
      const start = new Date(now.getTime() - hours * 60 * 60 * 1000);
      const readings = await api.heartRateRange(start.toISOString(), now.toISOString());
      const readingList = Array.isArray(readings) ? readings : [];
      setHrReadings(readingList);
      // Fetch 7-day data for trend comparison (independent of selected window)
      const sevenDayStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      api.heartRateRange(sevenDayStart.toISOString(), now.toISOString())
        .then(function (d) {
          const sevenDay = Array.isArray(d) ? d : [];
          setHr7DayReadings(sevenDay);
          setCached(cacheKey, { readings: readingList, sevenDay });
        })
        .catch(function () {
          setCached(cacheKey, { readings: readingList, sevenDay: [] });
        });
    } catch (e) {
      if (__DEV__) console.error("Failed to load heart rate", e);
    } finally {
      setHrLoading(false);
    }
  }, []);

  async function handleRefresh() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRefreshing(true);
    try {
      // Sync Health Connect FIRST so the forced reloads below pick up the fresh
      // wearable data — running them in parallel let the sync's internal cached
      // load race (and overwrite) the forced load's results.
      if (Platform.OS === "android") await handleHealthConnectSync();
      await Promise.all([load(rangeHours), loadWater(true), loadStepsAndSleep(true), loadHeartRate(hrRangeHours), loadSleepExtras()]);
      setLastRefreshed(new Date());
    } finally {
      setRefreshing(false);
    }
  }

  async function handleLogWater() {
    if (!waterMetricId) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      toast("Water tracking is still loading — try again in a moment.");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    waterFlashAnim.setValue(0.55);
    Animated.timing(waterFlashAnim, { toValue: 0, duration: 500, useNativeDriver: true }).start();
    // Optimistic: bump the count instantly, reconcile with the server after
    const prevCount = prevWaterRef.current;
    const wasAtGoal = prevCount >= waterGoal;
    const optimistic = prevCount + 1;
    prevWaterRef.current = optimistic;
    setWaterCount(optimistic);
    // Pop the count number on each log
    Animated.sequence([
      Animated.spring(waterCountScaleAnim, { toValue: 1.35, useNativeDriver: true, speed: 40, bounciness: 10 }),
      Animated.spring(waterCountScaleAnim, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 6 }),
    ]).start();
    if (optimistic >= waterGoal && !wasAtGoal) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      waterCelebAnim.setValue(0);
      Animated.sequence([
        Animated.timing(waterCelebAnim, { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.delay(1200),
        Animated.timing(waterCelebAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]).start();
    }
    try {
      await api.logWater(waterMetricId);
      invalidateCache(`health:water:${new Date().toDateString()}`);
      const logs = await api.todaysWaterCount(waterMetricId);
      const newCount = sumTodayLogs(Array.isArray(logs) ? logs : []);
      prevWaterRef.current = newCount;
      setWaterCount(newCount);
    } catch (e) {
      if (__DEV__) console.error("Failed to log water", e);
      prevWaterRef.current = prevCount;
      setWaterCount(prevCount);
      toast("Couldn't log that glass of water. Try again.", "error");
    }
  }

  async function handleToggleLiveTracking() {
    try {
      if (liveTracking) {
        await stopForegroundService();
        setLiveTracking(false);
      } else {
        const granted = await requestHealthPermissions();
        if (!granted) {
          Alert.alert("Permission required", "Health Connect permission is needed for live tracking.");
          return;
        }
        await startForegroundService();
        setLiveTracking(true);
      }
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to toggle live tracking.");
    }
  }

  function handleBatteryOptimization() {
    IntentLauncher.startActivityAsync(
      "android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS",
      { data: "package:com.kellehs.wellness" }
    ).catch(() => {
      Alert.alert("Unavailable", "Could not open battery settings on this device.");
    });
  }

  async function handleHealthConnectSync() {
    setHcSyncing(true);
    setHcResult(null);
    try {
      const granted = await requestHealthPermissions();
      if (!granted) {
        setHcResult("Permission denied by Health Connect.");
        return;
      }
      const result = await syncHealthData();
      const parts: string[] = [];
      if (result.steps !== null) parts.push(result.steps.toLocaleString() + " steps");
      if (result.sleepHours !== null) parts.push(result.sleepHours + "h sleep");
      if (result.heartRate !== null) parts.push(result.heartRate + " bpm");
      if (result.errors.length > 0) parts.push("errors: " + result.errors.join(", "));
      setHcResult(parts.length > 0 ? "Synced: " + parts.join(" · ") : "No new data found.");
      if (result.sleepStages) {
        setSleepStages(result.sleepStages);
        AsyncStorage.setItem("ripple_sleep_stages", JSON.stringify(result.sleepStages)).catch(() => {});
      }
      // Note: the caller (handleRefresh) runs a forced loadStepsAndSleep(true)
      // right after this sync — a cached reload here would race/overwrite it.
    } catch (e: any) {
      setHcResult("Sync failed: " + (e?.message ?? "unknown error"));
    } finally {
      setHcSyncing(false);
    }
  }

  const load = useCallback(function (hours: number) {
    setLoading(true);
    const now = Date.now();
    const windowMs = hours * 60 * 60 * 1000;
    const dayMs = 24 * 60 * 60 * 1000;

    const todayStart = new Date(now - windowMs).toISOString();
    const todayEnd = new Date(now).toISOString();
    const yestStart = new Date(now - windowMs - dayMs).toISOString();
    const yestEnd = new Date(now - dayMs).toISOString();

    const weekGlucoseStart = new Date(now - 7 * dayMs).toISOString();
    // Per-fetch fallbacks: one failed call shouldn't blank the whole panel
    Promise.all([
      api.glucoseRange(todayStart, todayEnd).catch(() => []),
      api.glucoseRange(yestStart, yestEnd).catch(() => []),
      api.glucoseStatus().catch(() => null),
      api.glucoseRange(weekGlucoseStart, todayEnd).catch(() => []),
    ])
      .then(function (results) {
        const todayData = results[0];
        const yestData = results[1];
        const statusData = results[2];
        const weekData = results[3];

        setTodayReadings(Array.isArray(todayData) ? todayData : []);
        const yestArray = Array.isArray(yestData) ? yestData : [];
        setYesterdayReadings(
          yestArray.map(function (r: GlucoseReading) {
            return Object.assign({}, r, {
              recorded_at: new Date(new Date(r.recorded_at).getTime() + dayMs).toISOString(),
            });
          })
        );
        setStatus(statusData);
        if (Array.isArray(weekData) && weekData.length > 0) {
          const sum = weekData.reduce((acc: number, r: GlucoseReading) => acc + Number(r.mg_dl), 0);
          setWeekAvgGlucose(Math.round(sum / weekData.length));
        }
      })
      .catch(function (e) {
        if (__DEV__) console.error("Failed to load glucose data", e);
      })
      .finally(function () {
        setLoading(false);
      });
  }, []);

  // Force a Dexcom Share sync from the glucose card. Maps backend error strings
  // to actionable copy: rejected credentials point at Settings, empty responses
  // point at the phone (Share app not uploading). Auto-dismisses after 4.5s.
  const handleDexcomForceSync = useCallback(async function () {
    if (dexcomSyncing) return;
    setDexcomSyncing(true);
    setDexcomSyncMsg(null);
    Haptics.selectionAsync().catch(() => {});
    try {
      const res: any = await api.glucoseSyncShare();
      const inserted = Number(res?.inserted ?? 0);
      if (inserted > 0) {
        setDexcomSyncMsg({ text: `Synced — ${inserted} new reading${inserted === 1 ? "" : "s"}`, kind: "ok" });
      } else {
        setDexcomSyncMsg({ text: "Synced — no new readings yet", kind: "warn" });
      }
      load(rangeHours);
    } catch (e: any) {
      const raw = String(e?.message ?? e ?? "");
      let text = "Sync failed — tap to retry";
      if (/credentials not configured/i.test(raw)) {
        text = "Not configured — open Settings → Dexcom";
      } else if (/rejected|verify.*(password|account|username)/i.test(raw)) {
        text = "Password rejected — update in Settings → Dexcom";
      } else if (/empty response|Share is enabled/i.test(raw)) {
        text = "Dexcom app isn't sharing — check phone";
      } else if (/session still invalid/i.test(raw)) {
        text = "Credentials rejected — update in Settings → Dexcom";
      }
      setDexcomSyncMsg({ text, kind: "err" });
    } finally {
      setDexcomSyncing(false);
      setTimeout(() => setDexcomSyncMsg(null), 4500);
    }
  }, [dexcomSyncing, load, rangeHours]);

  // Stable scrub callbacks — read fresh data from scrubCtx ref, never stale
  const onScrub = useCallback(function (x: number) {
    const ctx = scrubCtx.current;
    if (ctx.todayReadings.length === 0) return;

    const clampedX = Math.max(PAD_LEFT, Math.min(x, CHART_WIDTH));
    const frac = (clampedX - PAD_LEFT) / (CHART_WIDTH - PAD_LEFT);
    const t = ctx.windowStart + frac * (ctx.windowEnd - ctx.windowStart);
    const windowMs = ctx.windowEnd - ctx.windowStart;
    const usableW = CHART_WIDTH - PAD_LEFT;

    let bestToday: GlucoseReading | null = null;
    let bestTodayDiff = Infinity;
    let snappedPx = clampedX;
    for (const r of ctx.todayReadings) {
      const rt = new Date(r.recorded_at).getTime();
      const diff = Math.abs(rt - t);
      if (diff < bestTodayDiff) {
        bestTodayDiff = diff;
        bestToday = r;
        snappedPx = PAD_LEFT + ((rt - ctx.windowStart) / windowMs) * usableW;
      }
    }

    let bestYest: GlucoseReading | null = null;
    let bestYestDiff = Infinity;
    for (const r of ctx.yesterdayReadings) {
      const rt = new Date(r.recorded_at).getTime(); // already shifted +24h
      const diff = Math.abs(rt - t);
      if (diff < bestYestDiff) {
        bestYestDiff = diff;
        bestYest = r;
      }
    }

    const todayVal = bestToday ? Number(bestToday.mg_dl) : null;
    const yestVal = bestYest ? Number(bestYest.mg_dl) : null;
    const delta = todayVal !== null && yestVal !== null ? todayVal - yestVal : null;

    const d = bestToday ? new Date(bestToday.recorded_at) : new Date();
    const h = d.getHours(), m = d.getMinutes();
    const h12 = h % 12 || 12;
    const timeStr = `${h12}:${String(m).padStart(2, "0")}${h >= 12 ? "pm" : "am"}`;

    if (bestToday && bestToday.recorded_at !== lastSnappedRef.current) {
      lastSnappedRef.current = bestToday.recorded_at;
      Haptics.selectionAsync().catch(() => {});
    }

    setScrubInfo({ px: snappedPx, time: timeStr, todayVal, yestVal, delta });
  }, []);

  const onScrubEnd = useCallback(function () {
    setScrubInfo(null);
    lastSnappedRef.current = null;
  }, []);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-10, 10])
        .failOffsetY([-5, 5])
        .onUpdate((e) => { runOnJS(onScrub)(e.x); })
        .onEnd(() => { runOnJS(onScrubEnd)(); }),
    [onScrub, onScrubEnd]
  );

  useFocusEffect(useCallback(function () {
    let cancelled = false;
    api.mindfulnessStats().then((s: any) => { if (!cancelled && s) setMindStats(s); }).catch(() => {});
    hasSeenTooltip("health").then(seen => {
      if (!cancelled && !seen) {
        setShowTooltip(true);
        markTooltipSeen("health");
      }
    });
    api.syncStatus()
      .then(async function (s: any) {
        const now = Date.now();
        const stale: Array<{ key: string; label: string; thresholdH: number; lastAt: string | null }> = [
          { key: "dexcom",   label: "Dexcom",         thresholdH: 3,  lastAt: s?.dexcom_last_at   ?? null },
          { key: "hc_steps", label: "Health Connect steps", thresholdH: 25, lastAt: s?.hc_steps_last_at ?? null },
          { key: "hc_sleep", label: "Health Connect sleep", thresholdH: 49, lastAt: s?.hc_sleep_last_at ?? null },
          { key: "hc_hr",    label: "Heart Rate",     thresholdH: 49, lastAt: s?.hc_hr_last_at    ?? null },
        ];
        for (const item of stale) {
          if (!item.lastAt) continue;
          const age = now - new Date(item.lastAt).getTime();
          if (age > item.thresholdH * 60 * 60 * 1000) {
            const notify = await shouldNotifyStale(item.key);
            if (notify && !cancelled) {
              const ageH = Math.round(age / 3600000);
              setStaleBannerMessage(`${item.label} data hasn't synced in ${ageH}h. You may want to check your connection.`);
              await markStaleNotified(item.key);
              break;
            }
          }
        }
      })
      .catch(function () {});
    return function () { cancelled = true; };
  }, [rangeHours]));

  useEffect(function () {
    load(rangeHours);
    const interval = setInterval(function () {
      load(rangeHours);
    }, 5 * 60 * 1000);
    return function () {
      clearInterval(interval);
    };
  }, [load, rangeHours]);

  useEffect(function () {
    let cancelled = false;
    const start = new Date(Date.now() - rangeHours * 60 * 60 * 1000).toISOString();
    const end = new Date().toISOString();
    api.getAnnotations(start, end).then(function (data) {
      if (!cancelled) setAnnotations(data);
    }).catch(function () {});
    return function () { cancelled = true; };
  }, [rangeHours]);

  useEffect(function () {
    api.getSettings().then(function (s: any) {
      const goal = s?.smart_notifications?.water_reminder?.goal;
      if (typeof goal === 'number' && goal > 0) setWaterGoal(goal);
    }).catch(function () {});
  }, []);
  useEffect(function () { loadWater(); }, [loadWater]);
  useEffect(function () { loadStepsAndSleep(); }, [loadStepsAndSleep]);
  useEffect(function () { loadSleepExtras(); }, [loadSleepExtras]);

  // Widget/notification deep links can request the screen scroll to a section.
  // Retry briefly so the scroll happens after layout has measured the anchor.
  useFocusEffect(useCallback(function () {
    const target = route.params?.scrollTo as "glucose" | "sleep" | undefined;
    if (!target) return;
    let attempts = 0;
    const tryScroll = () => {
      attempts += 1;
      const y = sectionYRef.current[target];
      if (y !== null && scrollViewRef.current) {
        scrollViewRef.current.scrollTo({ y: Math.max(0, y - 12), animated: true });
        // Clear the param so re-focusing without a new link doesn't re-scroll.
        try { navigation.setParams({ scrollTo: undefined }); } catch { /* noop */ }
        return true;
      }
      return false;
    };
    if (tryScroll()) return;
    const interval = setInterval(() => {
      if (tryScroll() || attempts > 20) clearInterval(interval);
    }, 120);
    return () => clearInterval(interval);
  }, [route.params?.scrollTo, navigation]));

  // Entrance animation — fade+slide cards in on mount, staggered 60ms per card.
  useEffect(function () {
    Animated.timing(entranceAnim, { toValue: 1, duration: 420, useNativeDriver: true }).start();
    Animated.stagger(60, [
      Animated.timing(chipEntranceAnim,         { toValue: 1, duration: 380, useNativeDriver: true }),
      Animated.timing(mindfulnessEntranceAnim,  { toValue: 1, duration: 380, useNativeDriver: true }),
      Animated.timing(glucoseEntranceAnim,      { toValue: 1, duration: 380, useNativeDriver: true }),
      Animated.timing(bottomCardsEntranceAnim,  { toValue: 1, duration: 380, useNativeDriver: true }),
    ]).start();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fade the glucose chart during range changes so the data swap looks like a crossfade
  useEffect(function () {
    Animated.sequence([
      Animated.timing(chartFadeAnim, { toValue: 0.4, duration: 140, useNativeDriver: true }),
      Animated.timing(chartFadeAnim, { toValue: 1,   duration: 220, useNativeDriver: true }),
    ]).start();
  }, [rangeHours]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-dismiss the HC sync toast pill after a few seconds
  useEffect(function () {
    if (!hcResult) return;
    const t = setTimeout(() => setHcResult(null), 4500);
    return () => clearTimeout(t);
  }, [hcResult]);

  // Flip chips out of skeleton state once any data lands, or after 3s worst-case
  useEffect(function () {
    if (chipsHydrated) return;
    if (stepsCount !== null || waterCount !== null || sleepDisplay || status?.hasData || hrReadings.length > 0) {
      setChipsHydrated(true);
    }
  }, [stepsCount, waterCount, sleepDisplay, status?.hasData, hrReadings.length, chipsHydrated]);
  useEffect(function () {
    const t = setTimeout(() => setChipsHydrated(true), 3000);
    return () => clearTimeout(t);
  }, []);

  // Steps goal ring flash — fire when steps cross 10,000 (Feature 12)
  useEffect(function () {
    if (stepsCount === null) return;
    const prev = prevStepsRef.current;
    if (stepsCount >= stepGoal && (prev === null || prev < stepGoal)) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Animated.sequence([
        Animated.timing(stepsGoalAnim, { toValue: 1, duration: 300, useNativeDriver: false }),
        Animated.timing(stepsGoalAnim, { toValue: 0, duration: 500, useNativeDriver: false }),
      ]).start();
    }
    prevStepsRef.current = stepsCount;
  }, [stepsCount]);
  // On focus, not mount — the service can be killed from the notification shade.
  useFocusEffect(useCallback(function () {
    isForegroundServiceRunning().then(setLiveTracking).catch(() => {});
  }, []));
  useEffect(function () { loadHeartRate(hrRangeHours); }, [loadHeartRate, hrRangeHours]);
  useEffect(function () {
    const ticker = setInterval(function () {
      if (lastSyncTimeRef.current !== null) {
        setLastSyncMinutes(Math.round((Date.now() - lastSyncTimeRef.current) / 60000));
      }
    }, 60000);
    return function () { clearInterval(ticker); };
  }, []);

  const now = Date.now();
  const windowStart = now - rangeHours * 60 * 60 * 1000;
  const allValues = todayReadings.concat(yesterdayReadings).map(function (r) {
    return Number(r.mg_dl);
  });
  const minVal = allValues.length ? Math.min.apply(null, allValues.concat([70])) - 10 : 60;
  const maxVal = allValues.length ? Math.max.apply(null, allValues.concat([180])) + 10 : 200;

  const todayPoints = buildPoints(todayReadings, windowStart, now, minVal, maxVal);
  const yesterdayPoints = buildPoints(yesterdayReadings, windowStart, now, minVal, maxVal);

  // Keep gesture callback ref in sync with latest render values
  scrubCtx.current = { todayReadings, yesterdayReadings, windowStart, windowEnd: now };

  const chartInnerHeight = CHART_HEIGHT - PAD_TOP - PAD_BOTTOM;
  const highY = PAD_TOP + chartInnerHeight - ((180 - minVal) / (maxVal - minVal)) * chartInnerHeight;
  const lowY = PAD_TOP + chartInnerHeight - ((70 - minVal) / (maxVal - minVal)) * chartInnerHeight;

  const GRID_STEP = 20;
  const gridValues: number[] = [];
  for (let v = Math.ceil(minVal / GRID_STEP) * GRID_STEP; v <= maxVal; v += GRID_STEP) {
    gridValues.push(v);
  }

  const peak = todayReadings.length > 0
    ? Math.max.apply(null, todayReadings.map(function (r) { return Number(r.mg_dl); }))
    : null;

  // Time in range: readings in window between 70–180 mg/dL
  const windowReadings = todayReadings.filter(function (r) {
    const t = new Date(r.recorded_at).getTime();
    return t >= windowStart && t <= now;
  });
  // No-data gaps > 20 min inside the window — shaded on the chart so a
  // flatline from missed readings isn't mistaken for stable glucose.
  const GAP_MS = 20 * 60 * 1000;
  const dataGaps: Array<{ x1: number; x2: number }> = (() => {
    if (windowReadings.length === 0) return [];
    const times = windowReadings
      .map(function (r) { return new Date(r.recorded_at).getTime(); })
      .sort(function (a, b) { return a - b; });
    const usableWidth = CHART_WIDTH - PAD_LEFT;
    const toX = function (t: number) { return PAD_LEFT + ((t - windowStart) / (now - windowStart)) * usableWidth; };
    const gaps: Array<{ x1: number; x2: number }> = [];
    for (let i = 1; i < times.length; i++) {
      if (times[i] - times[i - 1] > GAP_MS) gaps.push({ x1: toX(times[i - 1]), x2: toX(times[i]) });
    }
    return gaps;
  })();
  const tirPct = windowReadings.length >= 3
    ? Math.round((windowReadings.filter(function (r) {
        const v = Number(r.mg_dl);
        return v >= 70 && v <= 180;
      }).length / windowReadings.length) * 100)
    : null;

  return (
    <View style={{ flex: 1 }}>
    <LinearGradient colors={[theme.page, theme.gradientEnd]} style={{ flex: 1 }}>
    <ScreenBackground pageId="health_tab" />
    <ScrollView
      ref={scrollViewRef}
      style={{ backgroundColor: "transparent" }}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.teal.bar} colors={[theme.teal.bar]} />}
    >
      {showTooltip && (
        <TooltipBubble
          message="Your health hub — glucose chart, heart rate, steps, and sleep in one place. Connect Dexcom for glucose and Health Connect for the rest. Tap any chart to explore your data."
          onDismiss={() => setShowTooltip(false)}
        />
      )}
      <Animated.View style={{
        transform: [{ translateY: entranceAnim.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
      }}>
      {/* Mindfulness chip — now part of the 2×3 tile grid below */}

      {/* ── Step goal nudge banner ── */}
      {showGoalNudge && (
        <View style={{ borderRadius: 18, borderWidth: 2, borderColor: theme.teal.solid, backgroundColor: theme.teal.bg, padding: 12, flexDirection: "row", alignItems: "center", gap: 10 }}>
          <ThemedIcon slot="health.goal" size={20} />
          <Pressable onPress={() => navigation.navigate("SettingsTracking")} style={{ flex: 1 }}>
            <Text style={{ color: theme.teal.fg, fontSize: 13, fontWeight: "900" }}>Set your daily step goal</Text>
            <Text style={{ color: theme.teal.sub, fontSize: 11, fontWeight: "600", marginTop: 1 }}>Tap to pick a target → shows on your step ring</Text>
          </Pressable>
          <Pressable
            onPress={async () => {
              setShowGoalNudge(false);
              await AsyncStorage.setItem("ripple_step_goal_nudge_dismissed", "true").catch(() => {});
            }}
            hitSlop={10}
            accessibilityLabel="Dismiss step goal prompt"
          >
            <Ionicons name="close" size={18} color={theme.teal.sub} />
          </Pressable>
        </View>
      )}

      <SectionDivider label="METRICS · TODAY" />

      {/* ── Metric chip row ── */}
      <MetricChipRow
        chipEntranceAnim={chipEntranceAnim}
        chipsHydrated={chipsHydrated}
        status={status}
        tirPct={tirPct}
        stepsCount={stepsCount}
        stepGoal={stepGoal}
        stepsMetricId={stepsMetricId}
        weekStepsStart={weekStepsStart}
        stepsWeekTotal={stepsWeekTotal}
        sleepScore={sleepScore}
        sleepWeekDays={sleepWeekDays}
        sleepDisplay={sleepDisplay}
        waterCount={waterCount}
        waterGoal={waterGoal}
        waterFlashAnim={waterFlashAnim}
        waterCelebAnim={waterCelebAnim}
        waterCountScaleAnim={waterCountScaleAnim}
        hrReadings={hrReadings}
        mindStats={mindStats}
        onLogWater={handleLogWater}
        navigation={navigation}
      />


      {lastRefreshed && (
        <Text style={{ fontSize: 9, lineHeight: 13, fontWeight: "700", color: theme.textSoft, textAlign: "right", opacity: 0.7, marginTop: 6 }}>
          Updated {Math.round((Date.now() - lastRefreshed.getTime()) / 60000) < 1
            ? "just now"
            : Math.round((Date.now() - lastRefreshed.getTime()) / 60000) + " min ago"}
        </Text>
      )}
      {lastSyncMinutes !== null && (
        <Text style={{ fontSize: 10, lineHeight: 14, color: theme.textSoft, textAlign: "right", opacity: 0.65, marginTop: 2 }}>
          Health Connect synced {lastSyncMinutes < 1 ? "just now" : lastSyncMinutes + " min ago"}
        </Text>
      )}

      {/* Health Connect sync result toast — auto-dismisses after 4.5s */}
      {hcResult && (
        <View
          style={{
            alignSelf: "flex-end",
            marginTop: 4,
            paddingVertical: 6,
            paddingHorizontal: 10,
            borderRadius: 20,
            borderWidth: 1.5,
            borderColor: hcResult.startsWith("Sync failed") || hcResult.startsWith("Permission")
              ? (theme.coral?.sub ?? "#B84A2E")
              : (theme.teal?.sub ?? "#2E7A7F"),
            backgroundColor: hcResult.startsWith("Sync failed") || hcResult.startsWith("Permission")
              ? (theme.coral?.bg ?? "#FBEAE3")
              : (theme.teal?.bg ?? "#E1F1F2"),
          }}
          accessibilityLiveRegion="polite"
          accessibilityLabel={hcResult}
        >
          <Text style={{ fontSize: 11, fontWeight: "800", color: theme.textStrong }}>{hcResult}</Text>
        </View>
      )}

      <View onLayout={(e) => { sectionYRef.current.sleep = e.nativeEvent.layout.y; }} />

      {/* Glucose alert banner — deduplicated so each unique alert shows once */}
      {status && status.alerts && status.alerts.length > 0 ? (
        (() => {
          const uniqueAlerts = Array.from(new Set(status.alerts));
          return (
            <View style={[styles.alertCard, { backgroundColor: theme.red.tint, borderColor: theme.red.sub }]}>
              {uniqueAlerts.map(function (alert: string, i: number) {
                return (
                  <Text key={i} style={{ color: theme.red.fg, fontSize: 13, fontWeight: "700" }}>
                    ⚠ {alert}
                  </Text>
                );
              })}
            </View>
          );
        })()
      ) : null}

      <View onLayout={(e) => { sectionYRef.current.glucose = e.nativeEvent.layout.y; }}>
      <SectionDivider label="GLUCOSE" />
      </View>

      {/* Glucose chart card */}
      <GlucoseChartCard
        glucoseEntranceAnim={glucoseEntranceAnim}
        chartFadeAnim={chartFadeAnim}
        loading={loading}
        refreshing={refreshing}
        todayReadings={todayReadings}
        yesterdayReadings={yesterdayReadings}
        todayPoints={todayPoints}
        yesterdayPoints={yesterdayPoints}
        dataGaps={dataGaps}
        minVal={minVal}
        maxVal={maxVal}
        gridValues={gridValues}
        highY={highY}
        lowY={lowY}
        chartInnerHeight={chartInnerHeight}
        windowStart={windowStart}
        now={now}
        weekAvgGlucose={weekAvgGlucose}
        tirPct={tirPct}
        peak={peak}
        status={status}
        rangeHours={rangeHours}
        setRangeHours={setRangeHours}
        annotations={annotations}
        setAnnotations={setAnnotations}
        annotationModalVisible={annotationModalVisible}
        setAnnotationModalVisible={setAnnotationModalVisible}
        annotationLabel={annotationLabel}
        setAnnotationLabel={setAnnotationLabel}
        annotationSaving={annotationSaving}
        setAnnotationSaving={setAnnotationSaving}
        activeAnnotation={activeAnnotation}
        setActiveAnnotation={setActiveAnnotation}
        scrubInfo={scrubInfo}
        panGesture={panGesture}
        dexcomSyncing={dexcomSyncing}
        dexcomSyncMsg={dexcomSyncMsg}
        onDexcomForceSync={handleDexcomForceSync}
        navigation={navigation}
        styles={styles}
      />

      {/* Heart Rate chart card */}
      <HeartRateCard
        bottomCardsEntranceAnim={bottomCardsEntranceAnim}
        hrReadings={hrReadings}
        hr7DayReadings={hr7DayReadings}
        hrRangeHours={hrRangeHours}
        setHrRangeHours={setHrRangeHours}
        hrLoading={hrLoading}
        refreshing={refreshing}
        navigation={navigation}
        styles={styles}
      />

      </Animated.View>
    </ScrollView>
    </LinearGradient>
    {staleBannerMessage ? (
      <StaleSyncBanner
        message={staleBannerMessage}
        onDismiss={() => setStaleBannerMessage(null)}
        onRetry={() => { load(rangeHours); setStaleBannerMessage(null); }}
      />
    ) : null}
    </View>
  );
}

function makeStyles(ink: string, card: string, teal: string = "#3FA0A6") {
  return StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: CARD_GAP },
  halfCell: { width: HALF_CARD_WIDTH },
  tileLabel: { flexDirection: "row", alignItems: "center", gap: 4 },
  tileLabelText: { fontSize: 9, fontWeight: "900", letterSpacing: 0.6, textTransform: "uppercase" },
  // metricChip / chipVal / chipSub / chipLabel now live in components/MetricChip.tsx
  card: {
    borderRadius: 22,
    borderWidth: 2,
    padding: 14,
    ...coloredShadow(teal),
  },
  cardHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  cardTitle: { fontSize: 19, fontWeight: "900", letterSpacing: -0.5 },
  alertCard: {
    borderRadius: 22,
    borderWidth: 2,
    padding: 12,
    gap: 4,
    ...layeredShadow('card'),
  },
  peakBadge: {
    borderWidth: 2,
    borderColor: ink,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: card,
  },
  peakBadgeText: { fontSize: 10, fontWeight: "800", color: ink, letterSpacing: 0.5 },
  rangeRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  // rangeBtn / rangeBtnText now live in components/RangeSelector.tsx
  glucoseCurrentBox: {
    borderRadius: 16,
    borderWidth: 2,
    borderColor: ink,
    padding: 10,
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    ...layeredShadow('card'),
  },
  glucoseCurrentValue: { fontSize: 26, fontWeight: "900" },
  glucoseMinAgo: { fontSize: 10, marginTop: 1 },
  deltaBadge: {
    borderWidth: 2,
    borderColor: "rgba(128,128,128,0.4)",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  deltaBadgeText: { fontSize: 14, fontWeight: "800" },
  legendRow: { flexDirection: "row", gap: 16, marginTop: 10 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  scrubCard: {
    borderRadius: 16, borderWidth: 2, padding: 10, marginTop: 6,
    flexDirection: "row", alignItems: "center", gap: 12,
    ...layeredShadow('card'),
  },
  scrubTime: { fontSize: 11, minWidth: 44 },
  scrubStats: { flexDirection: "row", gap: 16 },
  scrubStat: { alignItems: "center" },
  scrubLabel: { fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  scrubVal: { fontSize: 16, fontWeight: "800", marginTop: 1 },
  hcBtn: {
    borderWidth: 2,
    borderColor: ink,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
    ...layeredShadow('card'),
  },
  hcBtnText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  tirBadge: { borderRadius: 20, borderWidth: 1.5, paddingHorizontal: 8, paddingVertical: 3 },
  tirBadgeText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.4 },
  addAnnotationBtn: {
    width: 26, height: 26, borderRadius: 12, borderWidth: 1.5,
    alignItems: "center", justifyContent: "center",
  },
  annotationChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    borderRadius: 16, borderWidth: 1.5, paddingHorizontal: 10, paddingVertical: 7,
    marginTop: 6,
  },
  annotationChipLabel: { flex: 1, fontSize: 12, fontWeight: "700" },
  annotationChipTime: { fontSize: 11 },
  annotationModalCard: {
    borderRadius: 22, borderWidth: 2, padding: 14, marginTop: 10,
    ...layeredShadow('card'),
  },
  annotationModalTitle: { fontSize: 14, fontWeight: "800", marginBottom: 10 },
  annotationInput: {
    borderWidth: 2, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14,
  },
  annotationBtn: {
    borderRadius: 16, paddingVertical: 10, alignItems: "center",
  },
  annotationBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  waterTile: {
    flexGrow: 1,
    minWidth: 130,
  },
  waterTileHeader: { flexDirection: "row", alignItems: "center", gap: 4 },
  waterLogBtn: {
    marginTop: 8,
    borderRadius: 20,
    borderWidth: 2,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    ...layeredShadow('tile'),
  },
  });
}
