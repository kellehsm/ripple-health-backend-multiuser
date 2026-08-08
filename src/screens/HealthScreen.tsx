import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { ScrollView, View, Text, Pressable, TextInput, StyleSheet, Dimensions, Platform, Alert, RefreshControl, Animated } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { LoadingIndicator } from "../components/LoadingIndicator";
import { useNavigation } from "@react-navigation/native";
import { useFocusEffect } from "@react-navigation/core";
import { StaleSyncBanner } from "../components/StaleSyncBanner";
import { shouldNotifyStale, markStaleNotified } from "../utils/staleSyncState";
import * as Haptics from "expo-haptics";
import Svg, { Polyline, Line, Text as SvgText, Rect, Circle, G, Path, Defs, ClipPath } from "react-native-svg";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";
import { useTheme } from "../theme/ThemeContext";
import { useCardShadow, useAppSettings } from "../theme/AppSettingsContext";
import { onSolid } from "../theme/colorUtils";
import { coloredShadow, layeredShadow } from "../theme/styleUtils";
import { ShadowCard } from "../components/ShadowCard";
import { Ionicons } from "@expo/vector-icons";
import { MetricCard } from "../components/MetricCard";
import { DefinedTerm } from "../components/DefinedTerm";
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
import { ThemedSurface } from "../theme/pageTemplates";
import { type SleepStages } from "../lib/healthConnect";

type GlucoseReading = {
  recorded_at: string;
  mg_dl: number;
};

type HRReading = {
  recorded_at: string;
  bpm: number;
};

type GlucoseStatus = {
  hasData: boolean;
  mg_dl: number | null;
  arrow: string | null;
  delta: number | null;
  isStale: boolean;
  minutesSinceReading: number | null;
  alerts: string[];
};

const RANGE_OPTIONS = [3, 6, 12, 24];
const SCREEN_WIDTH = Dimensions.get("window").width;
const CHART_WIDTH = SCREEN_WIDTH - 64;
const CARD_GAP = 10;
const HALF_CARD_WIDTH = (SCREEN_WIDTH - 32 - CARD_GAP) / 2 - 4;
const CHIP_GAP = 8;
const CHIP_WIDTH = (SCREEN_WIDTH - 32 - CHIP_GAP * 2) / 3;
const CHART_HEIGHT = 200;
const PAD_LEFT = 32;
const PAD_BOTTOM = 20;
const PAD_TOP = 14;

function buildPoints(readings: GlucoseReading[], windowStart: number, windowEnd: number, minVal: number, maxVal: number): string {
  const usableWidth = CHART_WIDTH - PAD_LEFT;
  const usableHeight = CHART_HEIGHT - PAD_TOP - PAD_BOTTOM;
  const windowMs = windowEnd - windowStart;

  return readings
    .map(function (r: GlucoseReading) {
      const t = new Date(r.recorded_at).getTime();
      const x = PAD_LEFT + ((t - windowStart) / windowMs) * usableWidth;
      const y = PAD_TOP + usableHeight - ((Number(r.mg_dl) - minVal) / (maxVal - minVal)) * usableHeight;
      return x + "," + y;
    })
    .join(" ");
}

function getTimeTicks(windowStart: number, windowEnd: number, rangeHours: number): Array<{ t: number; label: string }> {
  const intervalMins = rangeHours <= 3 ? 15 : rangeHours <= 6 ? 30 : rangeHours <= 12 ? 60 : 120;
  const intervalMs = intervalMins * 60 * 1000;
  const showMins = rangeHours <= 6;
  const ticks: Array<{ t: number; label: string }> = [];
  for (let t = Math.ceil(windowStart / intervalMs) * intervalMs; t <= windowEnd; t += intervalMs) {
    const d = new Date(t);
    const h = d.getHours();
    const m = d.getMinutes();
    const ap = h >= 12 ? "p" : "a";
    const h12 = h % 12 || 12;
    ticks.push({ t, label: showMins ? `${h12}:${String(m).padStart(2, "0")}${ap}` : `${h12}${ap}` });
  }
  return ticks;
}

const DEFAULT_WATER_GOAL = 8;

function WaterDropletLarge({ count, goal, color }: { count: number; goal: number; color: string }) {
  const W = 72, H = 88;
  const DROP = "M36,5 C28,18 8,42 8,63 C8,78.5 21,88 36,88 C51,88 64,78.5 64,63 C64,42 44,18 36,5Z";
  const fillPct = goal > 0 ? Math.min(1, count / goal) : 0;
  const fillH = H * fillPct;
  const fillY = H - fillH;
  const textColor = fillPct > 0.35 ? "#fff" : color;
  return (
    <View style={{ width: W, height: H, alignItems: "center", justifyContent: "center" }}>
      <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute" }}>
        <Defs>
          <ClipPath id="wdropL">
            <Path d={DROP} />
          </ClipPath>
        </Defs>
        <Path d={DROP} fill={color} opacity={0.12} />
        <Path d={DROP} fill="none" stroke={color} strokeWidth="2.5" opacity={0.4} />
        {fillH > 0 && (
          <Rect x={0} y={fillY} width={W} height={fillH + 1} fill={color} opacity={0.85} clipPath="url(#wdropL)" />
        )}
      </Svg>
      <Text style={{ position: "absolute", fontSize: 22, fontWeight: "900", color: textColor, bottom: 18 }}>
        {count}
      </Text>
      <Text style={{ position: "absolute", fontSize: 10, fontWeight: "700", color: textColor, bottom: 6, opacity: 0.75 }}>
        / {goal}
      </Text>
    </View>
  );
}

function WaterRing({ count, goal, color }: { count: number; goal: number; color: string }) {
  const SIZE = 44;
  const R = 18, SW = 4;
  const CX = SIZE / 2, CY = SIZE / 2;
  const circumference = 2 * Math.PI * R;
  const pct = goal > 0 ? Math.min(1, count / goal) : 0;
  const dash = circumference * pct;
  const gap = circumference - dash;
  return (
    <View style={{ width: SIZE, height: SIZE, alignItems: "center", justifyContent: "center" }}>
      <Svg width={SIZE} height={SIZE} style={{ position: "absolute" }}>
        <Circle cx={CX} cy={CY} r={R} fill="none" stroke={color} strokeWidth={SW} opacity={0.2} />
        {pct > 0 && (
          <Circle
            cx={CX} cy={CY} r={R}
            fill="none" stroke={color} strokeWidth={SW}
            strokeDasharray={`${dash} ${gap}`}
            strokeLinecap="round"
            rotation={-90} origin={`${CX}, ${CY}`}
          />
        )}
      </Svg>
      <Text style={{ fontSize: 13, fontWeight: "900", color }}>{count}</Text>
    </View>
  );
}

function MiniDroplet({ count, goal, color }: { count: number; goal: number; color: string }) {
  const VW = 28, VH = 34;
  const W = 36, H = 44;
  const DROP = "M14,2 C10,7 3,16 3,24 C3,30 8,34 14,34 C20,34 25,30 25,24 C25,16 18,7 14,2Z";
  const fillPct = goal > 0 ? Math.min(1, count / goal) : 0;
  const fillH = VH * fillPct;
  const fillY = VH - fillH;
  return (
    <Svg width={W} height={H} viewBox={`0 0 ${VW} ${VH}`}>
      <Defs><ClipPath id="miniDrop"><Path d={DROP} /></ClipPath></Defs>
      <Path d={DROP} fill={color} opacity={0.15} />
      <Path d={DROP} fill="none" stroke={color} strokeWidth="2" opacity={0.5} />
      {fillH > 0 && <Rect x={0} y={fillY} width={W} height={fillH + 1} fill={color} opacity={0.85} clipPath="url(#miniDrop)" />}
    </Svg>
  );
}

function WaterDropletButton({ count, goal, color, onPress }: { count: number; goal: number; color: string; onPress: () => void }) {
  const W = 72, H = 88;
  const DROP = "M36,5 C28,18 8,42 8,63 C8,78.5 21,88 36,88 C51,88 64,78.5 64,63 C64,42 44,18 36,5Z";
  const fillPct = goal > 0 ? Math.min(1, count / goal) : 0;
  const fillH = H * fillPct;
  const fillY = H - fillH;
  const labelColor = fillPct > 0.5 ? "#fff" : color;
  return (
    <Pressable onPress={onPress} accessibilityLabel="Log one glass of water" style={{ width: W, height: H }}>
      <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute" }}>
        <Defs>
          <ClipPath id="wdropBtn">
            <Path d={DROP} />
          </ClipPath>
        </Defs>
        <Path d={DROP} fill={color} opacity={0.12} />
        <Path d={DROP} fill="none" stroke={color} strokeWidth="2.5" opacity={0.45} />
        {fillH > 0 && (
          <Rect x={0} y={fillY} width={W} height={fillH + 1} fill={color} opacity={0.88} clipPath="url(#wdropBtn)" />
        )}
        <Path d={DROP} fill="none" stroke="#111" strokeWidth="1.5" opacity={0.3} />
      </Svg>
      <View style={{ position: "absolute", bottom: 14, left: 0, right: 0, alignItems: "center" }}>
        <Text style={{ fontSize: 20, fontWeight: "900", color: labelColor }}>+1</Text>
      </View>
    </Pressable>
  );
}

function buildHRSparkPoints(readings: Array<{ recorded_at: string; bpm: number }>, width: number, height: number): string {
  if (readings.length < 2) return "";
  const bpms = readings.map((r) => r.bpm);
  const minB = Math.min(...bpms);
  const maxB = Math.max(...bpms);
  const rangeB = maxB - minB || 1;
  const times = readings.map((r) => new Date(r.recorded_at).getTime());
  const minT = times[0];
  const rangeT = (times[times.length - 1] - minT) || 1;
  const pad = 3;
  return readings.map((r, i) => {
    const x = ((times[i] - minT) / rangeT) * width;
    const y = (height - pad) - ((r.bpm - minB) / rangeB) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

function formatSleepDuration(start: string, end: string): string {
  const totalMins = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return m > 0 ? h + "h " + m + "m" : h + "h";
}

function sumTodayLogs(logs: Array<{ logged_at: string; value: number }>): number {
  const today = new Date().toDateString();
  return logs
    .filter((l) => new Date(l.logged_at).toDateString() === today)
    .reduce((sum, l) => sum + Number(l.value), 0);
}

function StepsRing({ steps, goal, color, sub }: { steps: number | null; goal: number; color: string; sub: string }) {
  const R = 18, SW = 3.5;
  const SIZE = (R + SW) * 2 + 4;
  const CX = SIZE / 2, CY = SIZE / 2;
  const circumference = 2 * Math.PI * R;
  const pct = steps !== null && goal > 0 ? Math.min(1, steps / goal) : 0;
  const dash = circumference * pct;
  const gap = circumference - dash;
  const goalHit = steps !== null && goal > 0 && steps >= goal;
  return (
    <View style={{ width: SIZE, height: SIZE, alignItems: "center", justifyContent: "center" }}>
      <Svg width={SIZE} height={SIZE} style={{ position: "absolute" }}>
        <Circle cx={CX} cy={CY} r={R} fill="none" stroke={color} strokeWidth={SW} opacity={0.2} />
        {pct > 0 && (
          <Circle
            cx={CX} cy={CY} r={R}
            fill="none" stroke={color} strokeWidth={SW}
            strokeDasharray={`${dash} ${gap}`}
            strokeLinecap="round"
            rotation={-90} origin={`${CX}, ${CY}`}
          />
        )}
      </Svg>
      <Ionicons name={goalHit ? "checkmark-circle" : "walk"} size={15} color={goalHit ? color : sub} />
    </View>
  );
}

function SectionDivider({ label }: { label: string }) {
  const { theme } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 2 }}>
      <View style={{ flex: 1, height: 1, backgroundColor: theme.cardBorder, opacity: 0.6 }} />
      <Text style={{ fontSize: 9, fontWeight: "900", letterSpacing: 0.9, color: theme.textSoft }}>{label}</Text>
      <View style={{ flex: 1, height: 1, backgroundColor: theme.cardBorder, opacity: 0.6 }} />
    </View>
  );
}

export function HealthScreen() {
  const themeCtx = useTheme();
  const theme = themeCtx.theme;
  const mode = themeCtx.mode;
  const ink = theme.ink;
  const card = theme.card;
  const styles = useMemo(() => makeStyles(ink, card, theme.isDark), [ink, card, theme.isDark]);
  const cardShadow = useCardShadow('card');
  const { cardOpacity } = useAppSettings();
  const navigation = useNavigation<any>();
  const [rangeHours, setRangeHours] = useState(6);
  const [todayReadings, setTodayReadings] = useState<GlucoseReading[]>([]);
  const [yesterdayReadings, setYesterdayReadings] = useState<GlucoseReading[]>([]);
  const [status, setStatus] = useState<GlucoseStatus | null>(null);
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
  const [liveTracking, setLiveTracking] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [staleBannerMessage, setStaleBannerMessage] = useState<string | null>(null);
  const [waterGoal, setWaterGoal] = useState(DEFAULT_WATER_GOAL);
  const [sleepStages, setSleepStages] = useState<SleepStages | null>(null);
  const [stepGoal, setStepGoal] = useState(10000);
  const [showGoalNudge, setShowGoalNudge] = useState(false);
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

  const loadStepsAndSleep = useCallback(async function () {
    const _now = new Date();
    const today = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, "0")}-${String(_now.getDate()).padStart(2, "0")}`;
    try {
      const s = await api.stepsToday(today);
      setStepsCount(s?.steps ?? null);
      lastSyncTimeRef.current = Date.now();
      setLastSyncMinutes(0);
    } catch (e) {
      console.error("Failed to load steps", e);
    }
    try {
      const stepsList = await api.getStepsMetric();
      if (stepsList && stepsList.length > 0) {
        setStepsMetricId(stepsList[0].id);
        const settings = await api.getSettings().catch(() => null);
        const wsd = settings?.week_start?.steps ?? 1;
        setWeekStepsStart(wsd);
        const weekly = await api.stepsWeeklyTotal(stepsList[0].id, wsd);
        setStepsWeekTotal(weekly?.week_total ?? null);
      }
    } catch (_) {}
    try {
      const session = await api.sleepToday(today);
      if (session?.start_time && session?.end_time) {
        setSleepDisplay(formatSleepDuration(session.start_time, session.end_time));
      } else {
        setSleepDisplay(null);
      }
    } catch (e) {
      console.error("Failed to load sleep", e);
    }
    try {
      const stats = await api.sleepStats();
      const fmt = (s: number) => {
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        return m > 0 ? h + "h " + m + "m" : h + "h";
      };
      const yest = stats?.yesterday_seconds > 0 ? fmt(stats.yesterday_seconds) : "--";
      const avg = stats?.seven_day_average_seconds > 0 ? fmt(stats.seven_day_average_seconds) : "--";
      setSleepStatLine("Yesterday: " + yest + " · 7d avg: " + avg);
      if (stats?.seven_day_average_seconds > 0) setSleepAvgSecs(stats.seven_day_average_seconds);
      if (Array.isArray(stats?.week_days)) setSleepWeekDays(stats.week_days);
    } catch (e) {
      console.error("Failed to load sleep stats", e);
    }
    try {
      const cached = await AsyncStorage.getItem("ripple_sleep_stages");
      if (cached) setSleepStages(JSON.parse(cached));
    } catch (_) {}
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
  }, []);

  const loadWater = useCallback(async function () {
    try {
      const metric = await api.getOrCreateWaterMetric();
      setWaterMetricId(metric.id);
      const logs = await api.todaysWaterCount(metric.id);
      setWaterCount(sumTodayLogs(Array.isArray(logs) ? logs : []));
      try {
        const stats = await api.waterStats(metric.id);
        const yest = stats?.yesterday_total > 0 ? stats.yesterday_total + " glasses" : "--";
        const avg = stats?.seven_day_average > 0 ? Math.round(stats.seven_day_average) + " glasses" : "--";
        setWaterStatLine("Yesterday: " + yest + " · 7d avg: " + avg);
      } catch (_) {}
    } catch (e) {
      console.error("Failed to load water data", e);
    }
  }, []);

  const loadHeartRate = useCallback(async function (hours: number) {
    setHrLoading(true);
    try {
      const now = new Date();
      const start = new Date(now.getTime() - hours * 60 * 60 * 1000);
      const readings = await api.heartRateRange(start.toISOString(), now.toISOString());
      setHrReadings(Array.isArray(readings) ? readings : []);
      // Fetch 7-day data for trend comparison (independent of selected window)
      const sevenDayStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      api.heartRateRange(sevenDayStart.toISOString(), now.toISOString())
        .then(function (d) { setHr7DayReadings(Array.isArray(d) ? d : []); })
        .catch(function () {});
    } catch (e) {
      console.error("Failed to load heart rate", e);
    } finally {
      setHrLoading(false);
    }
  }, []);

  async function handleRefresh() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRefreshing(true);
    try {
      await Promise.all([load(rangeHours), loadWater(), loadStepsAndSleep(), loadHeartRate(hrRangeHours)]);
      setLastRefreshed(new Date());
    } finally {
      setRefreshing(false);
    }
  }

  async function handleLogWater() {
    if (!waterMetricId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    waterFlashAnim.setValue(0.55);
    Animated.timing(waterFlashAnim, { toValue: 0, duration: 500, useNativeDriver: true }).start();
    try {
      await api.logWater(waterMetricId);
      const logs = await api.todaysWaterCount(waterMetricId);
      const newCount = sumTodayLogs(Array.isArray(logs) ? logs : []);
      const wasAtGoal = prevWaterRef.current >= waterGoal;
      prevWaterRef.current = newCount;
      setWaterCount(newCount);
      // Pop the count number on each log
      Animated.sequence([
        Animated.spring(waterCountScaleAnim, { toValue: 1.35, useNativeDriver: true, speed: 40, bounciness: 10 }),
        Animated.spring(waterCountScaleAnim, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 6 }),
      ]).start();
      if (newCount >= waterGoal && !wasAtGoal) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        waterCelebAnim.setValue(0);
        Animated.sequence([
          Animated.timing(waterCelebAnim, { toValue: 1, duration: 350, useNativeDriver: true }),
          Animated.delay(1200),
          Animated.timing(waterCelebAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
        ]).start();
      }
    } catch (e) {
      console.error("Failed to log water", e);
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
      await loadStepsAndSleep();
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
    Promise.all([
      api.glucoseRange(todayStart, todayEnd),
      api.glucoseRange(yestStart, yestEnd),
      api.glucoseStatus(),
      api.glucoseRange(weekGlucoseStart, todayEnd),
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
        console.error("Failed to load glucose data", e);
      })
      .finally(function () {
        setLoading(false);
      });
  }, []);

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
  }, []));

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
    const start = new Date(Date.now() - rangeHours * 60 * 60 * 1000).toISOString();
    const end = new Date().toISOString();
    api.getAnnotations(start, end).then(setAnnotations).catch(function () {});
  }, [rangeHours]);

  useEffect(function () {
    api.getSettings().then(function (s: any) {
      const goal = s?.smart_notifications?.water_reminder?.goal;
      if (typeof goal === 'number' && goal > 0) setWaterGoal(goal);
    }).catch(function () {});
  }, []);
  useEffect(function () { loadWater(); }, [loadWater]);
  useEffect(function () { loadStepsAndSleep(); }, [loadStepsAndSleep]);

  // Entrance animation — fade+slide cards in on mount
  useEffect(function () {
    Animated.timing(entranceAnim, { toValue: 1, duration: 420, useNativeDriver: true }).start();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
  useEffect(function () {
    isForegroundServiceRunning().then(setLiveTracking).catch(() => {});
  }, []);
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
        opacity: entranceAnim,
        transform: [{ translateY: entranceAnim.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
      }}>
      {/* Mindfulness button */}
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          navigation.getParent()?.navigate("Mindfulness");
        }}
        onPressIn={() => Animated.spring(mindfulnessScale, { toValue: 0.98, useNativeDriver: true, speed: 300, bounciness: 4 }).start()}
        onPressOut={() => Animated.spring(mindfulnessScale, { toValue: 1, useNativeDriver: true, speed: 300, bounciness: 4 }).start()}
        style={{
          borderRadius: 26,
          opacity: cardOpacity,
          ...cardShadow,
        }}
        accessibilityRole="button"
        accessibilityLabel="Open Mindfulness hub"
      >
        <Animated.View style={{
          borderRadius: 26,
          borderWidth: 2,
          borderColor: ink,
          backgroundColor: theme.purple.solid,
          padding: 16,
          flexDirection: "row",
          alignItems: "center",
          gap: 14,
          overflow: "hidden",
          transform: [{ scale: mindfulnessScale }],
        }}>
          <Text style={{ fontSize: 32 }}>🧘</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ color: onSolid(theme.purple.solid), fontSize: 18, fontWeight: "900", marginBottom: 2 }}>Mindfulness</Text>
            <Text style={{ color: onSolid(theme.purple.solid), fontSize: 12, opacity: 0.75 }}>Breathing · grounding · gratitude</Text>
          </View>
          <Text style={{ color: onSolid(theme.purple.solid), fontSize: 20, fontWeight: "800", opacity: 0.85 }}>›</Text>
        </Animated.View>
      </Pressable>

      {/* ── Step goal nudge banner ── */}
      {showGoalNudge && (
        <View style={{ borderRadius: 18, borderWidth: 2, borderColor: theme.teal.solid, backgroundColor: theme.teal.bg, padding: 12, flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Text style={{ fontSize: 20 }}>🎯</Text>
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
          >
            <Ionicons name="close" size={18} color={theme.teal.sub} />
          </Pressable>
        </View>
      )}

      <SectionDivider label="METRICS · TODAY" />

      {/* ── Metric chip row ── */}
      {(function () {
        const hrLast = hrReadings.length > 0 ? hrReadings[hrReadings.length - 1].bpm : null;
        const berryFg = (theme as any).berry?.fg ?? "#7A1F3C";
        const berrySub = (theme as any).berry?.sub ?? "#A62A50";
        const berrySolid = (theme as any).berry?.solid ?? "#A62A50";
        const berryBg = (theme as any).berry?.bg ?? "#FAE0E4";
        const amberFg = (theme as any).amber?.fg ?? "#7A5600";
        const amberSub = (theme as any).amber?.sub ?? "#906808";
        const amberSolid = (theme as any).amber?.solid ?? "#B88820";
        const amberBg = (theme as any).amber?.bg ?? "#F8EEC8";
        const stepsLabel = stepsCount !== null
          ? (stepsCount >= 1000 ? (stepsCount / 1000).toFixed(1) + "k" : String(stepsCount))
          : "--";
        const goalLabel = stepGoal >= 1000 ? (stepGoal / 1000).toFixed(0) + "k" : String(stepGoal);
        return (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: CHIP_GAP }}>

            {/* GLUCOSE chip */}
            {(function () {
              const mgDl = status?.hasData ? (status.mg_dl ?? null) : null;
              const glucoseColor = mgDl === null
                ? berrySolid
                : mgDl >= 70 && mgDl <= 140
                  ? "#27AE60"
                  : mgDl <= 180
                    ? "#E67E22"
                    : "#C0392B";
              const glucoseBg = mgDl === null
                ? berryBg
                : mgDl >= 70 && mgDl <= 140
                  ? "#EAF7EE"
                  : mgDl <= 180
                    ? "#FEF5E7"
                    : "#FDEDEC";
              return (
                <View style={[styles.metricChip, { borderColor: glucoseColor, backgroundColor: glucoseBg }]}>
                  <Ionicons name="pulse" size={20} color={glucoseColor} />
                  <Text style={[styles.chipVal, { color: glucoseColor }]}>
                    {status?.hasData ? (String(status.mg_dl) + (status.arrow ? " " + status.arrow : "")) : "--"}
                  </Text>
                  {tirPct !== null && (
                    <Text style={[styles.chipSub, { color: glucoseColor }]}>{tirPct}% in range</Text>
                  )}
                  <Text style={[styles.chipLabel, { color: theme.textSoft }]}>GLUCOSE</Text>
                </View>
              );
            })()}

            {/* STEPS chip */}
            <Pressable
              style={[styles.metricChip, { borderColor: theme.teal.solid, backgroundColor: theme.teal.bg }]}
              onPress={() => stepsMetricId && navigation.getParent()?.navigate("StepsDetail", { metricId: stepsMetricId, weekStartDay: weekStepsStart })}
            >
              <StepsRing steps={stepsCount} goal={stepGoal} color={theme.teal.solid} sub={theme.teal.sub} />
              <Text style={[styles.chipVal, { color: theme.teal.fg }]}>{stepsLabel}</Text>
              <Text style={[styles.chipSub, { color: theme.teal.sub }]}>of {goalLabel}</Text>
              <Text style={[styles.chipLabel, { color: theme.textSoft }]}>STEPS</Text>
            </Pressable>

            {/* SLEEP chip */}
            <View style={[styles.metricChip, { borderColor: amberSolid, backgroundColor: amberBg }]}>
              <Ionicons name="moon" size={20} color={amberSub} />
              {sleepDisplay ? (
                <Text style={[styles.chipVal, { color: amberFg }]}>{sleepDisplay}</Text>
              ) : (
                <Svg width={28} height={34} viewBox="0 0 28 34" style={{ opacity: 0.25 }}>
                  <Path d="M14,2 C10,7 3,16 3,24 C3,30 8,34 14,34 C20,34 25,30 25,24 C25,16 18,7 14,2Z" fill={amberSolid} />
                </Svg>
              )}
              {/* 7-night sparkline */}
              {sleepWeekDays.length > 0 && (() => {
                const GOAL = 8 * 3600;
                const BAR_W = 5, GAP = 2;
                const MAX_H = 18;
                const bars = Array.from({ length: 7 }, (_, i) => {
                  const dayEntry = sleepWeekDays[i];
                  return dayEntry ? Math.min(1, dayEntry.seconds / GOAL) : 0;
                });
                const totalW = 7 * BAR_W + 6 * GAP;
                return (
                  <Svg width={totalW} height={MAX_H + 2}>
                    {bars.map((pct, i) => {
                      const h = Math.max(2, Math.round(pct * MAX_H));
                      return (
                        <Rect key={i} x={i * (BAR_W + GAP)} y={MAX_H - h + 2} width={BAR_W} height={h}
                          fill={amberSolid} opacity={pct > 0 ? 0.75 : 0.18} rx={1.5} />
                      );
                    })}
                  </Svg>
                );
              })()}
              <Text style={[styles.chipLabel, { color: theme.textSoft }]}>SLEEP</Text>
            </View>

            {/* WATER chip — filling droplet shows progress, tap to log */}
            <Pressable style={[styles.metricChip, { borderColor: theme.blue.solid, backgroundColor: theme.blue.bg, overflow: "hidden" }]} onPress={handleLogWater}>
              <Animated.View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: theme.blue.solid, opacity: waterFlashAnim, borderRadius: 11 }} pointerEvents="none" />
              <MiniDroplet count={waterCount ?? 0} goal={waterGoal} color={theme.blue.solid} />
              <Animated.Text style={[styles.chipSub, { color: theme.blue.sub, transform: [{ scale: waterCountScaleAnim }] }]}>
                {waterCount ?? 0}/{waterGoal}
              </Animated.Text>
              <Text style={[styles.chipLabel, { color: theme.textSoft }]}>WATER</Text>
              <Text style={{ fontSize: 7, fontWeight: "800", color: theme.blue.sub, opacity: 0.7, letterSpacing: 0.3 }}>tap to log</Text>
              {/* Goal celebration overlay */}
              <Animated.View
                pointerEvents="none"
                style={{
                  position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
                  alignItems: "center", justifyContent: "center",
                  opacity: waterCelebAnim,
                  transform: [{ scale: waterCelebAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.6, 1.15, 1] }) }],
                }}
              >
                <Text style={{ fontSize: 22 }}>💧</Text>
                <Text style={{ fontSize: 9, fontWeight: "900", color: theme.blue.sub, letterSpacing: 0.5 }}>GOAL!</Text>
              </Animated.View>
            </Pressable>

            {/* HEART RATE chip */}
            <Pressable style={[styles.metricChip, { borderColor: berrySub, backgroundColor: berryBg }]} onPress={() => navigation.getParent()?.navigate("HeartRateDetail")}>
              <Ionicons name="heart" size={20} color={berrySub} />
              <Text style={[styles.chipVal, { color: berryFg }]}>{hrLast !== null ? String(hrLast) : "--"}</Text>
              <Text style={[styles.chipSub, { color: berrySub }]}>bpm</Text>
              <Text style={[styles.chipLabel, { color: theme.textSoft }]}>HEART</Text>
            </Pressable>

          </View>
        );
      })()}

      {lastRefreshed && (
        <Text style={{ fontSize: 9, fontWeight: "700", color: theme.textSoft, textAlign: "right", opacity: 0.7, marginTop: -4 }}>
          Updated {Math.round((Date.now() - lastRefreshed.getTime()) / 60000) < 1
            ? "just now"
            : Math.round((Date.now() - lastRefreshed.getTime()) / 60000) + " min ago"}
        </Text>
      )}
      {lastSyncMinutes !== null && (
        <Text style={{ fontSize: 10, color: theme.textSoft, textAlign: "right", opacity: 0.65, marginTop: -4 }}>
          Health Connect synced {lastSyncMinutes < 1 ? "just now" : lastSyncMinutes + " min ago"}
        </Text>
      )}

      {/* Sleep debt counter */}
      {sleepAvgSecs !== null && (function () {
        const GOAL_SECS = 8 * 3600;
        const debtSecs = (GOAL_SECS - sleepAvgSecs) * 7;
        const isDebt = debtSecs > 0;
        const absSecs = Math.abs(debtSecs);
        const h = Math.floor(absSecs / 3600);
        const m = Math.floor((absSecs % 3600) / 60);
        const label = h > 0 ? h + "h " + (m > 0 ? m + "m" : "") : m + "m";
        const pct = Math.min(100, Math.round((sleepAvgSecs / GOAL_SECS) * 100));
        const barColor = pct >= 90 ? theme.teal.solid : pct >= 75 ? theme.amber?.solid ?? "#f59e0b" : theme.red?.solid ?? "#ef4444";
        return (
          <ShadowCard size="card" accent={theme.amber?.solid ?? "#f59e0b"} rotate={0.3} cardId="sleep_card">
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <Ionicons name="moon-outline" size={17} color={theme.amber?.solid ?? "#f59e0b"} />
              <Text style={[styles.cardTitle, { color: theme.textStrong, marginBottom: 0 }]}>Sleep debt</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6, marginBottom: 8 }}>
              <Text style={{ fontSize: 28, fontWeight: "900", color: isDebt ? (theme.red?.solid ?? "#ef4444") : theme.teal.solid, letterSpacing: -0.5 }}>
                {isDebt ? "–" : "+"}{label}
              </Text>
              <Text style={{ color: theme.textSoft, fontSize: 12 }}>vs 8h/night goal · past 7 days</Text>
            </View>
            <View style={{ height: 7, backgroundColor: theme.cardBorder, borderRadius: 4, overflow: "hidden" }}>
              <View style={{ height: 7, width: (pct + "%") as any, backgroundColor: barColor, borderRadius: 4 }} />
            </View>
          </ShadowCard>
        );
      })()}

      {/* Glucose alert banner */}
      {status && status.alerts && status.alerts.length > 0 ? (
        <View style={[styles.alertCard, { backgroundColor: theme.red.tint, borderColor: theme.red.sub }]}>
          {status.alerts.map(function (alert: string, i: number) {
            return (
              <Text key={i} style={{ color: theme.red.fg, fontSize: 13, fontWeight: "700" }}>
                ⚠ {alert}
              </Text>
            );
          })}
        </View>
      ) : null}

      <SectionDivider label="GLUCOSE" />

      {/* Glucose chart card */}
      <ShadowCard size="hero" accent={theme.berry.solid} rotate={-0.5} padding={14} cardId="glucose_card">
        <View style={styles.cardHeaderRow}>
          <Text style={[styles.cardTitle, { color: theme.textStrong }]}>Glucose</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1, justifyContent: "flex-end", flexWrap: "wrap" }}>
            {tirPct !== null ? (
              <DefinedTerm term="time_in_range">
                <View style={[styles.tirBadge, { backgroundColor: tirPct >= 70 ? theme.teal.bg : theme.amber.bg, borderColor: tirPct >= 70 ? theme.teal.sub : theme.amber.sub }]}>
                  <Text style={[styles.tirBadgeText, { color: tirPct >= 70 ? theme.teal.sub : theme.amber.sub }]}>
                    {tirPct}% IN RANGE
                  </Text>
                </View>
              </DefinedTerm>
            ) : null}
            {peak !== null ? (
              <View style={styles.peakBadge}>
                <Text style={styles.peakBadgeText}>{peak} PEAK</Text>
              </View>
            ) : null}
            <Pressable
              onPress={() => setAnnotationModalVisible(true)}
              style={[styles.addAnnotationBtn, { borderColor: ink }]}
              accessibilityLabel="Add chart annotation"
              hitSlop={6}
            >
              <Ionicons name="flag-outline" size={14} color={ink} />
            </Pressable>
          </View>
        </View>

        {/* Range selector + live glucose value inline */}
        {(function () {
          const mgDl = status?.hasData ? (status.mg_dl ?? null) : null;
          const glucoseColor = mgDl === null ? theme.berry.solid
            : mgDl >= 70 && mgDl <= 140 ? "#27AE60"
            : mgDl <= 180 ? "#E67E22"
            : "#C0392B";
          return (
            <View style={[styles.rangeRow, { justifyContent: "space-between", alignItems: "center" }]}>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {RANGE_OPTIONS.map(function (hrs) {
                  const active = rangeHours === hrs;
                  return (
                    <Pressable
                      key={hrs}
                      onPress={function () { Haptics.selectionAsync(); setRangeHours(hrs); }}
                      style={[styles.rangeBtn, { backgroundColor: active ? ink : card }]}
                    >
                      <Text style={[styles.rangeBtnText, { color: active ? "#ffffff" : ink }]}>{hrs}H</Text>
                    </Pressable>
                  );
                })}
              </View>
              {status?.hasData && mgDl !== null ? (
                <View style={{ flexDirection: "row", alignItems: "baseline", gap: 3 }}>
                  <Text style={{ fontSize: 26, fontWeight: "900", color: glucoseColor, letterSpacing: -0.5 }}>
                    {mgDl}
                  </Text>
                  {status.arrow ? (
                    <Text style={{ fontSize: 18, fontWeight: "700", color: glucoseColor }}>{status.arrow}</Text>
                  ) : null}
                  {status.delta != null ? (
                    <Text style={{ fontSize: 12, fontWeight: "800", color: status.delta > 0 ? "#C0392B" : "#27AE60", marginLeft: 2 }}>
                      {status.delta > 0 ? "+" : ""}{status.delta}
                    </Text>
                  ) : null}
                  {status.minutesSinceReading != null ? (
                    <Text style={{ fontSize: 9, color: theme.textSoft, marginLeft: 2 }}>{status.minutesSinceReading}m</Text>
                  ) : null}
                </View>
              ) : null}
            </View>
          );
        })()}

        {loading ? (
          <ShadowCard skeleton skeletonHeight={140} style={{ marginTop: 12 }} />
        ) : todayReadings.length === 0 && !status?.hasData ? (
          <ShadowCard size="card" bg={(theme as any).berry?.bg ?? "#FAE0E4"} accent={(theme as any).berry?.solid} style={{ marginTop: 12 }}>
            <Text style={{ color: theme.textStrong, fontWeight: "900", marginBottom: 4, fontSize: 15 }}>No glucose data</Text>
            <Text style={{ color: theme.textSoft, fontSize: 13 }}>Connect Dexcom to see your glucose readings here.</Text>
            <Pressable onPress={() => navigation.navigate("SettingsDexcom")} style={{ marginTop: 10 }}>
              <Text style={{ color: (theme as any).berry?.sub ?? theme.teal.solid, fontWeight: "800" }}>Connect Dexcom →</Text>
            </Pressable>
          </ShadowCard>
        ) : todayReadings.length === 0 ? (
          <Text style={{ color: theme.textSoft, fontSize: 12, marginTop: 10 }}>
            No glucose readings in this window yet.
          </Text>
        ) : (
          <GestureDetector gesture={panGesture}>
            <View
              accessible={true}
              accessibilityRole="image"
              accessibilityLabel={
                status?.hasData
                  ? `Glucose chart. Last reading ${status.mg_dl} mg/dL${status.arrow ? ", " + status.arrow : ""}${status.minutesSinceReading != null ? ", " + status.minutesSinceReading + " minutes ago" : ""}. ${todayReadings.filter(r => Number(r.mg_dl) < 70 || Number(r.mg_dl) > 180).length} readings out of the 70–180 mg/dL range in this window.`
                  : "Glucose chart. No readings in the current time window."
              }
            >
              <Svg width={CHART_WIDTH} height={CHART_HEIGHT} style={{ marginTop: 12 }}>
                {gridValues.map((v) => {
                  const gy = PAD_TOP + chartInnerHeight - ((v - minVal) / (maxVal - minVal)) * chartInnerHeight;
                  return (
                    <React.Fragment key={v}>
                      <Line x1={PAD_LEFT} x2={CHART_WIDTH} y1={gy} y2={gy} stroke={theme.textSoft} strokeDasharray="2,3" strokeWidth={0.5} opacity={0.35} />
                      <SvgText x={PAD_LEFT - 4} y={gy + 4} fontSize={9} fill={theme.textSoft} textAnchor="end">{v}</SvgText>
                    </React.Fragment>
                  );
                })}

                {/* Target range band 70–180 mg/dL — green tint */}
                <Rect
                  x={PAD_LEFT}
                  y={highY}
                  width={CHART_WIDTH - PAD_LEFT}
                  height={lowY - highY}
                  fill={theme.success}
                  opacity={0.12}
                  stroke={theme.success}
                  strokeWidth={1}
                  strokeDasharray="5,5"
                  strokeOpacity={0.4}
                />

                {/* Yesterday — dotted reference line */}
                {yesterdayPoints.length > 0 ? (
                  <Polyline points={yesterdayPoints} fill="none" stroke={theme.textSoft} strokeWidth={2} strokeDasharray="4,4" opacity={0.65} />
                ) : null}

                {/* Weekly average horizontal line */}
                {weekAvgGlucose !== null && weekAvgGlucose >= minVal && weekAvgGlucose <= maxVal ? (
                  (() => {
                    const wy = PAD_TOP + chartInnerHeight - ((weekAvgGlucose - minVal) / (maxVal - minVal)) * chartInnerHeight;
                    return (
                      <>
                        <Line x1={PAD_LEFT} x2={CHART_WIDTH} y1={wy} y2={wy}
                          stroke={theme.berry.sub ?? theme.berry.solid} strokeWidth={1.5} strokeDasharray="6,4" opacity={0.55} />
                        <SvgText x={CHART_WIDTH - 2} y={wy - 3} fontSize={8} fill={theme.berry.sub ?? theme.berry.solid} textAnchor="end" opacity={0.75}>
                          7d avg {weekAvgGlucose}
                        </SvgText>
                      </>
                    );
                  })()
                ) : null}

                {/* Today — double stroke: ink outline below, color on top */}
                {todayPoints.length > 0 ? (
                  <>
                    <Polyline points={todayPoints} fill="none" stroke={ink} strokeWidth={3.5} />
                    <Polyline points={todayPoints} fill="none" stroke={theme.berry.bar} strokeWidth={2} />
                  </>
                ) : null}

                {/* X-axis time labels */}
                {getTimeTicks(windowStart, now, rangeHours).map(function ({ t, label }) {
                  const x = PAD_LEFT + ((t - windowStart) / (now - windowStart)) * (CHART_WIDTH - PAD_LEFT);
                  return (
                    <SvgText key={t} x={x} y={CHART_HEIGHT - 4} fontSize={8} fill={theme.textSoft} textAnchor="middle" opacity={0.8}>
                      {label}
                    </SvgText>
                  );
                })}

                {/* Annotation vertical lines */}
                {annotations.map(function (ann) {
                  const t = new Date(ann.annotated_at).getTime();
                  if (t < windowStart || t > now) return null;
                  const ax = PAD_LEFT + ((t - windowStart) / (now - windowStart)) * (CHART_WIDTH - PAD_LEFT);
                  return (
                    <React.Fragment key={ann.id}>
                      <Line x1={ax} x2={ax} y1={PAD_TOP} y2={CHART_HEIGHT - PAD_BOTTOM}
                        stroke={theme.amber?.solid ?? "#F59E0B"} strokeWidth={1.5} strokeDasharray="3,3" opacity={0.8} />
                      <Circle cx={ax} cy={PAD_TOP + 4} r={4}
                        fill={theme.amber?.solid ?? "#F59E0B"} stroke={ink} strokeWidth={1} />
                    </React.Fragment>
                  );
                })}

                {/* Scrub indicator: vertical line + hit dots */}
                {scrubInfo ? (
                  <>
                    <Line
                      x1={scrubInfo.px} x2={scrubInfo.px}
                      y1={PAD_TOP} y2={CHART_HEIGHT - PAD_BOTTOM}
                      stroke={ink} strokeWidth={1} strokeDasharray="3,3" opacity={0.7}
                    />
                    {scrubInfo.todayVal !== null ? (
                      <Circle
                        cx={scrubInfo.px}
                        cy={PAD_TOP + chartInnerHeight - ((scrubInfo.todayVal - minVal) / (maxVal - minVal)) * chartInnerHeight}
                        r={5} fill={theme.berry.bar} stroke={ink} strokeWidth={1.5}
                      />
                    ) : null}
                    {scrubInfo.yestVal !== null ? (
                      <Circle
                        cx={scrubInfo.px}
                        cy={PAD_TOP + chartInnerHeight - ((scrubInfo.yestVal - minVal) / (maxVal - minVal)) * chartInnerHeight}
                        r={4} fill={theme.textSoft} stroke={ink} strokeWidth={1} opacity={0.5}
                      />
                    ) : null}
                  </>
                ) : null}
              </Svg>

              {/* Scrub readout card */}
              {scrubInfo ? (
                <View style={[styles.scrubCard, { backgroundColor: card, borderColor: ink }]}>
                  <Text style={[styles.scrubTime, { color: theme.textSoft }]}>{scrubInfo.time}</Text>
                  <View style={styles.scrubStats}>
                    {scrubInfo.todayVal !== null ? (
                      <View style={styles.scrubStat}>
                        <Text style={[styles.scrubLabel, { color: theme.textSoft }]}>TODAY</Text>
                        <Text style={[styles.scrubVal, { color: theme.berry.sub }]}>{scrubInfo.todayVal}</Text>
                      </View>
                    ) : null}
                    {scrubInfo.yestVal !== null ? (
                      <View style={styles.scrubStat}>
                        <Text style={[styles.scrubLabel, { color: theme.textSoft }]}>YESTERDAY</Text>
                        <Text style={[styles.scrubVal, { color: theme.textSoft }]}>{scrubInfo.yestVal}</Text>
                      </View>
                    ) : null}
                    {scrubInfo.delta !== null ? (
                      <View style={styles.scrubStat}>
                        <Text style={[styles.scrubLabel, { color: theme.textSoft }]}>DIFFERENCE</Text>
                        <Text style={[styles.scrubVal, { color: scrubInfo.delta > 0 ? theme.red.sub : theme.teal.bar }]}>
                          {scrubInfo.delta > 0 ? "+" : ""}{scrubInfo.delta}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              ) : null}
            </View>
          </GestureDetector>
        )}

        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: theme.berry.bar, borderWidth: 1.5, borderColor: ink }]} />
            <Text style={{ color: theme.textSoft, fontSize: 11 }}>Today</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: theme.textSoft, opacity: 0.4 }]} />
            <Text style={{ color: theme.textSoft, fontSize: 11 }}>Yesterday</Text>
          </View>
          {weekAvgGlucose !== null ? (
            <View style={styles.legendItem}>
              <View style={{ width: 14, height: 2, backgroundColor: theme.berry.sub ?? theme.berry.solid, opacity: 0.6, borderRadius: 1 }} />
              <Text style={{ color: theme.textSoft, fontSize: 11 }}>7d avg</Text>
            </View>
          ) : null}
          {annotations.filter(function (a) {
            const t = new Date(a.annotated_at).getTime();
            return t >= windowStart && t <= now;
          }).length > 0 ? (
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: theme.amber?.solid ?? "#F59E0B" }]} />
              <Text style={{ color: theme.textSoft, fontSize: 11 }}>Annotations</Text>
            </View>
          ) : null}
        </View>

        {/* Annotation chips for this window */}
        {annotations.filter(function (a) {
          const t = new Date(a.annotated_at).getTime();
          return t >= windowStart && t <= now;
        }).map(function (ann) {
          const d = new Date(ann.annotated_at);
          const timeLabel = d.getHours() % 12 || 12
            + ":" + String(d.getMinutes()).padStart(2, "0")
            + (d.getHours() >= 12 ? "pm" : "am");
          return (
            <Pressable
              key={ann.id}
              onPress={function () { setActiveAnnotation(activeAnnotation?.id === ann.id ? null : ann); }}
              style={[styles.annotationChip, { backgroundColor: theme.amber?.bg ?? "#FFF7ED", borderColor: theme.amber?.sub ?? "#D97706" }]}
              accessibilityLabel={"Annotation: " + ann.label}
            >
              <Text style={{ fontSize: 12 }}>🚩</Text>
              <Text style={[styles.annotationChipLabel, { color: theme.textStrong }]} numberOfLines={1}>{ann.label}</Text>
              <Text style={[styles.annotationChipTime, { color: theme.textSoft }]}>{timeLabel}</Text>
              <Pressable
                onPress={function () {
                  api.deleteAnnotation(ann.id).then(function () {
                    setAnnotations(function (prev) { return prev.filter(function (a) { return a.id !== ann.id; }); });
                    if (activeAnnotation?.id === ann.id) setActiveAnnotation(null);
                  }).catch(function () {});
                }}
                hitSlop={8}
              >
                <Ionicons name="close-circle" size={14} color={theme.textSoft} />
              </Pressable>
            </Pressable>
          );
        })}

        {/* Add annotation modal */}
        {annotationModalVisible ? (
          <View style={[styles.annotationModalCard, { backgroundColor: theme.card, borderColor: ink }]}>
            <Text style={[styles.annotationModalTitle, { color: theme.textStrong }]}>Add marker</Text>
            <TextInput
              style={[styles.annotationInput, { backgroundColor: theme.page, borderColor: ink, color: theme.textStrong }]}
              placeholder="e.g. Started new medication"
              placeholderTextColor={theme.textSoft}
              value={annotationLabel}
              onChangeText={setAnnotationLabel}
              maxLength={80}
              autoFocus
            />
            <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
              <Pressable
                style={[styles.annotationBtn, { backgroundColor: ink, flex: 1 }]}
                onPress={async function () {
                  if (!annotationLabel.trim()) return;
                  setAnnotationSaving(true);
                  try {
                    const ann = await api.createAnnotation(new Date().toISOString(), annotationLabel.trim());
                    setAnnotations(function (prev) { return [...prev, ann]; });
                    setAnnotationLabel("");
                    setAnnotationModalVisible(false);
                  } catch { }
                  finally { setAnnotationSaving(false); }
                }}
                disabled={annotationSaving || !annotationLabel.trim()}
              >
                {annotationSaving
                  ? <LoadingIndicator color="#fff" />
                  : <Text style={styles.annotationBtnText}>Save</Text>}
              </Pressable>
              <Pressable
                style={[styles.annotationBtn, { backgroundColor: theme.card, borderWidth: 2, borderColor: ink, flex: 1 }]}
                onPress={function () { setAnnotationModalVisible(false); setAnnotationLabel(""); }}
              >
                <Text style={[styles.annotationBtnText, { color: ink }]}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {status && status.isStale ? (
          <Text style={{ color: theme.textSoft, fontSize: 11, marginTop: 8 }}>
            Last reading {status.minutesSinceReading} min ago — sensor may be disconnected.
          </Text>
        ) : null}
      </ShadowCard>

      {/* Heart Rate chart card */}
      {(() => {
        const hrValues = hrReadings.map((r) => r.bpm);
        const hrMin = hrValues.length ? Math.min(...hrValues) - 5 : 40;
        const hrMax = hrValues.length ? Math.max(...hrValues) + 5 : 120;
        const hrRange = hrMax - hrMin || 1;
        const hrNow = Date.now();
        const hrWindowStart = hrNow - hrRangeHours * 60 * 60 * 1000;
        const hrWindowMs = hrRangeHours * 60 * 60 * 1000;
        const usableW = CHART_WIDTH - PAD_LEFT;
        const usableH = CHART_HEIGHT - PAD_TOP - PAD_BOTTOM;
        const hrPoints = hrReadings.map(function (r) {
          const t = new Date(r.recorded_at).getTime();
          const x = PAD_LEFT + ((t - hrWindowStart) / hrWindowMs) * usableW;
          const y = PAD_TOP + usableH - ((r.bpm - hrMin) / hrRange) * usableH;
          return x + "," + y;
        }).join(" ");
        const restingBpm = hrValues.length ? Math.min(...hrValues) : null;
        const peakBpm = hrValues.length ? Math.max(...hrValues) : null;
        const HR_RANGE_OPTIONS = [3, 6, 12, 24];
        // 7-day average for trend arrow
        const hr7DayValues = hr7DayReadings.map(function (r) { return r.bpm; });
        const hr7DayAvg = hr7DayValues.length > 0
          ? hr7DayValues.reduce(function (s, v) { return s + v; }, 0) / hr7DayValues.length
          : null;
        const hrTrendArrow = restingBpm !== null && hr7DayAvg !== null
          ? (restingBpm - hr7DayAvg > 3
              ? { symbol: "↑", color: theme.danger }
              : restingBpm - hr7DayAvg < -3
                ? { symbol: "↓", color: theme.success }
                : { symbol: "→", color: theme.textSoft })
          : null;
        return (
          <ShadowCard size="card" accent={theme.berry.solid} padding={14}>
            <View style={styles.cardHeaderRow}>
              <Text style={[styles.cardTitle, { color: theme.textStrong }]}>Heart Rate</Text>
              {peakBpm !== null ? (
                <View style={styles.peakBadge}>
                  <Text style={styles.peakBadgeText}>{peakBpm} PEAK</Text>
                </View>
              ) : null}
            </View>
            {restingBpm !== null ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 }}>
                <Text style={{ color: theme.textSoft, fontSize: 12 }}>
                  Resting: {restingBpm} bpm
                </Text>
                {hrTrendArrow !== null && (
                  <Text style={{ fontSize: 14, fontWeight: "800", color: hrTrendArrow.color }}>
                    {hrTrendArrow.symbol}
                  </Text>
                )}
              </View>
            ) : null}
            <View style={styles.rangeRow}>
              {HR_RANGE_OPTIONS.map(function (hrs) {
                const active = hrRangeHours === hrs;
                return (
                  <Pressable
                    key={hrs}
                    onPress={function () { Haptics.selectionAsync(); setHrRangeHours(hrs); }}
                    style={[styles.rangeBtn, { backgroundColor: active ? ink : card }]}
                  >
                    <Text style={[styles.rangeBtnText, { color: active ? "#ffffff" : ink }]}>{hrs}H</Text>
                  </Pressable>
                );
              })}
            </View>
            {hrLoading ? (
              <LoadingIndicator style={{ marginVertical: 30 }} />
            ) : hrReadings.length === 0 ? (
              <Text style={{ color: theme.textSoft, fontSize: 12, marginTop: 10 }}>
                No heart rate data in this window.
              </Text>
            ) : (
              <Svg width={CHART_WIDTH} height={CHART_HEIGHT} style={{ marginTop: 12 }}>
                {/* Double-stroke HR line */}
                <Polyline points={hrPoints} fill="none" stroke={ink} strokeWidth={3.5} />
                <Polyline points={hrPoints} fill="none" stroke={theme.berry.sub} strokeWidth={2} />
              </Svg>
            )}
          </ShadowCard>
        );
      })()}

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

function makeStyles(ink: string, card: string, isDark: boolean = false) {
  return StyleSheet.create({
  content: { padding: 16, gap: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: CARD_GAP },
  halfCell: { width: HALF_CARD_WIDTH },
  tileLabel: { flexDirection: "row", alignItems: "center", gap: 4 },
  tileLabelText: { fontSize: 9, fontWeight: "900", letterSpacing: 0.6, textTransform: "uppercase" },
  metricChip: {
    width: CHIP_WIDTH,
    borderRadius: 14,
    borderWidth: 2.5,
    backgroundColor: card,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: "center",
    gap: 3,
    elevation: 3,
  },
  chipVal: { fontSize: 16, fontWeight: "900", letterSpacing: -0.3 },
  chipSub: { fontSize: 9, fontWeight: "800" },
  chipLabel: { fontSize: 8, fontWeight: "800", letterSpacing: 0.5 },
  card: {
    borderRadius: 22,
    borderWidth: 2,
    padding: 14,
    ...coloredShadow("#3FA0A6"),
  },
  cardHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  cardTitle: { fontSize: 19, fontWeight: "900", letterSpacing: -0.5 },
  alertCard: {
    borderRadius: 22,
    borderWidth: 2,
    padding: 12,
    gap: 4,
    ...layeredShadow('card', isDark),
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
  rangeBtn: {
    borderWidth: 2,
    borderColor: ink,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    ...layeredShadow('card', isDark),
  },
  rangeBtnText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.4 },
  glucoseCurrentBox: {
    borderRadius: 16,
    borderWidth: 2,
    borderColor: ink,
    padding: 10,
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    ...layeredShadow('card', isDark),
  },
  glucoseCurrentValue: { fontSize: 26, fontWeight: "900" },
  glucoseMinAgo: { fontSize: 10, marginTop: 1 },
  deltaBadge: {
    borderWidth: 2,
    borderColor: "rgba(128,128,128,0.4)",
    borderRadius: 12,
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
    ...layeredShadow('card', isDark),
  },
  scrubTime: { fontSize: 11, minWidth: 44 },
  scrubStats: { flexDirection: "row", gap: 16 },
  scrubStat: { alignItems: "center" },
  scrubLabel: { fontSize: 8, fontWeight: "800", letterSpacing: 0.5 },
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
    ...layeredShadow('card', isDark),
  },
  hcBtnText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  tirBadge: { borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 8, paddingVertical: 3 },
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
    ...layeredShadow('card', isDark),
  },
  annotationModalTitle: { fontSize: 14, fontWeight: "800", marginBottom: 10 },
  annotationInput: {
    borderWidth: 2, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14,
  },
  annotationBtn: {
    borderRadius: 12, paddingVertical: 10, alignItems: "center",
  },
  annotationBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  waterTile: {
    flexGrow: 1,
    minWidth: 130,
  },
  waterTileHeader: { flexDirection: "row", alignItems: "center", gap: 4 },
  waterLogBtn: {
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 2,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    ...layeredShadow('tile', isDark),
  },
  });
}
