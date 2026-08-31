/**
 * WaterDetailScreen — Dedicated water intake tracker with droplet theme.
 *
 * Features:
 *  1. Hero animated droplet that fills proportionally to today's progress
 *  2. Log controls: +1 glass (ripple animation), +½, −1
 *  3. Today timeline: dots for each logged glass with times
 *  4. 7-day strip: mini droplets per day filled by goal %
 *  5. Streak + stat row
 *  6. Goal editor (AsyncStorage-backed)
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Alert,
  TextInput,
  Modal,
  AccessibilityInfo,
} from "react-native";
import Svg, { Path, Ellipse, ClipPath, Rect, Defs, G } from "react-native-svg";

const AnimatedRect    = Animated.createAnimatedComponent(Rect);
const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme } from "../theme/ThemeContext";
import { api } from "../api/client";
import { CountUpText } from "../components/CountUpText";
import { useReduceMotion } from "../hooks/useReduceMotion";
import { UndoBanner } from "../components/UndoBanner";
import { MilestoneBanner } from "../components/MilestoneBanner";
import { ScreenBackground } from "../components/ScreenBackground";
import { ConfettiBurst } from "../components/ConfettiBurst";
import { checkMilestone, milestoneCopy } from "../utils/milestones";
import * as Haptics from "expo-haptics";
import { invalidateCache } from "../utils/staleCache";
import { todayStr } from "../utils/dateUtils";

const WATER_GOAL_KEY = "ripple_water_goal";
const DEFAULT_WATER_GOAL = 8;

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayDateStr() {
  return new Date().toDateString();
}

function isTodayLog(logged_at: string) {
  return new Date(logged_at).toDateString() === todayDateStr();
}

function sumLogs(logs: Array<{ logged_at: string; value: number }>, dateStr?: string): number {
  return logs
    .filter((l) => (dateStr ? new Date(l.logged_at).toDateString() === dateStr : isTodayLog(l.logged_at)))
    .reduce((s, l) => s + Number(l.value), 0);
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "pm" : "am";
  return `${h % 12 || 12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

// ── Hero Droplet ──────────────────────────────────────────────────────────────

const DROP_W = 140;
const DROP_H = 190;

// SVG droplet path — rounded teardrop, pointed top at (70,10), base centred at (70,140)
// True teardrop: pointed tip at (70,8), rounded belly centred at (70,128) r=52
// Left cubic curves the body out naturally; right side mirrors it.
const DROPLET_PATH =
  "M70 8 C 45 40, 18 80, 18 128 A 52 52 0 0 0 122 128 C 122 80, 95 40, 70 8 Z";

// Inner fill extents within the 140×190 viewBox
const INNER_TOP = 30;   // y-coord of the fill rect top when 100% full
const INNER_H   = 148;  // total fillable span (y=30 → y=178)

function HeroDroplet({
  count,
  goal,
  color,
  reduceMotion,
  onGoalReached,
}: {
  count: number;
  goal: number;
  color: string;
  reduceMotion: boolean;
  onGoalReached?: () => void;
}) {
  const targetPct = goal > 0 ? Math.min(1, count / goal) : 0;

  // ── Animated fill level ────────────────────────────────────────────────────
  // AnimatedRect accepts Animated.Value directly — no addListener needed.
  const fillAnim = useRef(new Animated.Value(targetPct)).current;

  // Interpolated y position: pct 0 → bottom of fill area; pct 1 → top
  const fillY = fillAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: [INNER_TOP + INNER_H, INNER_TOP],
    extrapolate: "clamp",
  });

  const prevCount = useRef(count);
  const prevGoal  = useRef(goal);

  useEffect(() => {
    const countChanged = count !== prevCount.current;
    const goalChanged  = goal  !== prevGoal.current;
    prevCount.current = count;
    prevGoal.current  = goal;
    if (!countChanged && !goalChanged) return;

    fillAnim.stopAnimation();

    if (reduceMotion) {
      fillAnim.setValue(targetPct);
      return;
    }

    if (countChanged && count > 0) {
      Animated.spring(fillAnim, {
        toValue: targetPct,
        tension: 50,
        friction: 7,
        overshootClamping: false,
        useNativeDriver: false,
      }).start();
    } else {
      Animated.timing(fillAnim, {
        toValue: targetPct,
        duration: 400,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }).start();
    }
  }, [count, goal, targetPct, reduceMotion]);

  // ── Scale-bounce wrapper on every +glass ──────────────────────────────────
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const prevCountForBounce = useRef(count);

  useEffect(() => {
    if (reduceMotion) { prevCountForBounce.current = count; return; }
    if (count > prevCountForBounce.current) {
      Animated.sequence([
        Animated.spring(scaleAnim, {
          toValue: 1.09,
          tension: 120,
          friction: 5,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 80,
          friction: 8,
          useNativeDriver: true,
        }),
      ]).start();
    }
    prevCountForBounce.current = count;
  }, [count, reduceMotion]);

  // ── Goal-reached confetti burst ────────────────────────────────────────────
  const [confettiKey, setConfettiKey] = useState(0);
  const wasAtGoal = useRef(false);

  useEffect(() => {
    const atGoal = goal > 0 && count >= goal;
    if (atGoal && !wasAtGoal.current) {
      setConfettiKey((k) => k + 1);
      onGoalReached?.();
    }
    wasAtGoal.current = atGoal;
  }, [count, goal]);

  // ── Oscillating wave surface — AnimatedEllipse accepts Animated.Value directly
  const waveAnim = useRef(new Animated.Value(0)).current;
  const waveLoop = useRef<Animated.CompositeAnimation | null>(null);

  // Simple back-and-forth (0→1→0) gives a smooth left/right oscillation
  const waveCx = waveAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: [56, 84],
    extrapolate: "clamp",
  });

  useEffect(() => {
    if (reduceMotion) { waveAnim.setValue(0); return; }
    waveLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(waveAnim, { toValue: 1, duration: 1200, useNativeDriver: false, easing: Easing.inOut(Easing.sin) }),
        Animated.timing(waveAnim, { toValue: 0, duration: 1200, useNativeDriver: false, easing: Easing.inOut(Easing.sin) }),
      ])
    );
    waveLoop.current.start();
    return () => waveLoop.current?.stop();
  }, [reduceMotion]);

  const showWave = !reduceMotion && targetPct > 0 && targetPct < 1;

  return (
    <Animated.View
      style={{
        width: DROP_W,
        height: DROP_H,
        alignItems: "center",
        justifyContent: "center",
        transform: [{ scale: scaleAnim }],
      }}
    >
      {/* Confetti burst anchored to centre of the droplet */}
      <ConfettiBurst burstKey={confettiKey} />

      <Svg
        width={DROP_W}
        height={DROP_H}
        accessible
        accessibilityRole="image"
        accessibilityLabel={`Water intake ${count} of ${goal} glasses`}
      >
        <Defs>
          <ClipPath id="heroDropClip">
            <Path d={DROPLET_PATH} />
          </ClipPath>
        </Defs>

        {/* Faint background tint so outline reads even when empty */}
        <G clipPath="url(#heroDropClip)">
          <Rect x={0} y={0} width={DROP_W} height={DROP_H} fill={color} opacity={0.10} />
        </G>

        {/* Animated liquid fill — clipPath applied directly (G clipPath doesn't apply to animated children) */}
        {targetPct > 0 && (
          <AnimatedRect
            clipPath="url(#heroDropClip)"
            x={0}
            y={fillY}
            width={DROP_W}
            height={DROP_H + 10}
            fill={color}
            opacity={0.82}
          />
        )}

        {/* Wave surface ellipse oscillates horizontally */}
        {showWave && (
          <AnimatedEllipse
            clipPath="url(#heroDropClip)"
            cx={waveCx}
            cy={fillY}
            rx={48}
            ry={7}
            fill={color}
            opacity={0.40}
          />
        )}

        {/* Droplet outline on top */}
        <Path
          d={DROPLET_PATH}
          fill="none"
          stroke={color}
          strokeWidth={3}
        />
      </Svg>

      {/* Count label centred in the droplet bulge */}
      <View
        style={{
          position: "absolute",
          bottom: 44,
          alignSelf: "center",
          alignItems: "center",
        }}
        pointerEvents="none"
      >
        <Text
          style={{
            fontSize: 22,
            fontWeight: "800",
            color: targetPct >= 0.5 ? "#fff" : color,
            letterSpacing: 0.5,
          }}
        >
          {count}
          <Text style={{ fontSize: 14, fontWeight: "600" }}>/{goal}</Text>
        </Text>
      </View>
    </Animated.View>
  );
}

// ── Ripple ring animation on +1 tap ──────────────────────────────────────────

function RippleRing({ color, trigger }: { color: string; trigger: number }) {
  const rings = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];

  useEffect(() => {
    if (trigger === 0) return;
    rings.forEach((r, i) => {
      r.setValue(0);
      Animated.sequence([
        Animated.delay(i * 80),
        Animated.timing(r, { toValue: 1, duration: 500, useNativeDriver: true }),
      ]).start();
    });
  }, [trigger]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {rings.map((r, i) => (
        <Animated.View
          key={i}
          style={{
            position: "absolute",
            alignSelf: "center",
            top: "50%",
            width: 80 + i * 30,
            height: 80 + i * 30,
            marginTop: -(40 + i * 15),
            marginLeft: -(40 + i * 15) / 2,
            borderRadius: 999,
            borderWidth: 2,
            borderColor: color,
            opacity: r.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.7, 0.3, 0] }),
            transform: [{ scale: r.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.6] }) }],
          }}
        />
      ))}
    </View>
  );
}

// ── Mini 7-day droplet ────────────────────────────────────────────────────────

function MiniDayDroplet({ fillPct, color, label, isToday, textSoftColor }: { fillPct: number; color: string; label: string; isToday: boolean; textSoftColor: string }) {
  const W = 28, H = 36;
  const MINI_PATH = "M14 3 C14 3 4 14 4 22 a10 10 0 0 0 20 0 C24 14 14 3 14 3 Z";
  const innerTop = 8, innerH = 24;
  const fillH = innerH * Math.min(1, fillPct);
  const fillY = innerTop + (innerH - fillH);

  return (
    <View style={{ alignItems: "center", gap: 4 }}>
      <Svg width={W} height={H}>
        <Defs>
          <ClipPath id={`mc${label}`}>
            <Path d={MINI_PATH} />
          </ClipPath>
        </Defs>
        {fillPct > 0 && (
          <G clipPath={`url(#mc${label})`}>
            <Rect x={0} y={fillY} width={W} height={H} fill={color} opacity={0.85} />
          </G>
        )}
        <Path d={MINI_PATH} fill="none" stroke={color} strokeWidth={1.5} />
      </Svg>
      <Text style={{ fontSize: 10, fontWeight: "700", color: isToday ? color : textSoftColor }}>{label}</Text>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export function WaterDetailScreen() {
  const { theme } = useTheme();
  const reduceMotion = useReduceMotion();
  const blue = theme.blue;

  const [metricId, setMetricId] = useState<string | null>(null);
  const [goal, setGoal] = useState(DEFAULT_WATER_GOAL);
  const [todayLogs, setTodayLogs] = useState<Array<{ logged_at: string; value: number; id?: string }>>([]);
  const [weekDayTotals, setWeekDayTotals] = useState<number[]>([]); // [6 days ago .. today]
  const [stats, setStats] = useState<{ yesterday_total?: number; seven_day_average?: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [rippleTrigger, setRippleTrigger] = useState(0);
  const [goalModalVisible, setGoalModalVisible] = useState(false);
  const [goalInputText, setGoalInputText] = useState("");
  const [streak, setStreak] = useState(0);
  const [bestDayMonth, setBestDayMonth] = useState(0);
  const [undoRemove, setUndoRemove] = useState<{ timer: ReturnType<typeof setTimeout> } | null>(null);
  const [goalReachedFired, setGoalReachedFired] = useState(false);
  const [milestoneMessage, setMilestoneMessage] = useState<string | null>(null);

  const count = todayLogs.reduce((s, l) => s + Number(l.value), 0);

  // Reset goal-reached flag if count drops below goal
  useEffect(() => {
    if (count < goal && goalReachedFired) setGoalReachedFired(false);
  }, [count, goal]);

  // load goal from AsyncStorage
  useEffect(() => {
    AsyncStorage.getItem(WATER_GOAL_KEY).then((v) => {
      if (v) setGoal(Number(v));
    });
  }, []);

  async function checkWaterGoalStreakMilestone(s: number) {
    if (s <= 0) return;
    const result = await checkMilestone("water_streak", s);
    if (result.isNew) {
      setMilestoneMessage(milestoneCopy(result));
    }
  }

  const loadData = useCallback(async () => {
    try {
      const metric = await api.getOrCreateWaterMetric();
      setMetricId(metric.id);

      // Today's logs (endpoint returns all logs; filter today)
      const allLogs: Array<{ logged_at: string; value: number; id?: string }> = await api.todaysWaterCount(metric.id);
      const logs = Array.isArray(allLogs) ? allLogs : [];
      const todayOnly = logs.filter((l) => isTodayLog(l.logged_at));
      setTodayLogs(todayOnly);

      // 7-day daily totals via daily-breakdown (week_start_day=0 agg=sum)
      try {
        const breakdown = await api.metricDailyBreakdown(metric.id, 0, "sum");
        // breakdown is an array of {date, total} or similar; compute last 7 days
        // Regardless of format, we'll compute from logs if breakdown is unexpected
        if (Array.isArray(breakdown) && breakdown.length > 0) {
          const days: number[] = [];
          for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const ds = d.toDateString();
            const entry = breakdown.find(
              (b: any) => new Date(b.date ?? b.day ?? b.logged_at).toDateString() === ds
            );
            days.push(entry ? Number(entry.total ?? entry.value ?? entry.sum ?? 0) : 0);
          }
          setWeekDayTotals(days);

          // Streak: count consecutive days (from today back) meeting goal
          let s = 0;
          const todayTotal = days[6];
          if (todayTotal >= goal) { s = 1; }
          for (let i = 5; i >= 0 && days[i] >= goal; i--) s++;
          setStreak(s);
          setBestDayMonth(Math.max(...days));
          await checkWaterGoalStreakMilestone(s);
        }
      } catch (_) {
        // fallback: use logs array for 7-day from overall logs
        const days: number[] = [];
        for (let i = 6; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          days.push(sumLogs(logs, d.toDateString()));
        }
        setWeekDayTotals(days);
        let s = 0;
        if (days[6] >= goal) { s = 1; for (let i = 5; i >= 0 && days[i] >= goal; i--) s++; }
        setStreak(s);
        setBestDayMonth(Math.max(...days));
        await checkWaterGoalStreakMilestone(s);
      }

      // Stats
      try {
        const s = await api.waterStats(metric.id);
        setStats(s);
      } catch (_) {}
    } catch (e) {
      console.error("WaterDetail load error", e);
      setLoadError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [goal]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    setLoadError(false);
    loadData();
  }, [loadData]);

  useEffect(() => { loadData(); }, [loadData]);

  const logAmount = useCallback(async (delta: number) => {
    if (!metricId) return;
    if (delta < 0) {
      Haptics.selectionAsync();
      // Delayed-commit undo pattern for remove-one-glass
      if (undoRemove) {
        clearTimeout(undoRemove.timer);
      }
      // Optimistic UI update
      setTodayLogs((prev) => {
        const copy = [...prev];
        const idx = copy.findLastIndex((l) => Number(l.value) > 0);
        if (idx >= 0) copy.splice(idx, 1);
        return copy;
      });
      const timer = setTimeout(async () => {
        setUndoRemove(null);
        try {
          await api.logMetricValue(metricId, delta, new Date().toISOString());
          const logs: Array<{ logged_at: string; value: number }> = await api.todaysWaterCount(metricId);
          setTodayLogs(Array.isArray(logs) ? logs.filter((l) => isTodayLog(l.logged_at)) : []);
        } catch (_) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          Alert.alert("Oops", "Couldn't update water log. Please try again.");
          const logs: Array<{ logged_at: string; value: number }> = await api.todaysWaterCount(metricId).catch(() => []);
          setTodayLogs(Array.isArray(logs) ? logs.filter((l) => isTodayLog(l.logged_at)) : []);
        }
      }, 4000);
      setUndoRemove({ timer });
      return;
    }

    // Positive log
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newCount = count + delta;
    if (newCount >= goal && !goalReachedFired) {
      setGoalReachedFired(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    const optimisticLog = { logged_at: new Date().toISOString(), value: delta };
    setTodayLogs((prev) => [...prev, optimisticLog]);
    setRippleTrigger((t) => t + 1);

    try {
      await api.logMetricValue(metricId, delta, new Date().toISOString());
      invalidateCache(`overview:main:${todayStr()}`);
      // Refresh to get server-authoritative state
      const logs: Array<{ logged_at: string; value: number }> = await api.todaysWaterCount(metricId);
      setTodayLogs(Array.isArray(logs) ? logs.filter((l) => isTodayLog(l.logged_at)) : []);
    } catch (_) {
      // Rollback
      setTodayLogs((prev) => prev.filter((l) => l !== optimisticLog));
      Alert.alert("Oops", "Couldn't update water log. Please try again.");
    }
  }, [metricId, undoRemove, count, goal, goalReachedFired]);

  const handleUndoRemove = useCallback(() => {
    if (!undoRemove) return;
    clearTimeout(undoRemove.timer);
    setUndoRemove(null);
    // Restore by re-fetching from server (the API call was never made)
    if (metricId) {
      api.todaysWaterCount(metricId)
        .then((logs: Array<{ logged_at: string; value: number }>) => {
          setTodayLogs(Array.isArray(logs) ? logs.filter((l) => isTodayLog(l.logged_at)) : []);
        })
        .catch(() => {});
    }
  }, [undoRemove, metricId]);

  const saveGoal = useCallback(() => {
    const n = parseInt(goalInputText, 10);
    if (isNaN(n) || n < 1 || n > 30) {
      Alert.alert("Invalid", "Enter a number between 1 and 30.");
      return;
    }
    setGoal(n);
    AsyncStorage.setItem(WATER_GOAL_KEY, String(n));
    setGoalModalVisible(false);
  }, [goalInputText]);

  // Day initials for 7-day strip
  const dayInitials = ["S", "M", "T", "W", "T", "F", "S"];

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const daysAgo = 6 - i;
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return dayInitials[d.getDay()];
  });

  const weekAvg = weekDayTotals.length > 0
    ? (weekDayTotals.reduce((s, v) => s + v, 0) / weekDayTotals.length).toFixed(1)
    : "--";

  const s = StyleSheet.create({
    page: { flex: 1, backgroundColor: theme.page },
    scroll: { paddingBottom: 60 },
    center: { alignItems: "center" },
    heroWrap: {
      alignItems: "center",
      paddingTop: 28,
      paddingBottom: 16,
    },
    countRow: {
      flexDirection: "row",
      alignItems: "baseline",
      marginTop: 8,
      gap: 4,
    },
    countNum: {
      fontSize: 42,
      fontWeight: "800",
      color: blue.solid,
    },
    countOf: {
      fontSize: 18,
      fontWeight: "600",
      color: theme.textSoft,
    },
    logRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
      paddingHorizontal: 24,
      marginTop: 8,
      marginBottom: 24,
      position: "relative",
    },
    btnPrimary: {
      backgroundColor: blue.solid,
      borderRadius: 22,
      paddingVertical: 14,
      paddingHorizontal: 36,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: "rgba(60,40,20,0.18)",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 1,
      shadowRadius: 10,
      elevation: 4,
      overflow: "hidden",
    },
    btnPrimaryText: {
      fontSize: 17,
      fontWeight: "800",
      color: "#fff",
      letterSpacing: 0.4,
    },
    btnSmall: {
      backgroundColor: blue.bg,
      borderRadius: 16,
      borderWidth: 2,
      borderColor: blue.solid,
      paddingVertical: 10,
      paddingHorizontal: 18,
      alignItems: "center",
      justifyContent: "center",
    },
    btnSmallText: {
      fontSize: 15,
      fontWeight: "700",
      color: blue.sub,
    },
    section: {
      marginHorizontal: 20,
      marginBottom: 20,
      backgroundColor: theme.card,
      borderRadius: 18,
      padding: 16,
      shadowColor: "rgba(60,40,20,0.10)",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 1,
      shadowRadius: 8,
      elevation: 2,
    },
    sectionTitle: {
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 0.7,
      color: blue.sub,
      marginBottom: 12,
      textTransform: "uppercase",
    },
    timelineDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: blue.solid,
      marginRight: 8,
      marginTop: 2,
    },
    timelineRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      marginBottom: 6,
    },
    timelineTime: {
      fontSize: 13,
      fontWeight: "600",
      color: theme.textStrong,
      flex: 1,
    },
    timelineVal: {
      fontSize: 12,
      fontWeight: "500",
      color: theme.textSoft,
    },
    weekRow: {
      flexDirection: "row",
      justifyContent: "space-around",
      alignItems: "flex-end",
    },
    statRow: {
      flexDirection: "row",
      justifyContent: "space-between",
    },
    statBox: {
      flex: 1,
      alignItems: "center",
      paddingVertical: 10,
    },
    statVal: {
      fontSize: 22,
      fontWeight: "800",
      color: blue.solid,
    },
    statLabel: {
      fontSize: 10,
      fontWeight: "700",
      color: theme.textSoft,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginTop: 2,
      textAlign: "center",
    },
    goalRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    goalText: {
      fontSize: 15,
      fontWeight: "600",
      color: theme.textStrong,
    },
    pencilBtn: {
      padding: 6,
    },
    pencilText: {
      fontSize: 18,
    },
    divider: {
      height: 1,
      backgroundColor: theme.cardBorder,
      opacity: 0.4,
      marginVertical: 8,
    },
    emptyTimeline: {
      fontSize: 13,
      color: theme.textSoft,
      textAlign: "center",
      paddingVertical: 8,
    },
  });

  // Expand half-glass logs for timeline display
  const timelineItems = todayLogs
    .filter((l) => Number(l.value) > 0)
    .sort((a, b) => new Date(a.logged_at).getTime() - new Date(b.logged_at).getTime());

  return (
    <View style={[s.page, { position: "relative" }]}>
      <ScreenBackground />
      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.blue.bar ?? theme.blue.solid} colors={[theme.blue.bar ?? theme.blue.solid]} />}
      >
        {loadError && (
          <View style={{ margin: 16, padding: 14, backgroundColor: theme.card, borderRadius: 16, borderWidth: 1, borderColor: theme.danger }}>
            <Text style={{ color: theme.danger, fontWeight: "600", marginBottom: 8 }}>Failed to load water data.</Text>
            <Pressable onPress={() => { setLoadError(false); setLoading(true); loadData(); }} style={{ alignSelf: "flex-start", paddingHorizontal: 14, paddingVertical: 6, backgroundColor: theme.danger, borderRadius: 10 }}>
              <Text style={{ color: "#fff", fontWeight: "700" }}>Retry</Text>
            </Pressable>
          </View>
        )}
        {/* Hero */}
        <View style={s.heroWrap}>
          <HeroDroplet
            count={count}
            goal={goal}
            color={blue.solid}
            reduceMotion={reduceMotion}
            onGoalReached={() => {
              // Extra haptic already fired in logAmount; banner handled by HeroDroplet confetti
            }}
          />
          <View style={s.countRow}>
            <CountUpText value={count} style={s.countNum} duration={400} />
            <Text style={s.countOf}> of {goal} glasses</Text>
          </View>
          <Text style={{ fontSize: 12, color: theme.textSoft, marginTop: 2 }}>
            {count >= goal ? "🎉 Goal reached!" : `${goal - count} more to reach your goal`}
          </Text>
        </View>

        {/* Log controls */}
        <View style={s.logRow}>
          <Pressable style={s.btnSmall} onPress={() => logAmount(-1)} accessibilityLabel="Remove one glass">
            <Text style={s.btnSmallText}>−1</Text>
          </Pressable>

          <Pressable
            style={s.btnPrimary}
            onPress={() => logAmount(1)}
            accessibilityLabel="Log one glass of water"
          >
            <Text style={s.btnPrimaryText}>+ 1 Glass 💧</Text>
            <RippleRing color="#ffffff" trigger={rippleTrigger} />
          </Pressable>

          <Pressable style={s.btnSmall} onPress={() => logAmount(0.5)} accessibilityLabel="Log half glass">
            <Text style={s.btnSmallText}>+½</Text>
          </Pressable>
        </View>

        {/* Today timeline */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Today's Log</Text>
          {timelineItems.length === 0 ? (
            <Text style={s.emptyTimeline}>No glasses logged yet today.</Text>
          ) : (
            timelineItems.map((l, i) => (
              <View key={i} style={s.timelineRow}>
                <View style={s.timelineDot} />
                <Text style={s.timelineTime}>{formatTime(l.logged_at)}</Text>
                <Text style={s.timelineVal}>{Number(l.value) === 0.5 ? "½ glass" : `${l.value} glass`}</Text>
              </View>
            ))
          )}
        </View>

        {/* 7-day strip */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Last 7 Days</Text>
          <View style={s.weekRow}>
            {weekDays.map((label, i) => {
              const total = weekDayTotals[i] ?? 0;
              const isToday = i === 6;
              return (
                <View key={i} style={{ alignItems: "center", gap: 4 }}>
                  <Text style={{ fontSize: 10, color: theme.textSoft, fontWeight: "600" }}>
                    {total > 0 ? total.toFixed(total % 1 === 0 ? 0 : 1) : "–"}
                  </Text>
                  <MiniDayDroplet
                    fillPct={total / goal}
                    color={blue.solid}
                    label={label}
                    isToday={isToday}
                    textSoftColor={theme.textSoft}
                  />
                </View>
              );
            })}
          </View>
        </View>

        {/* Stats row */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Stats</Text>
          <View style={s.statRow}>
            <View style={s.statBox}>
              <Text style={s.statVal}>{streak}</Text>
              <Text style={s.statLabel}>Day Streak</Text>
            </View>
            <View style={[s.statBox, { borderLeftWidth: 1, borderRightWidth: 1, borderColor: theme.cardBorder + "66" }]}>
              <Text style={s.statVal}>{bestDayMonth}</Text>
              <Text style={s.statLabel}>Best Day (7d)</Text>
            </View>
            <View style={s.statBox}>
              <Text style={s.statVal}>{weekAvg}</Text>
              <Text style={s.statLabel}>Avg / Day (7d)</Text>
            </View>
          </View>
          {stats && (
            <>
              <View style={s.divider} />
              <Text style={{ fontSize: 12, color: theme.textSoft, textAlign: "center" }}>
                Yesterday: {stats.yesterday_total ?? 0} glasses
                {stats.seven_day_average != null
                  ? `  ·  7d avg: ${Math.round(stats.seven_day_average)} glasses`
                  : ""}
              </Text>
            </>
          )}
        </View>

        {/* Goal editor */}
        <View style={s.section}>
          <View style={s.goalRow}>
            <Text style={s.goalText}>Daily Goal: {goal} glasses</Text>
            <Pressable
              style={s.pencilBtn}
              onPress={() => {
                setGoalInputText(String(goal));
                setGoalModalVisible(true);
              }}
              accessibilityLabel="Edit daily water goal"
            >
              <Text style={s.pencilText}>✏️</Text>
            </Pressable>
          </View>
          <Text style={{ fontSize: 12, color: theme.textSoft, marginTop: 4 }}>
            Saved locally on this device.
          </Text>
        </View>
      </ScrollView>

      {undoRemove && (
        <UndoBanner
          message="Glass removed"
          onUndo={handleUndoRemove}
          theme={theme}
        />
      )}

      {milestoneMessage && (
        <MilestoneBanner
          message={milestoneMessage}
          onDismiss={() => setMilestoneMessage(null)}
        />
      )}

      {/* Goal editor modal */}
      <Modal
        visible={goalModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setGoalModalVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", alignItems: "center" }}>
          <View
            style={{
              backgroundColor: theme.card,
              borderRadius: 20,
              padding: 28,
              width: 280,
              shadowColor: "rgba(60,40,20,0.2)",
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 1,
              shadowRadius: 16,
              elevation: 8,
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: "800", color: theme.textStrong, marginBottom: 16 }}>
              Set Daily Goal
            </Text>
            <TextInput
              value={goalInputText}
              onChangeText={setGoalInputText}
              keyboardType="number-pad"
              style={{
                borderWidth: 2,
                borderColor: blue.solid,
                borderRadius: 12,
                padding: 12,
                fontSize: 20,
                fontWeight: "700",
                color: theme.textStrong,
                textAlign: "center",
                backgroundColor: theme.cream,
                marginBottom: 20,
              }}
              autoFocus
              selectTextOnFocus
              maxLength={2}
              accessibilityLabel="Daily water goal in glasses"
            />
            <View style={{ flexDirection: "row", gap: 12 }}>
              <Pressable
                style={{ flex: 1, padding: 12, borderRadius: 12, borderWidth: 2, borderColor: blue.solid, alignItems: "center" }}
                onPress={() => setGoalModalVisible(false)}
              >
                <Text style={{ fontWeight: "700", color: blue.sub }}>Cancel</Text>
              </Pressable>
              <Pressable
                style={{ flex: 1, padding: 12, borderRadius: 12, backgroundColor: blue.solid, alignItems: "center" }}
                onPress={saveGoal}
              >
                <Text style={{ fontWeight: "700", color: "#fff" }}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
