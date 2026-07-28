import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
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
import { onSolid } from "../theme/colorUtils";
import { coloredShadow } from "../theme/styleUtils";
import { ShadowCard } from "../components/ShadowCard";
import { api } from "../api/client";
import { DailySummaryCard, type DailySummaryData } from "../components/DailySummaryCard";
import { InsightCard, type Insight } from "../components/InsightCard";
import { toast, Msg } from "../lib/toast";
import { MoodCheckInModal, type MoodPeriod } from "../components/MoodCheckInModal";
import { MoodPageSheet } from "../components/MoodPageSheet";
import { MilestoneBanner } from "../components/MilestoneBanner";
import { checkMilestone, milestoneCopy } from "../utils/milestones";
import { resolveLayout, type DashboardLayout, type CardId } from "../constants/dashboardCards";
import { TooltipBubble } from "../components/TooltipBubble";
import { hasSeenTooltip, markTooltipSeen } from "../utils/tooltipSeen";
import { DashboardEditorModal } from "../components/DashboardEditorModal";
import { FeatureTour, type TourStep } from "../components/FeatureTour";
import { useFocusEffect } from "@react-navigation/native";
import { maybeFireWeeklyDigest } from "../lib/smartNotifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getFastStatus, startFast, stopFast, formatElapsed, FastStatus } from "../lib/fastingTimer";
import { ScreenBackground } from "../components/ScreenBackground";
import { ThemedIcon, moodScoreEmoji } from '../theme/iconRegistry';
import { ThemedSurface } from '../theme/pageTemplates';
import { WeeklyDigestModal } from "../components/WeeklyDigestModal";

// ─── Types ────────────────────────────────────────────────────────────────────

type JournalEntry = {
  id: string;
  logged_at: string;
  mood_score: number;
  mood_label: string | null;
  entry_text: string | null;
  period: string | null;
  entry_type: string;
};

type WeeklyDay = {
  date: string;
  avg_mood: number | null;
  sleep_hours: number;
  total_spent: number;
};

type PatternEvent = {
  time: string;
  type: "mood" | "spend" | "meal" | "glucose_spike" | "water" | "hobby";
  label: string;
  entry_type?: string;
  period?: string;
};

type GlucoseReading = { recorded_at: string; mg_dl: number };

type DayEvent = {
  time: string;
  type: "mood" | "meal" | "spend";
  label: string;
  entry_type?: string;
  mood_score?: number;
  carbs_g?: number | null;
};

type WeeklyDigest = {
  glucose_by_tod: Partial<Record<string, { avg: number; count: number }>>;
  meal_flags: Array<{ label: string }>;
  spending_spikes: Array<{ label: string }>;
  heart_rate: { has_data: boolean; resting?: number; peak?: number };
  steps: { this_week: number; last_week: number };
  hobbies: { this_week_sessions: number; last_week_sessions: number };
  exercise?: { sessions_this_week: number; total_minutes_this_week: number };
  books?: { finished_this_month: number };
  mood?: { avg_this_week: number | null };
};

type GlucoseStatus = { hasData: boolean; mg_dl: number | null; arrow: string | null };
type SleepStats = { yesterday_seconds: number; seven_day_average_seconds: number };

type Bucket = "morning" | "afternoon" | "evening" | "night";

// ─── Constants ────────────────────────────────────────────────────────────────

const BUCKET_ORDER: Bucket[] = ["morning", "afternoon", "evening", "night"];
const BUCKET_LABEL: Record<Bucket, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
  night: "Night",
};

const SCREEN_W = Dimensions.get("window").width;
const CHART_W = SCREEN_W - 64;
// 16dp page padding each side, 8dp gap between 3 chips → 2 gaps
const CHIP_W = Math.floor((SCREEN_W - 32 - 16) / 3);
const WATER_GOAL = 8;
const CHART_H = 140;
const PAD_L = 28;
const PAD_B = 16;
const PAD_T = 10;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeOfDayBucket(date: Date): Bucket {
  const h = date.getHours();
  if (h >= 5 && h < 11) return "morning";
  if (h >= 11 && h < 16) return "afternoon";
  if (h >= 16 && h < 21) return "evening";
  return "night";
}

function getGreeting(): { text: string; emojiSlot: string } {
  const hour = new Date().getHours();
  if (hour < 12) return { text: "Good morning",   emojiSlot: "greeting.morning"   };
  if (hour < 17) return { text: "Good afternoon", emojiSlot: "greeting.afternoon" };
  return           { text: "Good evening",   emojiSlot: "greeting.evening"   };
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.getHours().toString().padStart(2, "0") + ":" + d.getMinutes().toString().padStart(2, "0");
}

function fmtDayLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getDay()];
}

function fmtSleep(seconds: number): string {
  if (seconds <= 0) return "--";
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (m === 0) return h + "h";
  return h + "h " + m + "m";
}

function computeTIR(readings: GlucoseReading[]): number | null {
  if (readings.length < 3) return null;
  const inRange = readings.filter(r => Number(r.mg_dl) >= 70 && Number(r.mg_dl) <= 180).length;
  return Math.round((inRange / readings.length) * 100);
}

function weekGlucoseAvg(glucose_by_tod: WeeklyDigest["glucose_by_tod"]): number | null {
  let totalWeighted = 0;
  let totalCount = 0;
  for (const v of Object.values(glucose_by_tod)) {
    if (v) { totalWeighted += v.avg * v.count; totalCount += v.count; }
  }
  return totalCount > 0 ? Math.round(totalWeighted / totalCount) : null;
}

function interpolateGlucose(readings: GlucoseReading[], t: number): number | null {
  if (readings.length === 0) return null;
  let before: GlucoseReading | null = null;
  let after: GlucoseReading | null = null;
  for (const r of readings) {
    const rt = new Date(r.recorded_at).getTime();
    if (rt <= t) before = r;
    else if (!after) after = r;
  }
  if (!before && !after) return null;
  if (!before) return Number(after!.mg_dl);
  if (!after) {
    return (t - new Date(before.recorded_at).getTime()) <= 20 * 60 * 1000 ? Number(before.mg_dl) : null;
  }
  const bt = new Date(before.recorded_at).getTime();
  const at = new Date(after.recorded_at).getTime();
  return Number(before.mg_dl) + ((t - bt) / (at - bt)) * (Number(after.mg_dl) - Number(before.mg_dl));
}

function glucoseY(val: number, minVal: number, maxVal: number): number {
  const usableH = CHART_H - PAD_T - PAD_B;
  return PAD_T + usableH - ((val - minVal) / (maxVal - minVal)) * usableH;
}

function eventX(t: number, windowStart: number, windowEnd: number): number {
  return PAD_L + ((t - windowStart) / (windowEnd - windowStart)) * (CHART_W - PAD_L);
}

function streakMotivationMessage(maxStreak: number): string | null {
  if (maxStreak >= 100) return "100 days! You're in rare company 🏆";
  if (maxStreak >= 60) return "Two months of showing up — unstoppable 🌟";
  if (maxStreak >= 30) return "One full month! You've built a real habit 💪";
  if (maxStreak >= 20) return "20 days strong — this is who you are now 🔥";
  if (maxStreak >= 10) return "Double digits! Keep the momentum going 🎯";
  if (maxStreak >= 5) return "5 days in — the habit is forming 🌱";
  return null;
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
      insights.push("No midday meal logged yet — you usually log one around this time.");
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

// ─── Skeleton box component ───────────────────────────────────────────────────

function SkeletonBox({ style }: { style?: object }) {
  const { theme } = useTheme();
  const shimmer = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
  }, []);
  useEffect(() => {
    if (reduceMotion) return;
    Animated.loop(
      Animated.timing(shimmer, { toValue: 1, duration: 1100, useNativeDriver: true })
    ).start();
  }, [shimmer, reduceMotion]);
  const translateX = shimmer.interpolate({ inputRange: [0, 1], outputRange: [-150, SCREEN_W + 50] });
  return (
    <View style={[{ backgroundColor: theme.cardBorder, borderRadius: 16, overflow: "hidden" }, style]}>
      {!reduceMotion && (
        <Animated.View style={{ position: "absolute", top: 0, bottom: 0, width: 120, transform: [{ translateX }] }}>
          <LinearGradient
            colors={["transparent", "rgba(255,255,255,0.15)", "transparent"]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={{ flex: 1 }}
          />
        </Animated.View>
      )}
    </View>
  );
}

// ─── Water droplet SVG ───────────────────────────────────────────────────────

function WaterDroplet({ count, fillPct, color }: { count: number; fillPct: number; color: string }) {
  const W = 32, H = 38;
  const DROP = "M16,3 C12,8 4,18 4,27 C4,34.2 9.4,38 16,38 C22.6,38 28,34.2 28,27 C28,18 20,8 16,3Z";
  const fillH = H * fillPct;
  const fillY = H - fillH;
  return (
    <View style={{ width: W, height: H, alignItems: "center", justifyContent: "center" }}>
      <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute" }}>
        <Defs>
          <ClipPath id="wdrop">
            <Path d={DROP} />
          </ClipPath>
        </Defs>
        <Path d={DROP} fill="none" stroke={color} strokeWidth="2" opacity={0.3} />
        {fillH > 0 && (
          <Rect x={0} y={fillY} width={W} height={fillH + 1} fill={color} opacity={0.7} clipPath="url(#wdrop)" />
        )}
      </Svg>
      <Text style={{ position: "absolute", bottom: 6, fontSize: 11, fontWeight: "900", color: fillPct > 0.3 ? "#fff" : color }}>
        {count}
      </Text>
    </View>
  );
}

// ─── Animated counter text ────────────────────────────────────────────────────

function AnimatedCounterText({
  animValue,
  targetValue,
  style,
  format,
}: {
  animValue: Animated.Value;
  targetValue: number;
  style?: object;
  format?: (v: number) => string;
}) {
  // interpolateNode produces a JS-driven string — we must use Animated.Text
  const interpolated = animValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0, targetValue],
  });
  // We need a listener to convert to a display string; use state + addListener
  const [display, setDisplay] = useState(() => (format ? format(0) : "0"));
  useEffect(() => {
    const id = (interpolated as any).addListener(({ value }: { value: number }) => {
      setDisplay(format ? format(Math.floor(value)) : String(Math.floor(value)));
    });
    return () => (interpolated as any).removeListener(id);
  }, [interpolated, format]);
  return <Text style={style} numberOfLines={1}>{display}</Text>;
}

// ─── Animated chip wrapper ────────────────────────────────────────────────────

function AnimatedChip({
  entranceAnim,
  children,
  onPress,
  onPressIn,
  onPressOut,
  chipWidth,
  dimmed,
  style,
  accessibilityLabel,
  accessibilityRole,
}: {
  entranceAnim: Animated.Value;
  children: React.ReactNode;
  onPress?: () => void;
  onPressIn?: () => void;
  onPressOut?: () => void;
  chipWidth?: number;
  dimmed?: boolean;
  style?: object;
  accessibilityLabel?: string;
  accessibilityRole?: "button" | "none" | "link" | "search" | "image" | "keyboardkey" | "text" | "adjustable" | "imagebutton" | "header" | "summary" | "checkbox" | "combobox" | "menu" | "menubar" | "menuitem" | "progressbar" | "radio" | "radiogroup" | "scrollbar" | "spinbutton" | "switch" | "tab" | "tablist" | "timer" | "toolbar";
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Haptics.selectionAsync();
    Animated.spring(scaleAnim, { toValue: 0.94, useNativeDriver: true, damping: 18, stiffness: 400 }).start();
    onPressIn?.();
  };
  const handlePressOut = () => {
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, damping: 18, stiffness: 400 }).start();
    onPressOut?.();
  };

  const entranceOpacity = entranceAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const entranceTranslateY = entranceAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] });

  // Plain View with explicit pixel width avoids percentage ambiguity through animated layers.
  return (
    <View style={{ width: chipWidth }}>
      <Animated.View style={{ opacity: entranceOpacity, transform: [{ translateY: entranceTranslateY }] }}>
        <Animated.View style={{ opacity: dimmed ? 0.55 : 1, transform: [{ scale: scaleAnim }] }}>
          <Pressable
            onPress={onPress}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            style={[style, { width: chipWidth }]}
            accessibilityLabel={accessibilityLabel}
            accessibilityRole={accessibilityRole}
          >
            {children}
          </Pressable>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

// ─── Correlation chart constants ──────────────────────────────────────────────

const CORR_W = SCREEN_W - 64;
const CORR_H = 90;
const BAR_W = Math.floor((CORR_W / 7) * 0.35);
const STEP = CORR_W / 7;

// ─── Component ───────────────────────────────────────────────────────────────

export function OverviewScreen() {
  const { theme, mode } = useTheme();
  const navigation = useNavigation<any>();
  const ink = theme.ink;
  const card = theme.card;
  const styles = useMemo(() => makeStyles(ink, card, theme.cardBorder), [ink, card, theme.cardBorder]);

  // Existing state
  const [todayEntries, setTodayEntries] = useState<JournalEntry[]>([]);
  const [weeklyData, setWeeklyData] = useState<WeeklyDay[]>([]);
  const [patternEvents, setPatternEvents] = useState<PatternEvent[]>([]);
  const [digest, setDigest] = useState<WeeklyDigest | null>(null);
  const [dayGlucose, setDayGlucose] = useState<GlucoseReading[]>([]);
  const [yesterdayGlucose, setYesterdayGlucose] = useState<GlucoseReading[]>([]);
  const [dayEvents, setDayEvents] = useState<DayEvent[]>([]);
  const [streak, setStreak] = useState(0);
  const [allStreaks, setAllStreaks] = useState<{ label: string; icon: string; count: number; color: (t: any) => string }[]>([]);
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
  const [dashboardLayout, setDashboardLayout] = useState<DashboardLayout>({ order: ["metric_chips","trends_nav","daily_summary","top_insight","timeline","insights","weekly_review","mood_pattern","cross_metric"], hidden: [] });
  const [showTooltip, setShowTooltip] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const [tourPadding, setTourPadding] = useState(0);

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

  // Number counter animations (0→1, interpolate to real value)
  const stepsCounterAnim = useRef(new Animated.Value(0)).current;
  const waterCounterAnim = useRef(new Animated.Value(0)).current;
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
  const timelinePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        timelineScrubberX.current = evt.nativeEvent.locationX;
        updateTimelineScrubber(evt.nativeEvent.locationX);
      },
      onPanResponderMove: (evt) => {
        timelineScrubberX.current = evt.nativeEvent.locationX;
        updateTimelineScrubber(evt.nativeEvent.locationX);
      },
      onPanResponderRelease: (evt, gs) => {
        snapTimelineScrubber(timelineScrubberX.current);
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

  const load = useCallback(async function () {
    try {
      const today = new Date().toISOString().split("T")[0];

      const dayMs = 24 * 60 * 60 * 1000;
      const nowMs = Date.now();
      const [entries, weekly, pattern, dig, day, streakData, glucSt, meals, steps, sleep, dse, insightsList, yestGluc, tirRes] =
        await Promise.all([
          api.journalToday(),
          api.weeklyMoodSummary(),
          api.pattern(),
          api.weeklyDigest(),
          api.dayView(today),
          api.streaks(),
          api.glucoseStatus().catch(() => null),
          api.meals(today).catch(() => []),
          api.stepsToday(today).catch(() => null),
          api.sleepStats().catch(() => null),
          api.dailySummary(today).catch(() => null),
          api.getInsights().catch(() => null),
          api.glucoseRange(
            new Date(nowMs - dayMs - 16 * 3600 * 1000).toISOString(),
            new Date(nowMs - dayMs).toISOString()
          ).catch(() => []),
          api.getGlucoseTir(today).catch(() => null),
        ]);

      // Water count (sequential — needs metricId)
      let wCount = 0;
      try {
        const waterMetric = await api.getOrCreateWaterMetric();
        if (waterMetric?.id) {
          const logs: any[] = await api.todaysWaterCount(waterMetric.id);
          const todayStr = new Date().toDateString();
          wCount = Array.isArray(logs)
            ? logs
                .filter(l => new Date(l.logged_at).toDateString() === todayStr)
                .reduce((sum, l) => sum + Number(l.value), 0)
            : 0;
        }
      } catch (_) {}

      setTodayEntries(Array.isArray(entries) ? entries : []);
      const weeklyArr: WeeklyDay[] = Array.isArray(weekly) ? weekly : [];
      setWeeklyData(weeklyArr);
      setWeekMoods(weeklyArr.map(d => ({ date: d.date, score: d.avg_mood })));
      setPatternEvents(Array.isArray(pattern) ? pattern : []);
      setDigest(dig ?? null);
      if (dig) maybeFireWeeklyDigest(dig).catch(() => {});
      const mealStreak     = Number(streakData?.meal_streak     ?? 0);
      const moodStreak     = Number(streakData?.mood_streak     ?? 0);
      const stepsStreak    = Number(streakData?.steps_streak    ?? 0);
      const exerciseStreak = Number(streakData?.exercise_streak ?? 0);
      const readingStreak  = Number(streakData?.reading_streak  ?? 0);
      const stepsVal = steps?.steps ?? null;
      setStreak(mealStreak);
      setAllStreaks([
        { label: "Meals",    icon: "🍽",  count: mealStreak,     color: (t: any) => t.teal.solid },
        { label: "Mood",     icon: "😊",  count: moodStreak,     color: (t: any) => t.violet?.solid ?? t.purple.solid },
        { label: "Steps",    icon: "👟",  count: stepsStreak,    color: (t: any) => t.teal.solid },
        { label: "Exercise", icon: "🏋️", count: exerciseStreak, color: (t: any) => t.coral.solid },
        { label: "Reading",  icon: "📚",  count: readingStreak,  color: (t: any) => t.amber.solid },
      ].filter(s => s.count >= 2));
      setGlucoseStatus(glucSt);
      setTodayMeals(Array.isArray(meals) ? meals : []);
      setStepsCount(stepsVal);
      setTirPercent(tirRes?.tir_percent ?? null);

      // Milestone checks — fire at most one celebration per load
      const candidates = await Promise.all([
        stepsVal !== null ? checkMilestone("steps_daily", stepsVal) : null,
        mealStreak > 0 ? checkMilestone("meal_streak", mealStreak) : null,
        moodStreak > 0 ? checkMilestone("mood_streak", moodStreak) : null,
      ]);
      const winner = candidates.find(c => c?.isNew);
      if (winner) setMilestoneMessage(milestoneCopy(winner));
      setSleepStats(sleep ?? null);
      setWaterCount(wCount);
      setDailySummary(dse ?? null);
      const activeInsights: Insight[] = Array.isArray(insightsList) ? insightsList : [];
      setAllInsights(activeInsights);
      setTopInsight(activeInsights[0] ?? null);

      if (day) {
        setDayGlucose(Array.isArray(day.glucose) ? day.glucose : []);
        setDayEvents(Array.isArray(day.events) ? day.events : []);
      }
      const yestArray = Array.isArray(yestGluc) ? yestGluc : [];
      setYesterdayGlucose(yestArray.map((r: GlucoseReading) => ({
        ...r,
        recorded_at: new Date(new Date(r.recorded_at).getTime() + dayMs).toISOString(),
      })));

      api.crossMetric().then((cm: any) => { if (cm) setCrossMetricData(cm); }).catch(() => {});
    } catch {
      toast(Msg.loadData, "error");
    } finally {
      setLoading(false);
    }
  }, []);

  async function handleRefresh() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }

  async function handleSaveLayout(newLayout: DashboardLayout) {
    setDashboardLayout(newLayout);
    setShowEditor(false);
    try { await api.patchSettings({ dashboard_layout: newLayout }); } catch (_) {}
  }

  useEffect(function () { load(); }, [load]);

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
  }, []);

  useFocusEffect(useCallback(() => {
    hasSeenTooltip("overview").then(seen => {
      if (!seen) {
        setShowTooltip(true);
        markTooltipSeen("overview");
      }
    });
    hasSeenTooltip("home-tour").then(seen => {
      if (!seen) {
        markTooltipSeen("home-tour");
        setTimeout(() => setShowTour(true), 600);
      }
    });
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
    const today = new Date().toISOString().slice(0, 10);
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
    AsyncStorage.getItem("pinned_insight_ids").then((raw) => {
      const ids: string[] = raw ? JSON.parse(raw) : [];
      setPinnedIds(new Set(ids));
    }).catch(() => {});
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
        // Increment detected — spring bounce + haptic
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
  }, [loading, stepsCount, waterCount]);

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
  const allGlucoseValues = [...dayGlucose, ...yesterdayGlucose].map((r) => Number(r.mg_dl));
  const minVal = allGlucoseValues.length ? Math.min(...allGlucoseValues, 70) - 10 : 60;
  const maxVal = allGlucoseValues.length ? Math.max(...allGlucoseValues, 140) + 10 : 200;
  const dayTimes = dayGlucose.map((r) => new Date(r.recorded_at).getTime());
  const windowStart = dayTimes.length ? Math.min(...dayTimes) : Date.now() - 8 * 3600000;
  const windowEnd = dayTimes.length ? Math.max(Math.max(...dayTimes), Date.now()) : Date.now();
  scrubData.current = { windowStart, windowEnd, minVal, maxVal, dayGlucose, yesterdayGlucose };
  const glucosePoints = dayGlucose
    .map(r => eventX(new Date(r.recorded_at).getTime(), windowStart, windowEnd) + "," + glucoseY(Number(r.mg_dl), minVal, maxVal))
    .join(" ");
  const yesterdayPoints = yesterdayGlucose
    .map(r => eventX(new Date(r.recorded_at).getTime(), windowStart, windowEnd) + "," + glucoseY(Number(r.mg_dl), minVal, maxVal))
    .join(" ");
  const highBandY = glucoseY(180, minVal, maxVal);
  const lowBandY = glucoseY(70, minVal, maxVal);
  const usableH = CHART_H - PAD_T - PAD_B;

  // Correlation chart
  const maxSpend = Math.max(...weeklyData.map((d) => d.total_spent), 1);
  const maxSleep = Math.max(...weeklyData.map((d) => d.sleep_hours), 8);
  function moodBarH(avg_mood: number | null) { return avg_mood === null ? 0 : ((avg_mood - 1) / 4) * CORR_H; }
  function compBarH(d: WeeklyDay) {
    return correlation === "sleep" ? (d.sleep_hours / maxSleep) * CORR_H : (d.total_spent / maxSpend) * CORR_H;
  }

  // Timeline events — show all (water + hobbies now included from backend)
  const visibleEvents = showAllEvents ? patternEvents : patternEvents.slice(0, 8);

  // Weekly recap (Monday only)
  const isWeekStart = new Date().getDay() === 1;
  const showRecap = isWeekStart && !recapDismissed && digest !== null;
  const glucoseAvg = digest ? weekGlucoseAvg(digest.glucose_by_tod) : null;

  // Date string for header
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  // ── Event type styling helpers ─────────────────────────────────────────────
  function eventDotColor(type: PatternEvent["type"]): string {
    switch (type) {
      case "meal": return theme.coral.solid;
      case "mood": return theme.violet.solid;
      case "spend": return theme.purple.solid;
      case "glucose_spike": return theme.red.solid;
      case "water": return theme.blue.solid;
      case "hobby": return theme.teal.solid;
      default: return theme.textSoft;
    }
  }

  function eventIcon(type: PatternEvent["type"]): string {
    switch (type) {
      case "meal": return "restaurant";
      case "mood": return "happy-outline";
      case "spend": return "card-outline";
      case "glucose_spike": return "pulse";
      case "water": return "water-outline";
      case "hobby": return "barbell-outline";
      default: return "ellipse";
    }
  }

  // ─── Metric chip renderer ─────────────────────────────────────────────────
  type ChipData = {
    label: string;
    value: string;
    sub?: string;
    color: string;
    icon: string;
    empty?: boolean;
    onPress?: () => void;
    tileId?: string;
  };

  const currentMoodEntry = entryPerPeriod[currentBucket];
  const chips: ChipData[] = [
    {
      label: "GLUCOSE",
      value: glucoseStatus?.hasData && glucoseStatus.mg_dl != null
        ? String(glucoseStatus.mg_dl) + (glucoseStatus.arrow ? " " + glucoseStatus.arrow : "")
        : "--",
      sub: tir !== null ? tir + "% in range" : "mg/dL",
      color: theme.berry.solid,
      icon: "pulse",
      empty: !glucoseStatus?.hasData,
      tileId: "overview_glucose",
    },
    {
      label: "STEPS",
      value: stepsCount != null ? stepsCount.toLocaleString() : "--",
      sub: "today",
      color: theme.teal.solid,
      icon: "walk",
      empty: stepsCount === null,
      tileId: "overview_steps",
    },
    {
      label: "SLEEP",
      value: sleepStats && sleepStats.yesterday_seconds > 0
        ? fmtSleep(sleepStats.yesterday_seconds)
        : "--",
      sub: "last night",
      color: theme.amber.solid,
      icon: "moon-outline",
      empty: !sleepStats || sleepStats.yesterday_seconds === 0,
      tileId: "overview_sleep",
    },
    {
      label: "WATER",
      value: waterCount > 0 ? String(waterCount) : "--",
      sub: "glasses",
      color: theme.blue.solid,
      icon: "water-outline",
      empty: waterCount === 0,
      tileId: "overview_water",
    },
    {
      label: "MEALS",
      value: todayMeals.length > 0 ? String(todayMeals.length) : "--",
      sub: "logged",
      color: theme.coral.solid,
      icon: "restaurant",
      empty: todayMeals.length === 0,
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
    },
  ];

  // ─── Render ───────────────────────────────────────────────────────────────

  function renderCard(id: CardId): React.ReactNode {
    switch (id) {
      case "metric_chips":
        return loading ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {[1,2,3,4,5,6].map(i => <SkeletonBox key={i} style={{ width: CHIP_W, height: 84 }} />)}
          </View>
        ) : (
          <View>
          <View ref={tourChipsRef} style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }} accessibilityLabel="Key metrics">
            {chips.map((chip, index) => {
              // Determine if this chip uses an animated counter
              const isSteps = chip.label === "STEPS" && stepsCount !== null && stepsCount > 0;
              const isWater = chip.label === "WATER" && waterCount > 0;
              const animValue = isSteps ? stepsCounterAnim : isWater ? waterCounterAnim : null;
              const realNum  = isSteps ? stepsCount! : isWater ? waterCount : 0;
              const entranceAnim = chipAnims.current[index] ?? new Animated.Value(1);
              return (
                <AnimatedChip
                  key={chip.label}
                  entranceAnim={entranceAnim}
                  onPress={chip.onPress}
                  chipWidth={CHIP_W}
                  dimmed={chip.empty}
                  style={[styles.metricChip, { borderColor: ink, overflow: "hidden" }]}
                  accessibilityLabel={chip.label + ": " + chip.value}
                  accessibilityRole={chip.onPress ? "button" : undefined}
                >
                  {chip.tileId && (
                    <ThemedSurface elementId={chip.tileId} kind="tile" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} imageOpacity={0.85} />
                  )}
                  <View style={[styles.chipIcon, { backgroundColor: chip.color }]}>
                    <Ionicons name={chip.icon as any} size={13} color={onSolid(chip.color)} />
                  </View>
                  {chip.label === "WATER" && waterCount > 0 ? (
                    <WaterDroplet count={waterCount} fillPct={Math.min(waterCount / WATER_GOAL, 1)} color={chip.color} />
                  ) : chip.label === "MOOD" && !chip.empty ? (
                    <Animated.View style={{ transform: [{ scale: moodScaleAnim }] }}>
                      <Text style={[styles.chipValue, { color: theme.textStrong }]} numberOfLines={1}>{chip.value}</Text>
                    </Animated.View>
                  ) : animValue ? (
                    <AnimatedCounterText
                      animValue={animValue}
                      targetValue={realNum}
                      style={[styles.chipValue, { color: theme.textStrong }]}
                      format={isSteps ? (v) => v.toLocaleString() : undefined}
                    />
                  ) : (
                    <Text style={[styles.chipValue, { color: theme.textStrong }]} numberOfLines={1}>{chip.value}</Text>
                  )}
                  {chip.label !== "WATER" && chip.sub ? <Text style={[styles.chipSub, { color: theme.textSoft }]} numberOfLines={1}>{chip.sub}</Text> : null}
                  <Text style={[styles.chipLabel, { color: theme.textSoft }]}>{chip.label}</Text>
                </AnimatedChip>
              );
            })}
          </View>
          </View>
        );

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
        return dailySummary ? <DailySummaryCard data={dailySummary} /> : null;

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
          <View ref={tourTimelineRef}>
          <ShadowCard size="card" bg={glucoseOutOfRange ? theme.red.tint : theme.card} accent={theme.berry.solid}>
            <Text style={[styles.cardTitle, { color: theme.textStrong }]}>Today's timeline</Text>
            {loading ? (
              <SkeletonBox style={{ height: CHART_H, marginBottom: 8 }} />
            ) : dayGlucose.length > 0 ? (
              <>
                <View {...panResponder.panHandlers} style={{ marginBottom: 6 }}>
                  <Svg width={CHART_W} height={CHART_H} accessibilityLabel="Glucose chart">
                    <Rect x={PAD_L} y={highBandY} width={CHART_W - PAD_L} height={lowBandY - highBandY} fill={mode === "dark" ? theme.berry.sub : theme.berry.tint} opacity={mode === "dark" ? 0.25 : 0.4} stroke={ink} strokeWidth={1} strokeDasharray="5,5" />
                    <SvgText x={PAD_L - 3} y={highBandY + 4} fontSize={8} fill={theme.textSoft} textAnchor="end">180</SvgText>
                    <SvgText x={PAD_L - 3} y={lowBandY + 4} fontSize={8} fill={theme.textSoft} textAnchor="end">70</SvgText>
                    {yesterdayPoints ? (
                      <Polyline points={yesterdayPoints} fill="none" stroke={theme.berry.bar} strokeWidth={1.5} strokeDasharray="5,4" opacity={0.4} />
                    ) : null}
                    {glucosePoints ? (
                      <>
                        <Polyline points={glucosePoints} fill="none" stroke={ink} strokeWidth={3.5} />
                        <Polyline points={glucosePoints} fill="none" stroke={theme.berry.bar} strokeWidth={2} />
                      </>
                    ) : null}
                    {lastGlucoseVal !== null && lastGlucoseReading ? (() => {
                      const lx = eventX(new Date(lastGlucoseReading.recorded_at).getTime(), windowStart, windowEnd);
                      const ly = glucoseY(lastGlucoseVal, minVal, maxVal);
                      const isHigh = lastGlucoseVal > 180;
                      const isLow = lastGlucoseVal < 70;
                      const dotFill = isHigh || isLow ? theme.red.solid : theme.berry.bar;
                      const labelX = lx + 6 + 26 > CHART_W ? lx - 32 : lx + 6;
                      return (
                        <>
                          <Circle cx={lx} cy={ly} r={5} fill={dotFill} stroke={ink} strokeWidth={1.5} />
                          <Rect x={labelX} y={ly - 9} width={30} height={14} rx={4} fill={dotFill} opacity={0.92} />
                          <SvgText x={labelX + 15} y={ly + 2} fontSize={9} fontWeight="bold" fill="#fff" textAnchor="middle">{lastGlucoseVal}</SvgText>
                        </>
                      );
                    })() : null}
                    {dayEvents.map(function (ev, i) {
                      const t = new Date(ev.time).getTime();
                      if (t < windowStart || t > windowEnd) return null;
                      const x = eventX(t, windowStart, windowEnd);
                      const gVal = interpolateGlucose(dayGlucose, t);
                      const y = gVal !== null ? glucoseY(gVal, minVal, maxVal) : PAD_T + usableH;
                      const markerText = ev.type === "spend" ? "$" : ev.type === "mood" && ev.mood_score ? moodScoreEmoji(ev.mood_score) : ev.type === "mood" ? "·" : "M";
                      const markerBg = ev.type === "meal" ? theme.coral.tint : ev.type === "spend" ? theme.purple.tint : theme.violet.tint;
                      return (
                        <React.Fragment key={i}>
                          <Circle cx={x} cy={y} r={9} fill={markerBg} stroke={ink} strokeWidth={2} />
                          <SvgText x={x} y={y + 4} fontSize={8} fill={ink} textAnchor="middle" fontWeight="bold">{markerText}</SvgText>
                        </React.Fragment>
                      );
                    })}
                    {scrub && (() => {
                      const cy = glucoseY(scrub.mgDl, minVal, maxVal);
                      const hasYest = scrub.yestMgDl !== null;
                      const delta = hasYest ? scrub.mgDl - scrub.yestMgDl! : null;
                      const tipW = hasYest ? 90 : 68;
                      const tipH = hasYest ? 50 : 30;
                      const tipX = scrub.x + 10 + tipW > CHART_W ? scrub.x - tipW - 10 : scrub.x + 10;
                      const tipY = PAD_T;
                      const timeStr = new Date(scrub.time).getHours().toString().padStart(2, "0") + ":" + new Date(scrub.time).getMinutes().toString().padStart(2, "0");
                      const deltaStr = delta !== null ? (delta >= 0 ? "+" : "") + delta + " vs 24h ago" : "";
                      const deltaColor = delta === null ? ink : delta > 10 ? "#CE7A92" : delta < -10 ? "#8ED4D8" : theme.textSoft;
                      return (
                        <>
                          <SvgLine x1={scrub.x} y1={PAD_T} x2={scrub.x} y2={CHART_H - PAD_B} stroke={ink} strokeWidth={1.5} strokeDasharray="4,3" opacity={0.6} />
                          <Circle cx={scrub.x} cy={cy} r={5} fill={theme.berry.solid} stroke={ink} strokeWidth={2} />
                          {hasYest && (
                            <Circle cx={scrub.x} cy={glucoseY(scrub.yestMgDl!, minVal, maxVal)} r={4} fill={theme.berry.bar} stroke={ink} strokeWidth={1.5} opacity={0.55} />
                          )}
                          <Rect x={tipX} y={tipY} width={tipW} height={tipH} rx={6} fill={theme.card} stroke={ink} strokeWidth={1.5} />
                          <SvgText x={tipX + tipW / 2} y={tipY + 13} fontSize={12} fontWeight="800" fill={theme.berry.solid} textAnchor="middle">{scrub.mgDl} mg/dL</SvgText>
                          <SvgText x={tipX + tipW / 2} y={tipY + 26} fontSize={9} fill={theme.textSoft} textAnchor="middle">{timeStr}</SvgText>
                          {hasYest && (
                            <>
                              <SvgText x={tipX + tipW / 2} y={tipY + 38} fontSize={9} fill={theme.textSoft} textAnchor="middle">24h ago: {scrub.yestMgDl}</SvgText>
                              {delta !== null && <SvgText x={tipX + tipW / 2} y={tipY + 49} fontSize={8} fontWeight="700" fill={deltaColor} textAnchor="middle">{deltaStr}</SvgText>}
                            </>
                          )}
                        </>
                      );
                    })()}
                  </Svg>
                </View>
                <View style={[styles.legendRow, { marginBottom: 12 }]}>
                  {[
                    { color: theme.berry.bar, label: "Today", dash: false },
                    ...(yesterdayGlucose.length > 0 ? [{ color: theme.berry.bar, label: "24h ago", dash: true }] : []),
                    { color: theme.coral.tint, label: "Meal", dash: false },
                    { color: theme.violet.tint, label: "Mood", dash: false },
                    { color: theme.purple.tint, label: "Spend", dash: false },
                  ].map(l => (
                    <View key={l.label} style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: l.color, borderWidth: 1.5, borderColor: ink, opacity: l.dash ? 0.45 : 1 }]} />
                      <Text style={{ color: theme.textSoft, fontSize: 10 }}>{l.label}</Text>
                    </View>
                  ))}
                </View>
              </>
            ) : (
              <View style={[styles.emptyState, { borderColor: ink }]}>
                <Ionicons name="pulse-outline" size={24} color={theme.textSoft} />
                <Text style={[styles.emptyText, { color: theme.textSoft }]}>No glucose readings yet — connect Dexcom in Settings to see your chart here</Text>
              </View>
            )}
            {loading ? (
              <View style={{ gap: 12 }}>
                <SkeletonBox style={{ height: 18, width: "70%" }} />
                <SkeletonBox style={{ height: 18, width: "55%" }} />
                <SkeletonBox style={{ height: 18, width: "80%" }} />
              </View>
            ) : patternEvents.length === 0 ? (
              <View style={[styles.emptyState, { borderColor: ink }]}>
                <Ionicons name="calendar-outline" size={24} color={theme.textSoft} />
                <Text style={[styles.emptyText, { color: theme.textSoft }]}>Log a meal, mood, or spend to start your day's timeline</Text>
              </View>
            ) : (
              <>
                {/* ── Timeline scrubber ── */}
                {patternEvents.length > 0 && (() => {
                  const { dayStart, dayEnd } = timelineWindowBounds();
                  const thumbRatio = Math.max(0, Math.min(1, timelineScrubberX.current / (CHART_W - PAD_L)));
                  const thumbX = thumbRatio * (CHART_W - PAD_L);
                  const eventPositions = patternEvents.map(ev => {
                    const t = new Date(ev.time).getTime();
                    return Math.max(0, Math.min(CHART_W - PAD_L, ((t - dayStart) / (dayEnd - dayStart)) * (CHART_W - PAD_L)));
                  });
                  return (
                    <View style={{ marginBottom: 10, marginTop: 4 }} {...timelinePanResponder.panHandlers}>
                      {timelineScrubberTime && (
                        <View style={{
                          position: "absolute",
                          top: 0,
                          left: Math.max(0, thumbX - 18),
                          zIndex: 10,
                          backgroundColor: theme.card,
                          borderRadius: 8,
                          borderWidth: 1.5,
                          borderColor: ink,
                          paddingHorizontal: 5,
                          paddingVertical: 2,
                        }}>
                          <Text style={{ fontSize: 9, fontWeight: "800", color: theme.textStrong }}>{timelineScrubberTime}</Text>
                        </View>
                      )}
                      <View style={{ height: 28, marginTop: 16, position: "relative" }}>
                        <View style={{ position: "absolute", left: 0, right: 0, top: 12, height: 2, backgroundColor: theme.cardBorder, borderRadius: 1 }} />
                        {eventPositions.map((xPos, ei) => (
                          <View key={ei} style={{
                            position: "absolute",
                            left: xPos - 3,
                            top: 9,
                            width: 6,
                            height: 6,
                            borderRadius: 3,
                            backgroundColor: eventDotColor(patternEvents[ei].type),
                            borderWidth: 1,
                            borderColor: ink,
                          }} />
                        ))}
                        <View style={{
                          position: "absolute",
                          left: thumbX - 1,
                          top: 0,
                          width: 2,
                          height: 28,
                          backgroundColor: ink,
                          borderRadius: 1,
                          opacity: 0.7,
                        }} />
                        <View style={{
                          position: "absolute",
                          left: thumbX - 7,
                          top: 6,
                          width: 14,
                          height: 14,
                          borderRadius: 7,
                          backgroundColor: theme.teal.solid,
                          borderWidth: 2,
                          borderColor: ink,
                        }} />
                      </View>
                    </View>
                  );
                })()}
                {visibleEvents.map(function (ev, i) {
                  const dotColor = eventDotColor(ev.type);
                  const icon = eventIcon(ev.type);
                  const isLast = i === visibleEvents.length - 1;
                  return (
                    <View key={i} style={{ flexDirection: "row", minHeight: 36 }}>
                      <Text style={[styles.tlTime, { color: theme.textSoft }]}>{fmtTime(ev.time)}</Text>
                      <View style={{ width: 20, alignItems: "center", marginRight: 10 }}>
                        <View style={[styles.tlIconDot, { backgroundColor: dotColor }]}>
                          <Ionicons name={icon as any} size={9} color={onSolid(dotColor)} />
                        </View>
                        {!isLast && <View style={[styles.tlLine, { backgroundColor: theme.cardBorder }]} />}
                      </View>
                      <Text
                        style={{ flex: 1, color: theme.textStrong, fontSize: 13, fontWeight: "500", lineHeight: 18, paddingBottom: isLast ? 0 : 10 }}
                        numberOfLines={2}
                      >
                        {ev.label}
                        {ev.type === "mood" && ev.entry_type === "period" && ev.period
                          ? " · " + BUCKET_LABEL[ev.period as Bucket]
                          : ""}
                      </Text>
                    </View>
                  );
                })}
                {patternEvents.length > 8 ? (
                  <Pressable onPress={() => setShowAllEvents(!showAllEvents)} style={{ paddingTop: 6 }}>
                    <Text style={{ color: theme.teal.fg, fontSize: 12, fontWeight: "700" }}>
                      {showAllEvents ? "Show less" : "Show all " + patternEvents.length + " events"}
                    </Text>
                  </Pressable>
                ) : null}
              </>
            )}
          </ShadowCard>
          </View>
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
          <ShadowCard size="card" accent={theme.violet.solid}>
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
                  <Text style={{ color: theme.teal.fg, fontSize: 13 }}>
                    {digest.steps.this_week.toLocaleString()} steps
                    {digest.steps.last_week > 0 ? (digest.steps.this_week >= digest.steps.last_week ? " · up from last week" : " · fewer than last week") : ""}
                  </Text>
                ) : null}
                {digest.hobbies.this_week_sessions > 0 ? (
                  <Text style={{ color: theme.teal.fg, fontSize: 13, marginTop: 3 }}>
                    {digest.hobbies.this_week_sessions} hobby session{digest.hobbies.this_week_sessions === 1 ? "" : "s"}
                  </Text>
                ) : null}
              </ShadowCard>
            ) : null}
            <ShadowCard size="card" accent={theme.teal.solid}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
                <Text style={[styles.cardTitle, { color: theme.textStrong }]}>7-day review</Text>
                {digest && (
                  <Pressable onPress={() => setShowDigest(true)} hitSlop={8}>
                    <Text style={{ color: theme.teal.fg, fontSize: 12, fontWeight: "700" }}>View summary →</Text>
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
                      <Text style={{ color: theme.textStrong, fontSize: 13, marginBottom: 4, fontWeight: "600" }}>
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
                <View style={[styles.emptyState, { borderColor: ink, marginTop: 8 }]}>
                  <Text style={[styles.emptyText, { color: theme.textSoft }]}>Keep logging meals, steps, and mood — your weekly recap appears here after a few days</Text>
                </View>
              )}
            </ShadowCard>
          </>
        );

      case "mood_pattern": {
        // Mood sparkline — build polyline points from weeklyData avg_mood values
        const sparkPoints = weeklyData
          .map((d, i) => d.avg_mood !== null ? d.avg_mood : null)
          .filter((v): v is number => v !== null);
        const sparkW = 80;
        const sparkH = 24;
        const sparkPad = 2;
        const sparkPolyline = sparkPoints.length >= 2
          ? weeklyData
              .map((d, i) => {
                if (d.avg_mood === null) return null;
                const x = sparkPad + (i / (weeklyData.length - 1)) * (sparkW - sparkPad * 2);
                // mood 1–5, invert so 5 is top
                const y = sparkPad + ((5 - d.avg_mood) / 4) * (sparkH - sparkPad * 2);
                return x.toFixed(1) + "," + y.toFixed(1);
              })
              .filter(Boolean)
              .join(" ")
          : null;

        return weeklyData.length > 0 ? (
          <ShadowCard size="card">
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
              <Text style={[styles.cardTitle, { color: theme.textStrong }]}>7-day mood pattern</Text>
              {sparkPolyline ? (
                <Svg width={sparkW} height={sparkH}>
                  <Polyline
                    points={sparkPolyline}
                    fill="none"
                    stroke={theme.violet.solid}
                    strokeWidth={1.5}
                  />
                </Svg>
              ) : null}
            </View>
            <Text style={{ color: theme.textSoft, fontSize: 11, marginBottom: 8 }}>
              Same days side by side — draw your own conclusions.
            </Text>
            <View style={styles.legendRow}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: theme.violet.solid }]} />
                <Text style={{ color: theme.textSoft, fontSize: 11 }}>Mood (1–5)</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: correlation === "sleep" ? theme.amber.solid : theme.purple.solid }]} />
                <Text style={{ color: theme.textSoft, fontSize: 11 }}>{correlation === "sleep" ? "Sleep (hrs)" : "Spending ($)"}</Text>
              </View>
              <View style={{ flex: 1 }} />
              <Pressable
                onPress={() => setCorrelation(correlation === "sleep" ? "spend" : "sleep")}
                style={[styles.toggleChip, { backgroundColor: card }]}
                accessibilityRole="button"
                accessibilityLabel={"Switch to compare with " + (correlation === "sleep" ? "spending" : "sleep")}
              >
                <Text style={{ color: ink, fontSize: 10, fontWeight: "800", letterSpacing: 0.4 }}>
                  VS {correlation === "sleep" ? "SPENDING" : "SLEEP"}
                </Text>
              </Pressable>
            </View>
            <Svg width={CORR_W} height={CORR_H + 20} style={{ marginTop: 8 }}>
              {weeklyData.map(function (d, i) {
                const mH = moodBarH(d.avg_mood);
                const cH = compBarH(d);
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
        ) : null;
      }

      case "cross_metric": {
        if (!crossMetricData) return null;
        const { exercise: ex, sleep: sl } = crossMetricData;
        const hasExercise = ex.with_count >= 3 && ex.without_count >= 3 && ex.with_avg !== null && ex.without_avg !== null;
        const hasSleep    = sl.good_count >= 3 && sl.poor_count >= 3 && sl.good_avg !== null && sl.poor_avg !== null;
        if (!hasExercise && !hasSleep) return null;
        return (
          <ShadowCard size="card" accent={theme.teal.solid} rotate={-0.3}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <Ionicons name="git-compare-outline" size={18} color={theme.teal.solid} />
              <Text style={[styles.cardTitle, { color: theme.textStrong, marginBottom: 0 }]}>Cross-metric insights</Text>
            </View>
            {hasExercise && (function () {
              const diff = Math.abs(ex.with_avg! - ex.without_avg!);
              const lower = Math.min(ex.with_avg!, ex.without_avg!);
              const withIsLower = ex.with_avg! < ex.without_avg!;
              return (
                <View style={{ marginBottom: hasSleep ? 16 : 0 }}>
                  <Text style={{ color: theme.textSoft, fontSize: 10, fontWeight: "800", letterSpacing: 0.5, marginBottom: 6 }}>EXERCISE DAYS VS REST DAYS</Text>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <View style={{ flex: 1, backgroundColor: theme.teal.tint, borderRadius: 10, padding: 10, alignItems: "center", borderWidth: 1, borderColor: theme.cardBorder }}>
                      <Text style={{ color: theme.teal.fg, fontSize: 20, fontWeight: "900" }}>{ex.with_avg}</Text>
                      <Text style={{ color: theme.teal.sub, fontSize: 10, fontWeight: "700", marginTop: 2 }}>mg/dL avg</Text>
                      <Text style={{ color: theme.teal.sub, fontSize: 10 }}>exercise days</Text>
                    </View>
                    <View style={{ flex: 1, backgroundColor: theme.card, borderRadius: 10, padding: 10, alignItems: "center", borderWidth: 1, borderColor: theme.cardBorder }}>
                      <Text style={{ color: theme.textStrong, fontSize: 20, fontWeight: "900" }}>{ex.without_avg}</Text>
                      <Text style={{ color: theme.textSoft, fontSize: 10, fontWeight: "700", marginTop: 2 }}>mg/dL avg</Text>
                      <Text style={{ color: theme.textSoft, fontSize: 10 }}>rest days</Text>
                    </View>
                  </View>
                  {diff >= 3 && (
                    <Text style={{ color: theme.textSoft, fontSize: 11, marginTop: 8, lineHeight: 16 }}>
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
                  <Text style={{ color: theme.textSoft, fontSize: 10, fontWeight: "800", letterSpacing: 0.5, marginBottom: 6 }}>7+ HOURS SLEEP VS LESS</Text>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <View style={{ flex: 1, backgroundColor: theme.amber.tint, borderRadius: 10, padding: 10, alignItems: "center", borderWidth: 1, borderColor: theme.cardBorder }}>
                      <Text style={{ color: theme.amber.fg, fontSize: 20, fontWeight: "900" }}>{sl.good_avg}</Text>
                      <Text style={{ color: theme.amber.sub, fontSize: 10, fontWeight: "700", marginTop: 2 }}>mg/dL avg</Text>
                      <Text style={{ color: theme.amber.sub, fontSize: 10 }}>7+ h nights</Text>
                    </View>
                    <View style={{ flex: 1, backgroundColor: theme.card, borderRadius: 10, padding: 10, alignItems: "center", borderWidth: 1, borderColor: theme.cardBorder }}>
                      <Text style={{ color: theme.textStrong, fontSize: 20, fontWeight: "900" }}>{sl.poor_avg}</Text>
                      <Text style={{ color: theme.textSoft, fontSize: 10, fontWeight: "700", marginTop: 2 }}>mg/dL avg</Text>
                      <Text style={{ color: theme.textSoft, fontSize: 10 }}>{"<"}7 h nights</Text>
                    </View>
                  </View>
                  {diff >= 3 && (
                    <Text style={{ color: theme.textSoft, fontSize: 11, marginTop: 8, lineHeight: 16 }}>
                      Glucose averaged {diff} mg/dL {goodIsLower ? "lower" : "higher"} after 7+ hour nights ({sl.good_count} nights). Observation only — not a finding.
                    </Text>
                  )}
                </View>
              );
            })()}
          </ShadowCard>
        );
      }

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
                return (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <ThemedIcon slot={g.emojiSlot} size={24} />
                    <Text style={[styles.greeting, { color: theme.textStrong }]} accessibilityRole="header">
                      {g.text}{userName ? `, ${userName}` : ""}
                    </Text>
                  </View>
                );
              })()}
            </Animated.View>
            <Text style={[styles.dateText, { color: theme.textSoft }]}>{dateStr}</Text>
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
                      style={[styles.streakPill, { backgroundColor: isFreeze ? "#9DD9E8" : s.color(theme) }]}
                      accessibilityRole="button"
                      accessibilityLabel={`${s.count} day ${s.label} streak`}
                    >
                      <Text style={{ fontSize: 11, marginRight: 4 }}>{s.icon}</Text>
                      {counterAnim ? (
                        <AnimatedCounterText
                          animValue={counterAnim}
                          targetValue={s.count}
                          style={[styles.streakPillText, { color: isFreeze ? "#1A6E8A" : onSolid(s.color(theme)) }]}
                          format={(v) => v + "d " + s.label.toUpperCase()}
                        />
                      ) : (
                        <Text style={[styles.streakPillText, { color: isFreeze ? "#1A6E8A" : onSolid(s.color(theme)) }]}>
                          {s.count}d {s.label.toUpperCase()}
                        </Text>
                      )}
                      {isFreeze && (
                        <Text style={{ fontSize: 10, position: "absolute", top: -4, right: -4 }}>❄️</Text>
                      )}
                    </Pressable>
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
          </>
        )}

        {/* ── Pinned Insights ── */}
        {pinnedIds.size > 0 && allInsights.some(i => pinnedIds.has(i.id)) && (
          <View style={{ gap: 6, marginTop: 8 }}>
            <Text style={{ fontSize: 10, fontWeight: "800", letterSpacing: 0.8, color: theme.textSoft }}>📌 PINNED INSIGHTS</Text>
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
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(ink: string, card: string, border: string) {
  return StyleSheet.create({
    content: { padding: 16, gap: 12 },

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

    metricChip: {
      borderRadius: 22,
      borderWidth: 2,
      padding: 10,
      backgroundColor: card,
      ...coloredShadow("#3FA0A6", 0.8),
    },
    chipIcon: {
      width: 22,
      height: 22,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 6,
    },
    chipValue: { fontSize: 20, fontWeight: "900", lineHeight: 22, marginBottom: 1 },
    chipSub: { fontSize: 10, lineHeight: 13, fontWeight: "600" },
    chipLabel: { fontSize: 9, fontWeight: "900", letterSpacing: 0.6, marginTop: 4, textTransform: "uppercase" },

    card: {
      borderRadius: 22,
      borderWidth: 2,
      borderColor: border,
      padding: 14,
      ...coloredShadow("#3FA0A6"),
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

    // Timeline
    tlTime: { fontSize: 11, width: 42, paddingTop: 3 },
    tlIconDot: {
      width: 18,
      height: 18,
      borderRadius: 9,
      borderWidth: 1.5,
      borderColor: ink,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 2,
    },
    tlLine: { flex: 1, width: 2, marginTop: 2 },

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

    // Empty state
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

    // 7-day blocks
    summaryBlocksRow: { flexDirection: "row", gap: 6, marginTop: 10, marginBottom: 4 },
    summaryBlock: {
      flex: 1,
      borderRadius: 16,
      borderWidth: 2,
      borderColor: ink,
      padding: 8,
      shadowColor: "rgba(60,40,20,0.1)",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.08,
      shadowRadius: 10,
      elevation: 2,
    },
    summaryBlockLabel: { fontSize: 8, fontWeight: "800", letterSpacing: 0.5, marginBottom: 4 },
    summaryBlockValue: { fontSize: 13, fontWeight: "800" },
    digestLabel: { fontSize: 10, fontWeight: "800", marginTop: 10, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.7 },
    calloutStrip: { borderWidth: 2, borderRadius: 16, padding: 10, marginTop: 10, gap: 4 },

    legendRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
    legendDot: { width: 8, height: 8, borderRadius: 4 },
    toggleChip: {
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
  });
}
