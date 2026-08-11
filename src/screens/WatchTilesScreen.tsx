import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ScrollView,
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  Dimensions,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import Svg, { Circle, Path, Rect, Defs, ClipPath } from "react-native-svg";
import * as Haptics from "expo-haptics";
import { useTheme } from "../theme/ThemeContext";
import { api } from "../api/client";
import { toast } from "../lib/toast";
import { trackMindfulnessCompletion } from "../lib/mindfulnessTracker";
import { todayStr } from "../utils/dateUtils";

// Watch-face palette (fixed dark face, independent of app theme)
const W = {
  bg: "#10141A",
  fg: "#F2F4F7",
  dim: "#8A93A0",
  rule: "#232B36",
  bezel: "#1C1B1A",
  teal: "#4ECDC4",
  blue: "#5EA0F0",
  coral: "#FF7A6B",
  lavender: "#B79CFF",
  red: "#FF5252",
  amber: "#F5A623",
  green: "#2ECC71",
};

const STEP_GOAL = 10000;

type GlucoseStatus = {
  hasData: boolean;
  mg_dl: number | null;
  trend?: string | null;
  arrow?: string | null;
  delta?: number | null;
  minutesSinceReading?: number;
  isStale?: boolean;
};

function glucoseState(status: GlucoseStatus): { color: string; label: string } {
  const mg = status.mg_dl ?? 0;
  const trend = status.trend ?? "";
  const delta = status.delta ?? null;
  const rising = /Up/.test(trend) || (delta != null && delta >= 10);
  const falling = /Down/.test(trend) || (delta != null && delta <= -10);
  if (status.isStale) {
    const mins = status.minutesSinceReading ?? 0;
    return { color: W.dim, label: `STALE · ${mins}M AGO` };
  }
  if (mg < 70) return { color: W.red, label: falling ? "LOW & FALLING" : "LOW" };
  if (mg > 180) return { color: W.red, label: rising ? "HIGH & RISING" : "HIGH" };
  if (mg > 140 && rising) return { color: W.red, label: "RISING HIGH" };
  if (mg < 80 && falling) return { color: W.red, label: "DROPPING" };
  if (mg > 140) return { color: W.amber, label: "ELEVATED" };
  return { color: W.green, label: "IN RANGE" };
}

function sumTodayLogs(logs: Array<{ logged_at: string; value: number }>): number {
  const today = new Date().toDateString();
  return logs
    .filter((l) => new Date(l.logged_at).toDateString() === today)
    .reduce((sum, l) => sum + Number(l.value), 0);
}

function fmtClock(d: Date): string {
  return d.getHours() + ":" + String(d.getMinutes()).padStart(2, "0");
}

// ── Rings (face 1A) ───────────────────────────────────────────────────────────

function ProgressRing({ size, stroke, r, color, frac }: {
  size: number; stroke: number; r: number; color: string; frac: number;
}) {
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, frac));
  return (
    <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeOpacity={0.16} strokeWidth={stroke} fill="none" />
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        fill="none"
        strokeDasharray={`${c * clamped} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </Svg>
  );
}

// ── Breathe session ───────────────────────────────────────────────────────────

type BreathePhase = { label: string; secs: number; grow: "in" | "hold" | "out" };
const BOX_PHASES: BreathePhase[] = [
  { label: "INHALE", secs: 4, grow: "in" },
  { label: "HOLD", secs: 4, grow: "hold" },
  { label: "EXHALE", secs: 4, grow: "out" },
  { label: "HOLD", secs: 4, grow: "hold" },
];
const RELAX_PHASES: BreathePhase[] = [
  { label: "INHALE", secs: 4, grow: "in" },
  { label: "HOLD", secs: 7, grow: "hold" },
  { label: "EXHALE", secs: 8, grow: "out" },
];

function BreatheOverlay({ onClose, refreshStats }: { onClose: () => void; refreshStats: () => void }) {
  const [phases, setPhases] = useState<BreathePhase[] | null>(null);
  const [phaseIdx, setPhaseIdx] = useState(0);
  const scaleAnim = useRef(new Animated.Value(0.6)).current;
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    if (!phases) return;
    const phase = phases[phaseIdx % phases.length];
    Haptics.selectionAsync().catch(() => {});
    if (phase.grow === "in") {
      Animated.timing(scaleAnim, { toValue: 1, duration: phase.secs * 1000, useNativeDriver: true }).start();
    } else if (phase.grow === "out") {
      Animated.timing(scaleAnim, { toValue: 0.6, duration: phase.secs * 1000, useNativeDriver: true }).start();
    }
    const t = setTimeout(() => setPhaseIdx((i) => i + 1), phase.secs * 1000);
    return () => clearTimeout(t);
  }, [phases, phaseIdx]);

  function start(p: BreathePhase[]) {
    startedAt.current = Date.now();
    setPhaseIdx(0);
    setPhases(p);
  }

  function end() {
    if (phases && startedAt.current) {
      const secs = Math.round((Date.now() - startedAt.current) / 1000);
      if (secs >= 30) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        trackMindfulnessCompletion("breathing", { duration_seconds: secs });
        toast("Breathing session logged", "success");
        refreshStats();
      }
    }
    onClose();
  }

  const isBox = phases === BOX_PHASES;
  const phase = phases ? phases[phaseIdx % phases.length] : null;

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: W.bg, borderRadius: 999, justifyContent: "center", paddingHorizontal: 56, gap: 10, zIndex: 5 }]}>
      {!phases ? (
        <>
          <Text style={styles.overlayLabel}>BREATHE — PICK A PACE</Text>
          <Pressable onPress={() => start(BOX_PHASES)} style={styles.pillSolid} accessibilityRole="button" accessibilityLabel="Start box breathing, 4-4-4-4">
            <Text style={styles.pillSolidText}>BOX · 4-4-4-4</Text>
          </Pressable>
          <Pressable onPress={() => start(RELAX_PHASES)} style={styles.pillOutline} accessibilityRole="button" accessibilityLabel="Start relax breathing, 4-7-8">
            <Text style={styles.pillOutlineText}>RELAX · 4-7-8</Text>
          </Pressable>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Cancel breathing">
            <Text style={{ color: W.dim, fontSize: 10, fontWeight: "800", letterSpacing: 1.4, paddingVertical: 4 }}>CANCEL</Text>
          </Pressable>
        </>
      ) : (
        <Pressable onPress={end} style={{ alignItems: "center", gap: 24 }} accessibilityRole="button" accessibilityLabel="End breathing session">
          <View style={{ width: 130, height: 130, alignItems: "center", justifyContent: "center" }}>
            <Animated.View
              style={{
                position: "absolute",
                width: 130,
                height: 130,
                borderRadius: 65,
                borderWidth: 2,
                borderColor: W.teal,
                backgroundColor: "rgba(78,205,196,0.08)",
                transform: [{ scale: scaleAnim }],
              }}
            />
            <Text style={{ color: phase?.label === "HOLD" ? W.teal : W.fg, fontSize: 11, fontWeight: "900", letterSpacing: 2 }}>
              {phase?.label}
            </Text>
          </View>
          <Text style={{ color: W.dim, fontSize: 9, fontWeight: "700", letterSpacing: 1.6 }}>
            {isBox ? "BOX" : "4-7-8"} · TAP TO END
          </Text>
        </Pressable>
      )}
    </View>
  );
}

// ── Watch face frame ──────────────────────────────────────────────────────────

function WatchFace({ size, children }: { size: number; children: React.ReactNode }) {
  const bezel = Math.round(size * 0.049);
  return (
    <View style={{ width: size, height: size }}>
      <View style={{ position: "absolute", right: -5, top: size * 0.32, width: 10, height: size * 0.1, borderRadius: 5, backgroundColor: "#2B2A29" }} />
      <View style={{ position: "absolute", right: -5, top: size * 0.56, width: 10, height: size * 0.1, borderRadius: 5, backgroundColor: "#2B2A29" }} />
      <View style={[StyleSheet.absoluteFill, { borderRadius: size / 2, backgroundColor: W.bezel }]} />
      <View style={{ position: "absolute", top: bezel, left: bezel, right: bezel, bottom: bezel, borderRadius: size / 2, backgroundColor: W.bg, overflow: "hidden" }}>
        {children}
      </View>
    </View>
  );
}

function FaceHeader({ time }: { time: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
      <Text style={{ color: W.teal, fontSize: 11, fontWeight: "900", letterSpacing: 2.2 }}>RIPPLE</Text>
      <Text style={{ color: W.dim, fontSize: 11, fontWeight: "700" }}>{time}</Text>
    </View>
  );
}

function StatCell({ label, value, unit, color }: { label: string; value: string; unit?: string; color: string }) {
  return (
    <View style={{ width: "47%", borderTopWidth: 2, borderTopColor: W.rule, paddingTop: 5 }}>
      <Text style={{ color: W.dim, fontSize: 8, fontWeight: "800", letterSpacing: 1.4 }}>{label}</Text>
      <Text style={{ color, fontSize: 16, fontWeight: "900" }}>
        {value}
        {unit ? <Text style={{ color: W.dim, fontSize: 9, fontWeight: "700" }}> {unit}</Text> : null}
      </Text>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export function WatchTilesScreen() {
  const { theme } = useTheme();
  const screenW = Dimensions.get("window").width;
  const FACE = Math.min(340, screenW - 64);

  const [time, setTime] = useState(fmtClock(new Date()));
  const [glucose, setGlucose] = useState<GlucoseStatus | null>(null);
  const [steps, setSteps] = useState<number | null>(null);
  const [bpm, setBpm] = useState<number | null>(null);
  const [sleepSecs, setSleepSecs] = useState<number | null>(null);
  const [waterMetricId, setWaterMetricId] = useState<string | null>(null);
  const [water, setWater] = useState(0);
  const [waterGoal, setWaterGoal] = useState(8);
  const [mind, setMind] = useState<{ streak: number; week_minutes: number; total_sessions: number } | null>(null);
  const [mood, setMood] = useState<string | null>(null);
  const [breatheOn, setBreatheOn] = useState<null | "1a" | "1c">(null);
  const [statsKey, setStatsKey] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTime(fmtClock(new Date())), 30000);
    return () => clearInterval(t);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const today = todayStr();
      api.glucoseStatus().then((s: any) => { if (!cancelled) setGlucose(s); }).catch(() => {});
      api.stepsToday(today).then((d: any) => {
        const n = typeof d === "number" ? d : d?.count ?? d?.steps ?? null;
        if (!cancelled) setSteps(n != null ? Number(n) : null);
      }).catch(() => {});
      const hrStart = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
      api.heartRateRange(hrStart, new Date().toISOString()).then((rows: any) => {
        if (!cancelled && Array.isArray(rows) && rows.length > 0) {
          setBpm(Number(rows[rows.length - 1].bpm));
        }
      }).catch(() => {});
      api.sleepStats().then((s: any) => {
        if (!cancelled && s?.yesterday_seconds > 0) setSleepSecs(s.yesterday_seconds);
      }).catch(() => {});
      api.getOrCreateWaterMetric().then(async (metric: any) => {
        if (cancelled || !metric?.id) return;
        setWaterMetricId(metric.id);
        const logs = await api.todaysWaterCount(metric.id);
        if (!cancelled) setWater(sumTodayLogs(Array.isArray(logs) ? logs : []));
      }).catch(() => {});
      api.getSettings().then((s: any) => {
        const goal = s?.smart_notifications?.water_reminder?.goal;
        if (!cancelled && typeof goal === "number" && goal > 0) setWaterGoal(goal);
      }).catch(() => {});
      api.mindfulnessStats().then((s: any) => { if (!cancelled && s) setMind(s); }).catch(() => {});
      return () => { cancelled = true; };
    }, [statsKey])
  );

  async function logGlass() {
    if (!waterMetricId) return;
    const prev = water;
    setWater(prev + 1);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      await api.logWater(waterMetricId);
      if (prev + 1 === waterGoal) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        toast("Water goal hit! 💧", "success");
      }
    } catch {
      setWater(prev);
      toast("Couldn't log that glass. Try again.", "error");
    }
  }

  async function pickMood(label: string, score: number) {
    setMood(label);
    Haptics.selectionAsync().catch(() => {});
    try {
      await api.logMoodMoment(score, label);
      toast("Mood logged", "success");
    } catch {
      setMood(null);
      toast("Couldn't log mood. Try again.", "error");
    }
  }

  const glu = glucose?.hasData && glucose.mg_dl != null ? glucoseState(glucose) : null;
  const gluText = glu && glucose?.isStale ? W.dim : glu?.color ?? W.dim;
  const waterFrac = waterGoal > 0 ? Math.min(1, water / waterGoal) : 0;
  const stepsFrac = steps != null ? Math.min(1, steps / STEP_GOAL) : 0;
  const sleepLabel = sleepSecs != null
    ? Math.floor(sleepSecs / 3600) + ":" + String(Math.round((sleepSecs % 3600) / 60)).padStart(2, "0")
    : "--";

  // Droplet fill geometry (viewBox 0 0 100 125; fill rises from y=122 → y=10)
  const dropY = 122 - waterFrac * 112;

  const MOODS: Array<{ label: string; score: number }> = [
    { label: "LOW", score: 2 },
    { label: "OK", score: 3 },
    { label: "GOOD", score: 4 },
  ];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.page }} contentContainerStyle={{ paddingVertical: 20, paddingBottom: 60 }}>
      <Text style={{ color: theme.textSoft, fontSize: 12, fontWeight: "600", textAlign: "center", paddingHorizontal: 32, marginBottom: 16 }}>
        Wear OS tile concepts — swipe between the three faces. Water, mood, and breathe sessions log for real.
      </Text>

      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        snapToInterval={screenW}
        decelerationRate="fast"
      >
        {/* ── 1A GLANCE ── */}
        <View style={[styles.page, { width: screenW }]}>
          <Text style={[styles.faceTitle, { color: theme.textStrong }]}>GLANCE — full dashboard</Text>
          <WatchFace size={FACE}>
            <ProgressRing size={FACE - Math.round(FACE * 0.098)} stroke={5} r={(FACE - Math.round(FACE * 0.098)) / 2 - 6} color={W.teal} frac={stepsFrac} />
            <ProgressRing size={FACE - Math.round(FACE * 0.098)} stroke={5} r={(FACE - Math.round(FACE * 0.098)) / 2 - 14} color={W.blue} frac={waterFrac} />
            <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: FACE * 0.17, gap: 7 }}>
              <FaceHeader time={time} />
              <View>
                <Text style={{ color: W.dim, fontSize: 9, fontWeight: "800", letterSpacing: 1.6 }}>GLUCOSE — MG/DL</Text>
                {glu ? (
                  <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                    <Text style={{ color: gluText, fontSize: 40, fontWeight: "900", letterSpacing: -1.5, lineHeight: 44 }}>
                      {glucose!.mg_dl}
                    </Text>
                    <Text style={{ color: gluText, fontSize: 24, fontWeight: "900" }}>{glucose!.arrow ?? ""}</Text>
                    <Text style={{ color: glucose!.isStale ? W.dim : glu.color, fontSize: 10, fontWeight: "800", letterSpacing: 1.2 }}>
                      {glu.label}
                    </Text>
                  </View>
                ) : (
                  <Text style={{ color: W.dim, fontSize: 18, fontWeight: "900" }}>NO DATA</Text>
                )}
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 7 }}>
                <StatCell label="STEPS" value={steps != null ? steps.toLocaleString() : "--"} color={W.teal} />
                <StatCell label="HEART" value={bpm != null ? String(bpm) : "--"} unit={bpm != null ? "BPM" : undefined} color={W.coral} />
                <StatCell label="WATER" value={String(water)} unit={"/ " + waterGoal} color={W.blue} />
                <StatCell label="SLEEP" value={sleepLabel} color={W.lavender} />
              </View>
              <Pressable onPress={() => setBreatheOn("1a")} style={styles.pillSolid} accessibilityRole="button" accessibilityLabel="Open breathing exercise">
                <Text style={styles.pillSolidText}>WELLNESS — BREATHE →</Text>
              </Pressable>
            </View>
            {breatheOn === "1a" && (
              <BreatheOverlay onClose={() => setBreatheOn(null)} refreshStats={() => setStatsKey((k) => k + 1)} />
            )}
          </WatchFace>
          <Text style={[styles.caption, { color: theme.textSoft }]}>
            Glucose hero with trend arrow — turns red when high, low, or heading there (rising while elevated / falling while low). Stale readings grey out with their age. Rings: steps (teal) and water (blue).
          </Text>
        </View>

        {/* ── 1B LOG ── */}
        <View style={[styles.page, { width: screenW }]}>
          <Text style={[styles.faceTitle, { color: theme.textStrong }]}>LOG — water + mood</Text>
          <WatchFace size={FACE}>
            <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: FACE * 0.15, gap: 9 }}>
              <FaceHeader time={time} />
              <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                <View style={{ width: 84, height: 105 }}>
                  <Svg width={84} height={105} viewBox="0 0 100 125">
                    <Defs>
                      <ClipPath id="dropClip">
                        <Path d="M50 4 C50 4 12 55 12 82 A38 38 0 0 0 88 82 C88 55 50 4 50 4 Z" />
                      </ClipPath>
                    </Defs>
                    <Path d="M50 4 C50 4 12 55 12 82 A38 38 0 0 0 88 82 C88 55 50 4 50 4 Z" fill="rgba(94,160,240,0.10)" />
                    <Rect x={0} y={dropY} width={100} height={125} fill={W.blue} clipPath="url(#dropClip)" />
                    <Path d="M50 4 C50 4 12 55 12 82 A38 38 0 0 0 88 82 C88 55 50 4 50 4 Z" fill="none" stroke={W.blue} strokeWidth={3} />
                  </Svg>
                  <View style={{ position: "absolute", left: 0, right: 0, top: 40, alignItems: "center" }}>
                    <Text style={{ color: W.fg, fontSize: 26, fontWeight: "900", lineHeight: 28 }}>{water}</Text>
                    <Text style={{ color: W.fg, fontSize: 10, fontWeight: "800", opacity: 0.75 }}>/ {waterGoal}</Text>
                  </View>
                </View>
                <View style={{ flex: 1, gap: 8 }}>
                  <Text style={{ color: W.dim, fontSize: 9, fontWeight: "800", letterSpacing: 1.6 }}>WATER — GLASSES</Text>
                  <Text style={{ color: W.blue, fontSize: 19, fontWeight: "900" }}>
                    {Math.round(waterFrac * 100)}%
                    <Text style={{ color: W.dim, fontSize: 10, fontWeight: "700" }}> OF GOAL</Text>
                  </Text>
                  <Pressable onPress={logGlass} style={[styles.pillSolid, { backgroundColor: W.blue }]} accessibilityRole="button" accessibilityLabel="Log one glass of water">
                    <Text style={styles.pillSolidText}>+ LOG GLASS</Text>
                  </Pressable>
                </View>
              </View>
              <View style={{ borderTopWidth: 2, borderTopColor: W.rule, paddingTop: 7 }}>
                <Text style={{ color: W.dim, fontSize: 9, fontWeight: "800", letterSpacing: 1.6, marginBottom: 6 }}>MOOD CHECK-IN</Text>
                <View style={{ flexDirection: "row", gap: 7 }}>
                  {MOODS.map((m) => {
                    const selected = mood === m.label;
                    return (
                      <Pressable
                        key={m.label}
                        onPress={() => pickMood(m.label, m.score)}
                        style={[styles.moodPill, selected && { borderColor: W.lavender }]}
                        accessibilityRole="button"
                        accessibilityLabel={"Log mood " + m.label.toLowerCase()}
                      >
                        <Text style={{ color: selected ? W.lavender : W.fg, fontSize: 10, fontWeight: "900", letterSpacing: 1 }}>{m.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </View>
          </WatchFace>
          <Text style={[styles.caption, { color: theme.textSoft }]}>
            Live: tap + LOG GLASS — the droplet fills and syncs to your real water log. Mood squares log a quick mood moment.
          </Text>
        </View>

        {/* ── 1C BREATHE ── */}
        <View style={[styles.page, { width: screenW }]}>
          <Text style={[styles.faceTitle, { color: theme.textStrong }]}>BREATHE — session starter</Text>
          <WatchFace size={FACE}>
            <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: FACE * 0.16, gap: 9 }}>
              <FaceHeader time={time} />
              <View>
                <Text style={{ color: W.dim, fontSize: 9, fontWeight: "800", letterSpacing: 1.6 }}>MINDFULNESS</Text>
                <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
                  <Text style={{ color: W.fg, fontSize: 44, fontWeight: "900", letterSpacing: -1.5, lineHeight: 48 }}>
                    {mind?.streak ?? 0}
                  </Text>
                  <Text style={{ color: W.dim, fontSize: 13, fontWeight: "800" }}>DAY STREAK</Text>
                </View>
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <StatCell label="THIS WEEK" value={String(mind?.week_minutes ?? 0)} unit="MIN" color={W.fg} />
                <StatCell label="SESSIONS" value={String(mind?.total_sessions ?? 0)} color={W.fg} />
              </View>
              <Pressable onPress={() => setBreatheOn("1c")} style={styles.pillSolid} accessibilityRole="button" accessibilityLabel="Start a breathing session">
                <Text style={styles.pillSolidText}>BREATHE →</Text>
              </Pressable>
              <Text style={{ color: W.dim, fontSize: 8, fontWeight: "700", letterSpacing: 1.2 }}>HAPTIC-GUIDED · TWO PACES</Text>
            </View>
            {breatheOn === "1c" && (
              <BreatheOverlay onClose={() => setBreatheOn(null)} refreshStats={() => setStatsKey((k) => k + 1)} />
            )}
          </WatchFace>
          <Text style={[styles.caption, { color: theme.textSoft }]}>
            Tap BREATHE, pick box 4-4-4-4 or relax 4-7-8, and the circle guides the pace with a phase pulse. Sessions over 30 seconds count toward your real mindfulness streak.
          </Text>
        </View>
      </ScrollView>

      <View style={{ flexDirection: "row", justifyContent: "center", gap: 6, marginTop: 14 }}>
        {["1A", "1B", "1C"].map((p) => (
          <View key={p} style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1.5, borderColor: theme.cardBorder, backgroundColor: theme.card }}>
            <Text style={{ color: theme.textSoft, fontSize: 10, fontWeight: "800" }}>{p}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { alignItems: "center", gap: 14, paddingHorizontal: 16 },
  faceTitle: { fontSize: 13, fontWeight: "800", letterSpacing: 0.5 },
  caption: { fontSize: 12, fontWeight: "600", textAlign: "center", paddingHorizontal: 16 },
  pillSolid: {
    backgroundColor: W.teal,
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 16,
  },
  pillSolidText: { color: "#0B1018", fontSize: 12, fontWeight: "900", letterSpacing: 1.2 },
  pillOutline: {
    borderWidth: 2,
    borderColor: W.teal,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  pillOutlineText: { color: W.teal, fontSize: 12, fontWeight: "900", letterSpacing: 1.2 },
  moodPill: {
    flex: 1,
    borderWidth: 2,
    borderColor: W.rule,
    borderRadius: 999,
    paddingVertical: 7,
    alignItems: "center",
  },
  overlayLabel: { color: W.dim, fontSize: 10, fontWeight: "800", letterSpacing: 1.6 },
});
