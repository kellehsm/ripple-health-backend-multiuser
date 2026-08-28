import React, { useRef, useState } from "react";
import { Animated, PanResponder, View, Text, Pressable, StyleSheet, Easing, Modal, ScrollView, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useNavigation } from "@react-navigation/native";
import { useTheme } from "../theme/ThemeContext";
import { onSolid } from "../theme/colorUtils";
import { ShadowCard } from "./ShadowCard";
import { adaptiveInsight, softenInsight } from "../lib/softenInsight";
import { api } from "../api/client";
import { Alert } from "react-native";
import { isReducedMotion } from "../lib/motion";
import { FONT_SIZES } from "../theme/tokens";

const RULES_WITH_TEMPLATES = new Set([
  "sleep_vs_mood", "sleep_vs_glucose", "meal_size_vs_sleep",
  "screen_time_vs_sleep", "alcohol_quantity_vs_glucose",
  "activity_vs_glucose", "weather_vs_exercise", "muscle_group_rotation",
  "mindfulness_vs_mood", "time_of_day_spend", "stress_vs_spending",
]);

type FeedbackRating = "helpful" | "neutral" | "not_useful" | "already_knew";

export type Confidence = "low" | "moderate" | "high" | "very_high";

export interface Insight {
  id: string;
  rule_id: string;
  type: string;
  title: string;
  description: string;
  confidence: Confidence;
  confidence_score: number;
  supporting_data: Record<string, unknown>;
  times_observed: number;
  first_detected: string;
  last_confirmed: string;
  dismissed: boolean;
  prior_period_value?: number;
}

const TYPE_ICON: Record<string, string> = {
  sleep: "moon-outline",
  glucose: "pulse",
  activity: "walk",
  water: "water-outline",
  mood: "happy-outline",
  books: "book-outline",
  hobbies: "bicycle-outline",
  spending: "wallet-outline",
  streak: "flame",
  mindfulness: "leaf-outline",
  category_summary: "layers-outline",
  exercise: "barbell-outline",
  medication: "medical-outline",
  cycle: "sync-circle-outline",
  trend: "trending-up-outline",
  anomaly: "alert-circle-outline",
  finance: "wallet-outline",
  combined: "layers-outline",
};

const CONFIDENCE_LABEL: Record<Confidence, string> = {
  low: "Emerging",
  moderate: "Moderate",
  high: "Strong",
  very_high: "Very Strong",
};

function getConfidenceColor(confidence: Confidence, theme: any): string {
  switch (confidence) {
    case "low":       return theme.textSoft;
    case "moderate":  return theme.amber.solid;
    case "high":      return theme.teal.solid;
    case "very_high": return theme.success;
  }
}

interface KeyMeta { label: string; unit?: string }

const DATA_KEY_META: Record<string, KeyMeta> = {
  days_analyzed:                   { label: "Days Analyzed" },
  high_sleep_days:                 { label: "Good Sleep Days" },
  low_sleep_days:                  { label: "Poor Sleep Days" },
  poor_sleep_days:                 { label: "Poor Sleep Days" },
  good_sleep_days:                 { label: "Good Sleep Days" },
  avg_mood_high_sleep:             { label: "Mood (Good Sleep)", unit: "/10" },
  avg_mood_low_sleep:              { label: "Mood (Poor Sleep)", unit: "/10" },
  avg_glucose_poor_sleep:          { label: "Glucose (Poor Sleep)", unit: " mg/dL" },
  avg_glucose_good_sleep:          { label: "Glucose (Good Sleep)", unit: " mg/dL" },
  avg_spend_poor_sleep:            { label: "Spend (Poor Sleep)", unit: " $" },
  avg_spend_good_sleep:            { label: "Spend (Good Sleep)", unit: " $" },
  avg_steps_poor_sleep:            { label: "Steps (Poor Sleep)" },
  avg_steps_good_sleep:            { label: "Steps (Good Sleep)" },
  step_difference:                 { label: "Step Difference" },
  spend_difference:                { label: "Spend Difference", unit: " $" },
  avg_quality:                     { label: "Avg Sleep Quality", unit: "/10" },
  bedtime_stddev_hours:            { label: "Bedtime Variation", unit: " hrs" },
  session_count:                   { label: "Sessions" },
  mood_difference:                 { label: "Mood Difference", unit: " pts" },
  avg_mood:                        { label: "Avg Mood", unit: "/10" },
  stddev:                          { label: "Std Dev", unit: " pts" },
  avg_mood_reading:                { label: "Mood (Reading)", unit: "/10" },
  avg_mood_no_reading:             { label: "Mood (No Reading)", unit: "/10" },
  avg_mood_hobby:                  { label: "Mood (Hobby)", unit: "/10" },
  avg_mood_no_hobby:               { label: "Mood (No Hobby)", unit: "/10" },
  avg_mood_high_spend:             { label: "Mood (High Spend)", unit: "/10" },
  avg_mood_low_spend:              { label: "Mood (Low Spend)", unit: "/10" },
  avg_mood_exercise:               { label: "Mood (Exercise)", unit: "/10" },
  avg_mood_no_exercise:            { label: "Mood (No Exercise)", unit: "/10" },
  avg_mood_high_steps:             { label: "Mood (High Steps)", unit: "/10" },
  avg_mood_low_steps:              { label: "Mood (Low Steps)", unit: "/10" },
  avg_mood_high_hydration:         { label: "Mood (High Hydration)", unit: "/10" },
  avg_mood_low_hydration:          { label: "Mood (Low Hydration)", unit: "/10" },
  avg_mood_after_alcohol:          { label: "Mood (After Alcohol)", unit: "/10" },
  avg_mood_after_no_alcohol:       { label: "Mood (No Alcohol)", unit: "/10" },
  avg_mood_menstrual:              { label: "Mood (Menstrual)", unit: "/10" },
  avg_mood_non_menstrual:          { label: "Mood (Other)", unit: "/10" },
  avg_mood_adherent:               { label: "Mood (Adherent)", unit: "/10" },
  avg_mood_non_adherent:           { label: "Mood (Non-Adherent)", unit: "/10" },
  avg_mood_low_meals:              { label: "Mood (Low Meals)", unit: "/10" },
  avg_mood_normal_meals:           { label: "Mood (Normal Meals)", unit: "/10" },
  avg_glucose_active:              { label: "Glucose (Active)", unit: " mg/dL" },
  avg_glucose_sedentary:           { label: "Glucose (Sedentary)", unit: " mg/dL" },
  avg_glucose_high_caffeine:       { label: "Glucose (High Caffeine)", unit: " mg/dL" },
  avg_glucose_low_caffeine:        { label: "Glucose (Low Caffeine)", unit: " mg/dL" },
  avg_glucose_menstrual:           { label: "Glucose (Menstrual)", unit: " mg/dL" },
  avg_glucose_non_menstrual:       { label: "Glucose (Other)", unit: " mg/dL" },
  avg_glucose_adherent:            { label: "Glucose (Adherent)", unit: " mg/dL" },
  avg_glucose_missed:              { label: "Glucose (Missed)", unit: " mg/dL" },
  avg_glucose_high_days:           { label: "Avg Glucose (High)", unit: " mg/dL" },
  avg_glucose_low_days:            { label: "Avg Glucose (Low)", unit: " mg/dL" },
  difference_mg_dl:                { label: "Difference", unit: " mg/dL" },
  mean_glucose:                    { label: "Mean Glucose", unit: " mg/dL" },
  glucose_stddev:                  { label: "Std Dev", unit: " mg/dL" },
  glucose_cv_pct:                  { label: "Day-to-Day Variation", unit: "%" },
  highest_avg:                     { label: "Best Time Glucose", unit: " mg/dL" },
  lowest_avg:                      { label: "Worst Time Glucose", unit: " mg/dL" },
  spread_mg_dl:                    { label: "Spread", unit: " mg/dL" },
  highest_bucket:                  { label: "Best Time of Day" },
  lowest_bucket:                   { label: "Worst Time of Day" },
  highest_type:                    { label: "Highest Glucose Meal" },
  lowest_type:                     { label: "Lowest Glucose Meal" },
  highest_avg_mg_dl:               { label: "Glucose (Highest)", unit: " mg/dL" },
  lowest_avg_mg_dl:                { label: "Glucose (Lowest)", unit: " mg/dL" },
  active_days:                     { label: "Active Days" },
  sedentary_days:                  { label: "Sedentary Days" },
  exercise_days:                   { label: "Exercise Days" },
  no_exercise_days:                { label: "No-Exercise Days" },
  high_step_days:                  { label: "High Step Days" },
  low_step_days:                   { label: "Low Step Days" },
  avg_steps_high_group:            { label: "Avg Steps (High)" },
  avg_steps_low_group:             { label: "Avg Steps (Low)" },
  avg_resting_hr_exercise:         { label: "Heart Rate (Exercise)", unit: " bpm" },
  avg_resting_hr_no_exercise:      { label: "Heart Rate (Rest)", unit: " bpm" },
  bpm_difference:                  { label: "HR Difference", unit: " bpm" },
  sessions_this_month:             { label: "Sessions This Month" },
  days_in_month_so_far:            { label: "Days This Month" },
  cycles_analyzed:                 { label: "Cycles Analyzed" },
  pre_period_rate:                 { label: "Pre-Period Rate", unit: "%" },
  other_rate:                      { label: "Other Days Rate", unit: "%" },
  difference_pct:                  { label: "Difference", unit: " pts" },
  muscle_group:                    { label: "Muscle Group" },
  days_since_last:                 { label: "Days Since Trained" },
  last_trained:                    { label: "Last Trained" },
  high_hydration_days:             { label: "High Hydration Days" },
  low_hydration_days:              { label: "Low Hydration Days" },
  avg_glasses_high_group:          { label: "Avg Glasses (High)" },
  avg_glasses_low_group:           { label: "Avg Glasses (Low)" },
  avg_glasses_weekend:             { label: "Glasses (Weekend)" },
  avg_glasses_weekday:             { label: "Glasses (Weekday)" },
  difference_glasses:              { label: "Difference", unit: " glasses" },
  avg_spend_hobby_days:            { label: "Spend (Hobby Days)", unit: " $" },
  avg_spend_no_hobby_days:         { label: "Spend (Other Days)", unit: " $" },
  avg_spend_exercise:              { label: "Spend (Exercise Days)", unit: " $" },
  avg_spend_no_exercise:           { label: "Spend (No Exercise)", unit: " $" },
  avg_spend_menstrual:             { label: "Spend (Menstrual)", unit: " $" },
  avg_spend_non_menstrual:         { label: "Spend (Other)", unit: " $" },
  avg_spend_high_glucose:          { label: "Spend (High Glucose)", unit: " $" },
  avg_spend_low_glucose:           { label: "Spend (Low Glucose)", unit: " $" },
  avg_high_spend_dollars:          { label: "Avg High Spend", unit: " $" },
  avg_low_spend_dollars:           { label: "Avg Low Spend", unit: " $" },
  avg_spend_weekend:               { label: "Spend (Weekend)", unit: " $" },
  avg_spend_weekday:               { label: "Spend (Weekday)", unit: " $" },
  difference_dollars:              { label: "Difference", unit: " $" },
  high_spend_days:                 { label: "High Spend Days" },
  low_spend_days:                  { label: "Low Spend Days" },
  hobby_days_with_spend:           { label: "Hobby Days" },
  no_hobby_days_with_spend:        { label: "Non-Hobby Days" },
  days_after_alcohol:              { label: "Days After Alcohol" },
  days_after_no_alcohol:           { label: "Days Without Alcohol" },
  alcohol_nights:                  { label: "Alcohol Nights" },
  no_alcohol_nights:               { label: "Sober Nights" },
  avg_sleep_quality_alcohol:       { label: "Sleep Quality (Alcohol)", unit: "/10" },
  avg_sleep_quality_no_alcohol:    { label: "Sleep Quality (No Alcohol)", unit: "/10" },
  avg_sleep_quality_high_caffeine: { label: "Sleep Quality (High Caffeine)", unit: "/10" },
  avg_sleep_quality_low_caffeine:  { label: "Sleep Quality (Low Caffeine)", unit: "/10" },
  quality_difference:              { label: "Quality Difference", unit: " pts" },
  high_caffeine_days:              { label: "High Caffeine Days" },
  low_caffeine_days:               { label: "Low Caffeine Days" },
  avg_caffeine_mg_high:            { label: "Avg Caffeine (High)", unit: " mg" },
  avg_caffeine_mg_low:             { label: "Avg Caffeine (Low)", unit: " mg" },
  reading_days:                    { label: "Reading Days" },
  non_reading_days:                { label: "Non-Reading Days" },
  avg_pages_on_reading_days:       { label: "Avg Pages Read" },
  hobby_days:                      { label: "Hobby Days" },
  non_hobby_days:                  { label: "Non-Hobby Days" },
  top_hobby:                       { label: "Top Hobby" },
  late_meal_days_with_sleep:       { label: "Late Meal Days" },
  early_meal_days_with_sleep:      { label: "Early Meal Days" },
  avg_sleep_quality_late_meals:    { label: "Sleep Quality (Late Meals)", unit: "/10" },
  avg_sleep_quality_early_meals:   { label: "Sleep Quality (Early Meals)", unit: "/10" },
  low_meal_days:                   { label: "Low Meal Days" },
  normal_meal_days:                { label: "Normal Meal Days" },
  taken:                           { label: "Doses Taken" },
  scheduled:                       { label: "Doses Scheduled" },
  adherence_pct:                   { label: "Adherence", unit: "%" },
  slots_per_day:                   { label: "Slots Per Day" },
  adherent_days:                   { label: "Adherent Days" },
  missed_days:                     { label: "Missed Days" },
  non_adherent_days:               { label: "Non-Adherent Days" },
  slot:                            { label: "Missed Slot" },
  window_days:                     { label: "Window (Days)" },
  menstrual_days:                  { label: "Menstrual Days" },
  non_menstrual_days:              { label: "Non-Menstrual Days" },
  difference:                      { label: "Difference" },
  streak_days:                     { label: "Streak", unit: " days" },
  weekend_days:                    { label: "Weekend Days" },
  weekday_days:                    { label: "Weekday Days" },
  mindfulness_days:                { label: "Mindfulness Days" },
  no_mindfulness_days:             { label: "No Mindfulness Days" },
  avg_mood_mindfulness:            { label: "Mood (Mindfulness)", unit: "/5" },
  avg_mood_no_mindfulness:         { label: "Mood (No Mindfulness)", unit: "/5" },
  avg_glucose_mindfulness:         { label: "Glucose (Mindfulness)", unit: " mg/dL" },
  avg_glucose_no_mindfulness:      { label: "Glucose (No Mindfulness)", unit: " mg/dL" },
  avg_resting_hr_mindfulness:      { label: "Heart Rate (Mindfulness)", unit: " bpm" },
  avg_resting_hr_no_mindfulness:   { label: "Heart Rate (No Mindfulness)", unit: " bpm" },
  avg_spend_mindfulness:           { label: "Spend (Mindfulness)", unit: " $" },
  avg_spend_no_mindfulness:        { label: "Spend (No Mindfulness)", unit: " $" },
};

const SKIP_KEYS = new Set([
  "direction", "lower_on", "higher_on", "streak_type",
  "buckets", "spend_direction", "recommendation", "meal_types",
]);

const TYPE_TIP: Record<string, string> = {
  sleep:      "Consistent sleep and wake times tend to reinforce quality patterns.",
  glucose:    "Discuss any notable glucose patterns with your healthcare provider.",
  activity:   "Even a short walk can have a measurable effect on daily patterns.",
  water:      "Keeping a water bottle visible is a simple reminder to stay hydrated.",
  mood:       "Noticing mood patterns is the first step toward understanding them.",
  books:      "Reading before bed may also support sleep quality.",
  hobbies:    "Scheduling hobby time intentionally can help sustain the pattern.",
  spending:   "Small changes in routine often shift spending patterns over time.",
  streak:     "Consistency is its own reward — keep the streak alive.",
  medication:   "Never adjust your medication schedule without consulting your doctor.",
  cycle:        "Cycle-based patterns can vary month to month — keep tracking.",
  exercise:     "Rest days are part of any effective training routine.",
  mindfulness:      "Even a short session counts — consistency over duration.",
  category_summary: "These patterns are drawn from multiple observations — keep logging to refine them.",
};

function formatInsightValue(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

function formatSupportingData(data: Record<string, unknown>): Array<{ label: string; value: string }> {
  return Object.entries(data)
    .filter(([k, v]) => {
      if (SKIP_KEYS.has(k)) return false;
      const meta = DATA_KEY_META[k];
      if (!meta) return false;
      return typeof v === "number" || (typeof v === "string" && (v as string).length <= 40);
    })
    .map(([k, v]) => {
      const meta = DATA_KEY_META[k];
      const raw = typeof v === "number"
        ? (Number.isInteger(v) ? String(v) : (v as number).toFixed(1))
        : String(v);
      return { label: meta.label, value: raw + (meta.unit ?? "") };
    })
    .slice(0, 6);
}

interface InsightCardProps {
  insight: Insight;
  onDismiss?: (id: string) => void;
  onSnooze?: (id: string, days: number) => void;
  onPin?: (id: string, pinned: boolean) => void;
  isPinned?: boolean;
  compact?: boolean;
  onPressIn?: () => void;
  onPressOut?: () => void;
}

export const InsightCard = React.memo(function InsightCard({ insight, onDismiss, onSnooze, onPin, isPinned = false, compact = false, onPressIn, onPressOut }: InsightCardProps) {
  const { theme } = useTheme();
  const navigation = useNavigation<any>();
  const [expanded, setExpanded] = useState(false);

  const icon = TYPE_ICON[insight.type] ?? "bulb-outline";
  const confColor = getConfidenceColor(insight.confidence, theme);
  const confLabel = CONFIDENCE_LABEL[insight.confidence];
  const ink = theme.ink;

  const supportRows = expanded ? formatSupportingData(insight.supporting_data) : [];
  const age = Math.floor((Date.now() - new Date(insight.last_confirmed).getTime()) / 86400000);
  const ageLabel = age === 0 ? "today" : age === 1 ? "yesterday" : `${age} days ago`;
  const isNew = (Date.now() - new Date(insight.first_detected).getTime()) < 7 * 86400000;
  const tip = TYPE_TIP[insight.type];

  const lastTapRef = useRef<number>(0);
  const burstScale = useRef(new Animated.Value(0)).current;
  const burstOpacity = useRef(new Animated.Value(0)).current;
  const [burstPos, setBurstPos] = useState<{ x: number; y: number } | null>(null);

  function fireBurst(x: number, y: number) {
    if (isReducedMotion()) return;
    setBurstPos({ x, y });
    burstScale.setValue(0);
    burstOpacity.setValue(1);
    Animated.parallel([
      Animated.timing(burstScale, {
        toValue: 1,
        duration: 450,
        easing: Easing.out(Easing.back(1.5)),
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(200),
        Animated.timing(burstOpacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => setBurstPos(null));
  }

  const [explainVisible, setExplainVisible] = useState(false);
  const [explainLoading, setExplainLoading] = useState(false);
  const [explainText, setExplainText] = useState<string | null>(null);

  async function handleExplain() {
    setExplainVisible(true);
    if (explainText) return;
    setExplainLoading(true);
    try {
      const res = await api.insightExplain(insight.id);
      setExplainText(res?.system_guidance ?? "No explanation available.");
    } catch {
      setExplainText("Couldn't load an explanation right now — try again shortly.");
    } finally {
      setExplainLoading(false);
    }
  }

  const [debugVisible, setDebugVisible] = useState(false);
  const [debugLoading, setDebugLoading] = useState(false);
  const [debugData, setDebugData] = useState<string | null>(null);

  async function handleDebug() {
    setDebugVisible(true);
    if (debugData) return;
    setDebugLoading(true);
    try {
      const res = await api.insightDebug(insight.id);
      setDebugData(JSON.stringify(res, null, 2));
    } catch (e: any) {
      setDebugData("Error: " + (e?.message ?? "unknown"));
    } finally {
      setDebugLoading(false);
    }
  }

  const translateX = useRef(new Animated.Value(0)).current;
  const panResponder = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, { dx, dy }) => Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.5,
    onPanResponderMove: (_, { dx }) => {
      if (dx < 0) translateX.setValue(dx);
    },
    onPanResponderRelease: (_, { dx }) => {
      if (dx < -72 && onDismiss) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Animated.timing(translateX, { toValue: -500, duration: 200, useNativeDriver: true }).start(() => {
          onDismiss(insight.id);
        });
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true, tension: 180, friction: 12 }).start();
      }
    },
    onPanResponderTerminate: () => {
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true, tension: 180, friction: 12 }).start();
    },
  })).current;

  if (compact && !expanded) {
    return (
      <Animated.View style={{ transform: [{ translateX }] }} {...panResponder.panHandlers}>
        <ShadowCard size="tile">
          <Pressable
            onPress={(e) => {
              const now = Date.now();
              if (now - lastTapRef.current < 300 && onPin) {
                Haptics.selectionAsync();
                onPin(insight.id, !isPinned);
                fireBurst(e.nativeEvent.locationX, e.nativeEvent.locationY);
              } else {
                setExpanded(true);
              }
              lastTapRef.current = now;
            }}
            onPressIn={onPressIn}
            onPressOut={onPressOut}
            onLongPress={__DEV__ ? () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {}); handleDebug(); } : undefined}
            style={styles.compactRow}
            accessibilityRole="button"
            accessibilityLabel={insight.title}
          >
            <View style={[styles.compactIcon, { backgroundColor: confColor + "22" }]}>
              <Ionicons name={icon as any} size={13} color={confColor} />
            </View>
            <Text style={[styles.compactTitle, { color: theme.textStrong }]} numberOfLines={1}>
              {insight.title}
            </Text>
            <View style={[styles.confDot, { backgroundColor: confColor }]} />
            <Text style={[styles.compactSummary, { color: theme.textSoft }]} numberOfLines={1}>
              {adaptiveInsight(insight.description, insight.confidence as any)}
            </Text>
            <Ionicons name="chevron-forward" size={13} color={theme.textSoft} style={{ marginLeft: 2 }} />
          </Pressable>
          {burstPos && (
            <Animated.View
              pointerEvents="none"
              style={{
                position: "absolute",
                left: burstPos.x - 16,
                top: burstPos.y - 20,
                opacity: burstOpacity,
                transform: [{ scale: burstScale }],
              }}
            >
              <Ionicons name="heart" size={32} color={theme.berry?.solid ?? theme.danger} />
            </Animated.View>
          )}
        </ShadowCard>
        {__DEV__ && (
          <Modal visible={debugVisible} transparent animationType="fade" onRequestClose={() => setDebugVisible(false)}>
            <Pressable style={styles.modalOverlay} onPress={() => setDebugVisible(false)}>
              <Pressable style={[styles.modalSheet, { backgroundColor: theme.card, borderColor: theme.cardBorder }]} onPress={() => {}}>
                <View style={styles.modalHandle} />
                <Text style={[styles.modalTitle, { color: theme.textStrong }]}>Debug — {insight.id.slice(0, 8)}</Text>
                {debugLoading ? (
                  <ActivityIndicator color={theme.teal.solid} style={{ marginVertical: 20 }} />
                ) : (
                  <ScrollView style={{ maxHeight: 340 }}>
                    <Text style={[styles.modalBody, { color: theme.textStrong, fontFamily: "monospace", fontSize: 11 }]}>{debugData ?? ""}</Text>
                  </ScrollView>
                )}
                <Pressable
                  onPress={() => setDebugVisible(false)}
                  style={[styles.modalClose, { borderColor: theme.cardBorder }]}
                  accessibilityRole="button"
                  accessibilityLabel="Close debug"
                >
                  <Text style={{ color: theme.textSoft, fontSize: 13, fontWeight: "700" }}>Close</Text>
                </Pressable>
              </Pressable>
            </Pressable>
          </Modal>
        )}
      </Animated.View>
    );
  }

  return (
    <Animated.View style={{ transform: [{ translateX }] }} {...panResponder.panHandlers}>
    <ShadowCard size="tile">
    <Pressable
      onPress={(e) => {
        const now = Date.now();
        const tapX = e.nativeEvent.locationX;
        const tapY = e.nativeEvent.locationY;
        if (now - lastTapRef.current < 300 && onPin) {
          Haptics.selectionAsync();
          onPin(insight.id, !isPinned);
          fireBurst(tapX, tapY);
        } else {
          setExpanded(ex => !ex);
        }
        lastTapRef.current = now;
      }}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      onLongPress={__DEV__ ? () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {}); handleDebug(); } : undefined}
      style={{ flex: 1 }}
      accessibilityRole="button"
      accessibilityLabel={insight.title}
    >
      <View style={styles.headerRow}>
        <View style={[styles.iconBox, { backgroundColor: confColor }]}>
          <Ionicons name={icon as any} size={15} color={onSolid(confColor)} />
        </View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={[styles.title, { color: theme.textStrong }]}>{insight.title}</Text>
          <View style={styles.metaRow}>
            <View style={[styles.confBadge, { backgroundColor: confColor + "22", borderColor: confColor }]}>
              <Text style={[styles.confText, { color: confColor }]}>{confLabel}</Text>
            </View>
            {isNew && (
              <View style={[styles.newBadge, { backgroundColor: theme.teal?.solid ?? "#3FA0A6" }]}>
                <Text style={styles.newBadgeText}>NEW</Text>
              </View>
            )}
            {insight.times_observed > 1 && (
              <Text style={[styles.ageText, { color: theme.textSoft }]}> · seen {insight.times_observed}×</Text>
            )}
            <Text style={[styles.ageText, { color: theme.textSoft }]}> · {ageLabel}</Text>
          </View>
        </View>
        {onPin && (
          <Pressable onPress={() => { Haptics.selectionAsync(); onPin(insight.id, !isPinned); }} hitSlop={8} style={{ marginLeft: 6 }}>
            <Ionicons
              name={isPinned ? "bookmark" : "bookmark-outline"}
              size={16}
              color={isPinned ? theme.teal.solid : theme.textSoft}
            />
          </Pressable>
        )}
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={16}
          color={theme.textSoft}
          style={{ marginLeft: 6 }}
        />
      </View>

      <Text style={[styles.description, { color: theme.textStrong }]}>
        {adaptiveInsight(insight.description, insight.confidence as any)}
      </Text>

      {expanded && (
        <View style={[styles.supportBox, { borderTopColor: ink + "33" }]}>
          <Text style={[styles.supportHeader, { color: theme.textSoft }]}>Why am I seeing this?</Text>
          <Text style={[styles.supportNote, { color: theme.textSoft }]}>
            This pattern was observed across {insight.times_observed} data points. Confidence is based on sample size and effect size — not a medical finding.
          </Text>
          <View style={styles.dataGrid}>
            {supportRows.map(row => (
              <View key={row.label} style={[styles.dataRow, { borderBottomColor: ink + "1A" }]}>
                <Text style={[styles.dataLabel, { color: theme.textSoft }]}>{row.label}</Text>
                <Text style={[styles.dataValue, { color: theme.textStrong }]}>{row.value}</Text>
              </View>
            ))}
          </View>
          {tip && (
            <Text style={[styles.tipText, { color: theme.textSoft }]}>{tip}</Text>
          )}
          {insight.prior_period_value !== undefined && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: theme.cardBorder }}>
              <Ionicons name="time-outline" size={14} color={theme.textSoft} />
              <Text style={{ fontSize: FONT_SIZES.caption, color: theme.textSoft }}>
                {"Last month: " + formatInsightValue(insight.prior_period_value) + " " + (
                  insight.confidence_score > insight.prior_period_value ? "↑" :
                  insight.confidence_score < insight.prior_period_value ? "↓" : "→"
                )}
              </Text>
            </View>
          )}
          <FeedbackRow insightId={insight.id} theme={theme} />
          <View style={{ flexDirection: "row", gap: 12, marginTop: 8, alignItems: "center" }}>
            <Pressable
              onPress={() => {
                navigation.navigate("Chat", { initialQuestion: `Why might this be: ${insight.title}?` });
              }}
              accessibilityRole="link"
              accessibilityLabel="Ask why in Chat"
            >
              <Text style={{ color: theme.teal.solid, fontSize: 11, fontWeight: "700" }}>Ask why →</Text>
            </Pressable>
            <Pressable
              onPress={handleExplain}
              accessibilityRole="button"
              accessibilityLabel="Ask about this insight"
            >
              <Text style={{ color: theme.teal.solid, fontSize: 11, fontWeight: "700" }}>Ask about this →</Text>
            </Pressable>
          </View>
          {insight.rule_id && (
            <TryThisButton insightId={insight.id} theme={theme} />
          )}
          {onDismiss && (
            <View style={{ flexDirection: "row", gap: 6 }}>
              {onSnooze && (
                <Pressable
                  onPress={() => onSnooze(insight.id, 7)}
                  style={[styles.dismissBtn, { borderColor: ink + "44", flex: 1 }]}
                  accessibilityRole="button"
                  accessibilityLabel="Snooze this insight for a week"
                >
                  <Text style={[styles.dismissText, { color: theme.textSoft }]}>Snooze 7d</Text>
                </Pressable>
              )}
              <Pressable
                onPress={() => onDismiss(insight.id)}
                style={[styles.dismissBtn, { borderColor: ink + "44", flex: 1 }]}
                accessibilityRole="button"
                accessibilityLabel="Dismiss this insight"
              >
                <Text style={[styles.dismissText, { color: theme.textSoft }]}>Dismiss</Text>
              </Pressable>
            </View>
          )}
          {compact && (
            <Pressable
              onPress={() => setExpanded(false)}
              style={[styles.dismissBtn, { borderColor: ink + "44", alignSelf: "center", marginTop: 4 }]}
              accessibilityRole="button"
              accessibilityLabel="Collapse insight"
            >
              <Text style={[styles.dismissText, { color: theme.textSoft }]}>Collapse</Text>
            </Pressable>
          )}
        </View>
      )}
    </Pressable>
    {burstPos && (
      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: burstPos.x - 16,
          top: burstPos.y - 20,
          opacity: burstOpacity,
          transform: [{ scale: burstScale }],
        }}
      >
        <Ionicons name="heart" size={32} color={theme.berry?.solid ?? theme.danger} />
      </Animated.View>
    )}
    </ShadowCard>

    <Modal visible={explainVisible} transparent animationType="fade" onRequestClose={() => setExplainVisible(false)}>
      <Pressable style={styles.modalOverlay} onPress={() => setExplainVisible(false)}>
        <Pressable style={[styles.modalSheet, { backgroundColor: theme.card, borderColor: theme.cardBorder }]} onPress={() => {}}>
          <View style={styles.modalHandle} />
          <Text style={[styles.modalTitle, { color: theme.textStrong }]}>About this insight</Text>
          {explainLoading ? (
            <ActivityIndicator color={theme.teal.solid} style={{ marginVertical: 20 }} />
          ) : (
            <ScrollView style={{ maxHeight: 320 }}>
              <Text style={[styles.modalBody, { color: theme.textStrong }]}>{explainText ?? ""}</Text>
            </ScrollView>
          )}
          <Pressable
            onPress={() => setExplainVisible(false)}
            style={[styles.modalClose, { borderColor: theme.cardBorder }]}
            accessibilityRole="button"
            accessibilityLabel="Close explanation"
          >
            <Text style={{ color: theme.textSoft, fontSize: 13, fontWeight: "700" }}>Close</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>

    {__DEV__ && (
      <Modal visible={debugVisible} transparent animationType="fade" onRequestClose={() => setDebugVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setDebugVisible(false)}>
          <Pressable style={[styles.modalSheet, { backgroundColor: theme.card, borderColor: theme.cardBorder }]} onPress={() => {}}>
            <View style={styles.modalHandle} />
            <Text style={[styles.modalTitle, { color: theme.textStrong }]}>Debug — {insight.id.slice(0, 8)}</Text>
            {debugLoading ? (
              <ActivityIndicator color={theme.teal.solid} style={{ marginVertical: 20 }} />
            ) : (
              <ScrollView style={{ maxHeight: 340 }}>
                <Text style={[styles.modalBody, { color: theme.textStrong, fontFamily: "monospace", fontSize: 11 }]}>{debugData ?? ""}</Text>
              </ScrollView>
            )}
            <Pressable
              onPress={() => setDebugVisible(false)}
              style={[styles.modalClose, { borderColor: theme.cardBorder }]}
              accessibilityRole="button"
              accessibilityLabel="Close debug"
            >
              <Text style={{ color: theme.textSoft, fontSize: 13, fontWeight: "700" }}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    )}
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  compactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 40,
  },
  compactIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  compactTitle: {
    fontSize: FONT_SIZES.body,
    fontWeight: "700",
    flexShrink: 0,
    maxWidth: "40%",
  },
  confDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    flexShrink: 0,
  },
  compactSummary: {
    fontSize: FONT_SIZES.caption,
    flex: 1,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  iconBox: {
    width: 30,
    height: 30,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  title: {
    fontSize: FONT_SIZES.body,
    fontWeight: "800",
    lineHeight: 19,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 3,
  },
  confBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
  },
  confText: {
    fontSize: FONT_SIZES.micro,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  newBadge: {
    marginLeft: 5,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  newBadgeText: {
    fontSize: 9,
    fontWeight: "900",
    color: "#fff",
    letterSpacing: 0.5,
  },
  ageText: {
    fontSize: FONT_SIZES.caption,
  },
  description: {
    fontSize: FONT_SIZES.body,
    lineHeight: 20,
  },
  supportBox: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  supportHeader: {
    fontSize: FONT_SIZES.caption,
    fontWeight: "800",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  supportNote: {
    fontSize: FONT_SIZES.caption,
    lineHeight: 16,
    marginBottom: 10,
    fontStyle: "italic",
  },
  dataGrid: {
    gap: 0,
  },
  dataRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 5,
    borderBottomWidth: 1,
  },
  dataLabel: {
    fontSize: FONT_SIZES.label,
    flex: 1,
  },
  dataValue: {
    fontSize: FONT_SIZES.label,
    fontWeight: "700",
  },
  tipText: {
    fontSize: FONT_SIZES.caption,
    lineHeight: 15,
    fontStyle: "italic",
    marginTop: 10,
    marginBottom: 4,
  },
  dismissBtn: {
    marginTop: 12,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  dismissText: {
    fontSize: FONT_SIZES.label,
    fontWeight: "600",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1.5,
    padding: 20,
    paddingBottom: 32,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#00000033",
    alignSelf: "center",
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 12,
  },
  modalBody: {
    fontSize: FONT_SIZES.body,
    lineHeight: 20,
  },
  modalClose: {
    marginTop: 16,
    alignSelf: "center",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 8,
  },
  feedbackRow: {
    marginTop: 12,
    gap: 6,
  },
  feedbackLabel: {
    fontSize: FONT_SIZES.caption,
    fontWeight: "700",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  feedbackButtons: {
    flexDirection: "row",
    gap: 6,
    flexWrap: "wrap",
  },
  feedbackBtn: {
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  feedbackBtnText: {
    fontSize: FONT_SIZES.label,
    fontWeight: "700",
  },
  tryBtn: {
    marginTop: 10,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 2,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
  },
  tryBtnText: {
    fontSize: FONT_SIZES.body,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
});

function FeedbackRow({ insightId, theme }: { insightId: string; theme: any }) {
  const [chosen, setChosen] = useState<FeedbackRating | null>(null);
  const [busy, setBusy] = useState(false);

  const options: Array<{ id: FeedbackRating; label: string; icon: keyof typeof Ionicons.glyphMap; color: string }> = [
    { id: "helpful",      label: "Helpful",      icon: "thumbs-up-outline",   color: theme.teal.solid },
    { id: "already_knew", label: "Knew it",      icon: "checkmark-done",      color: theme.textSoft },
    { id: "neutral",      label: "Neutral",      icon: "remove-outline",      color: theme.textSoft },
    { id: "not_useful",   label: "Not useful",   icon: "thumbs-down-outline", color: theme.coral?.sub ?? "#B84A2E" },
  ];

  async function pick(rating: FeedbackRating) {
    if (busy) return;
    setBusy(true);
    try {
      await api.insightFeedback(insightId, rating);
      setChosen(rating);
      Haptics.selectionAsync().catch(() => {});
    } catch {
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.feedbackRow}>
      <Text style={[styles.feedbackLabel, { color: theme.textSoft }]}>Was this useful?</Text>
      <View style={styles.feedbackButtons}>
        {options.map((o) => {
          const selected = chosen === o.id;
          return (
            <Pressable
              key={o.id}
              onPress={() => pick(o.id)}
              disabled={busy || chosen !== null}
              style={[styles.feedbackBtn, {
                borderColor: selected ? o.color : theme.cardBorder,
                backgroundColor: selected ? o.color : "transparent",
                opacity: chosen && !selected ? 0.5 : 1,
              }]}
              accessibilityRole="button"
              accessibilityLabel={o.label}
              accessibilityState={{ selected }}
            >
              <Ionicons name={o.icon} size={14} color={selected ? "#fff" : o.color} />
              <Text style={[styles.feedbackBtnText, { color: selected ? "#fff" : theme.textSoft }]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {chosen && (
        <Text style={[styles.feedbackLabel, { color: theme.textSoft, textTransform: "none", fontStyle: "italic" }]}>
          {chosen === "not_useful"
            ? "Thanks — insights of this kind will show up less for you."
            : "Thanks for the feedback."}
        </Text>
      )}
    </View>
  );
}

function TryThisButton({ insightId, theme }: { insightId: string; theme: any }) {
  const [busy, setBusy] = useState(false);
  const [seeded, setSeeded] = useState(false);

  async function seed() {
    if (busy || seeded) return;
    setBusy(true);
    try {
      const res = await api.insightTry(insightId);
      if (res.ok) {
        setSeeded(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        Alert.alert(
          "Experiment started",
          res.description ?? "Track this behavior for the next two weeks — the app will surface the results when it wraps.",
        );
      } else {
        Alert.alert("Can't set up an experiment", res.reason ?? "This insight doesn't have an actionable template yet.");
      }
    } catch (e: any) {
      Alert.alert("Failed", e?.message ?? "Try again in a bit.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Pressable
      onPress={seed}
      disabled={busy || seeded}
      style={[styles.tryBtn, {
        borderColor: theme.teal.solid,
        backgroundColor: seeded ? theme.teal.solid : theme.teal.bg,
        opacity: busy ? 0.6 : 1,
      }]}
      accessibilityRole="button"
      accessibilityLabel={seeded ? "Experiment started" : "Try this — start a 2-week experiment"}
    >
      <Ionicons name={seeded ? "checkmark-circle" : "flask-outline"} size={16} color={seeded ? "#fff" : theme.teal.fg} />
      <Text style={[styles.tryBtnText, { color: seeded ? "#fff" : theme.teal.fg }]}>
        {seeded ? "Experiment started" : "Try this — 2-week experiment"}
      </Text>
    </Pressable>
  );
}
