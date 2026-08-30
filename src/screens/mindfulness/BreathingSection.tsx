import React, { useState, useRef, useEffect } from "react";
import { View, Text, Pressable, Animated } from "react-native";
import * as Haptics from "expo-haptics";
import { ShadowCard } from "../../components/ShadowCard";
import { ThemedIcon } from "../../theme/iconRegistry";
import { trackMindfulnessCompletion } from "../../lib/mindfulnessTracker";
import {
  GraceCountdown,
  StartCircleButton,
  MoodDeltaPicker,
  sharedStyles as styles,
} from "./shared";

// ─── Types ────────────────────────────────────────────────────────────────────

type BreathPattern = "box" | "478" | "sigh" | "heart";

// ─── Constants ────────────────────────────────────────────────────────────────

function phaseColorsFor(theme: any): string[] {
  return [theme.teal.solid, theme.purple.solid, theme.coral.solid, theme.purple.solid];
}

const BREATH_PATTERNS: Record<BreathPattern, { label: string; desc: string; detail: string; phases: [number, number, number, number] }> = {
  box:   {
    label: "Box Breathing",
    desc: "4 · 4 · 4 · 4",
    detail: "Used by Navy SEALs and surgeons to stay sharp under pressure. Equal counts in every direction train your nervous system to stay steady. Great before a stressful meeting, exam, or anytime you need to feel in control.",
    phases: [4, 4, 4, 4],
  },
  "478": {
    label: "4-7-8 Breathing",
    desc: "4 · 7 · 8 · 0",
    detail: "Developed by Dr. Andrew Weil as a natural tranquilizer for the nervous system. The long hold and slow exhale activate your body's rest response. Use it before bed, during anxiety, or when your mind won't stop racing.",
    phases: [4, 7, 8, 0],
  },
  sigh:  {
    label: "The Sigh",
    desc: "2 + 2 · 0 · 8 · 0",
    detail: "The fastest scientifically-proven way to offload stress — Stanford researchers found a physiological sigh lowers CO₂ faster than any other breath pattern. Two quick inhales through the nose, one long exhale through the mouth. Do it once and feel it immediately.",
    phases: [4, 0, 8, 0],
  },
  heart: {
    label: "Heart Rhythm",
    desc: "5 · 0 · 5 · 0",
    detail: "Breathing at exactly 5 seconds in, 5 seconds out synchronizes your heart rate and breath — a state called cardiac coherence. Used in clinical settings to reduce anxiety and improve heart rate variability over time. Best for longer, deeper sessions when you want to genuinely unwind.",
    phases: [5, 0, 5, 0],
  },
};

const PHASE_LABELS = ["INHALE", "HOLD", "EXHALE", "HOLD"];

const QUICK_RESET_SECONDS = 120;

// ─── Box Breathing Animation ──────────────────────────────────────────────────

function BoxBreathingAnimation({
  perimeterAnim,
  phase,
  phaseSecsLeft,
}: {
  perimeterAnim: Animated.Value;
  phase: number;
  phaseSecsLeft: number;
}) {
  const BOX = 190;
  const LINE_THICKNESS = 6;

  // We need theme here but can't call useTheme (it's a helper function using prop).
  // Pass phaseColors as prop instead.
  return null; // placeholder — see BoxBreathingAnimationInner
}

// ─── Box Breathing Animation (inner, receives theme) ─────────────────────────

function BoxBreathingAnimationInner({
  perimeterAnim,
  phase,
  phaseSecsLeft,
  phaseColors,
}: {
  perimeterAnim: Animated.Value;
  phase: number;
  phaseSecsLeft: number;
  phaseColors: string[];
}) {
  const BOX = 190;
  const LINE_THICKNESS = 6;

  const topWidth = perimeterAnim.interpolate({
    inputRange: [0, 1, 4],
    outputRange: [0, BOX, BOX],
    extrapolate: "clamp",
  });
  const rightHeight = perimeterAnim.interpolate({
    inputRange: [0, 1, 2, 4],
    outputRange: [0, 0, BOX, BOX],
    extrapolate: "clamp",
  });
  const bottomWidth = perimeterAnim.interpolate({
    inputRange: [0, 2, 3, 4],
    outputRange: [0, 0, BOX, BOX],
    extrapolate: "clamp",
  });
  const leftHeight = perimeterAnim.interpolate({
    inputRange: [0, 3, 4],
    outputRange: [0, 0, BOX],
    extrapolate: "clamp",
  });

  const phaseColor = phaseColors[phase] ?? phaseColors[0];
  const phaseLabel = PHASE_LABELS[phase] ?? "INHALE";

  return (
    <View style={{ alignItems: "center", gap: 16, paddingVertical: 8 }}>
      <Text style={{ fontSize: 38, fontWeight: "900", letterSpacing: 3, color: phaseColor }}>
        {phaseLabel}
      </Text>
      <View style={{ width: BOX, height: BOX, position: "relative" }}>
        <View style={{
          position: "absolute", top: 0, left: 0,
          width: BOX, height: BOX,
          borderWidth: 1, borderColor: "rgba(150,150,150,0.25)", borderRadius: 2,
        }} />
        <Animated.View style={{
          position: "absolute", top: 0, left: 0,
          height: LINE_THICKNESS, width: topWidth,
          backgroundColor: phaseColors[0], borderRadius: 3,
        }} />
        <Animated.View style={{
          position: "absolute", top: 0, right: 0,
          width: LINE_THICKNESS, height: rightHeight,
          backgroundColor: phaseColors[1], borderRadius: 3,
        }} />
        <Animated.View style={{
          position: "absolute", bottom: 0, right: 0,
          height: LINE_THICKNESS, width: bottomWidth,
          backgroundColor: phaseColors[2], borderRadius: 3,
        }} />
        <Animated.View style={{
          position: "absolute", bottom: 0, left: 0,
          width: LINE_THICKNESS, height: leftHeight,
          backgroundColor: phaseColors[3], borderRadius: 3,
        }} />
        <View style={{
          position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
          alignItems: "center", justifyContent: "center",
        }}>
          <Text style={{ fontSize: 56, fontWeight: "900", color: phaseColor, lineHeight: 64 }}>
            {phaseSecsLeft}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ─── Circle Breathing Animation ───────────────────────────────────────────────

function CircleBreathingAnimationInner({
  breathAnim,
  phase,
  phaseSecsLeft,
  pattern,
  phaseColors,
  cardBorder,
  textSoftColor,
}: {
  breathAnim: Animated.Value;
  phase: number;
  phaseSecsLeft: number;
  pattern: BreathPattern;
  phaseColors: string[];
  cardBorder: string;
  textSoftColor: string;
}) {
  const scaleInterp = breathAnim.interpolate({ inputRange: [0.5, 1], outputRange: [0.5, 1] });
  const phaseColor = phaseColors[phase] ?? phaseColors[0];
  const phases = BREATH_PATTERNS[pattern].phases;
  const phaseBarLabels = ["I", "H", "E", "H"];
  const activeBars = phases.map((secs, i) => ({ secs, label: phaseBarLabels[i] + (secs > 0 ? secs : ""), active: i === phase, hasPhase: secs > 0 }));

  return (
    <View style={{ alignItems: "center", gap: 16 }}>
      <View style={{ width: 200, height: 200, alignItems: "center", justifyContent: "center" }}>
        <Animated.View style={{ transform: [{ scale: scaleInterp }] }}>
          <View style={{
            width: 180, height: 180, borderRadius: 90,
            backgroundColor: phaseColor,
            borderWidth: 3, borderColor: cardBorder,
            shadowColor: "rgba(60,40,20,0.1)", shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.12, shadowRadius: 14, elevation: 6,
            alignItems: "center", justifyContent: "center",
          }}>
            <Text style={{ color: "#fff", fontSize: 48, fontWeight: "900", lineHeight: 56 }}>{phaseSecsLeft}</Text>
            <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 11, letterSpacing: 1.5, fontWeight: "700" }}>SECONDS</Text>
          </View>
        </Animated.View>
      </View>
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        {activeBars.filter(b => b.hasPhase).map((b, i) => (
          <View key={i} style={{ alignItems: "center", gap: 3 }}>
            <View style={{ height: 4, width: 32, borderRadius: 2, backgroundColor: b.active ? phaseColor : "rgba(150,150,150,0.3)" }} />
            <Text style={{ fontSize: 10, fontWeight: b.active ? "800" : "500", color: b.active ? phaseColor : textSoftColor, letterSpacing: 0.5 }}>{b.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── BreathingSection ─────────────────────────────────────────────────────────

export function BreathingSection({ theme, ink, onBack, quickReset }: { theme: any; ink: string; onBack: () => void; quickReset?: boolean }) {
  const [pattern, setPattern] = useState<BreathPattern | null>(null);
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState(0);
  const [cycles, setCycles] = useState(0);
  const [breathWaiting, setBreathWaiting] = useState<BreathPattern | null>(null);
  const [gracePending, setGracePending] = useState<BreathPattern | null>(null);
  const [graceCount, setGraceCount] = useState<number | null>(null);
  const [phaseSecsLeft, setPhaseSecsLeft] = useState(0);
  const [moodBefore, setMoodBefore] = useState<number | null>(null);
  const [moodAfter, setMoodAfter] = useState<number | null>(null);
  const [summary, setSummary] = useState<{ pattern: BreathPattern; cycles: number; seconds: number } | null>(null);

  const perimeterAnim = useRef(new Animated.Value(0)).current;
  const breathAnim = useRef(new Animated.Value(0.5)).current;
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const runningRef = useRef(false);
  const graceRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const graceDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phaseTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cyclesRef = useRef(0);
  const quickResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const quickResetCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [quickResetSecsLeft, setQuickResetSecsLeft] = useState(QUICK_RESET_SECONDS);
  const endSessionRef = useRef<(() => void) | undefined>(undefined);
  const runCycleRef = useRef<((key: BreathPattern) => void) | undefined>(undefined);

  const phaseColors = phaseColorsFor(theme);
  const tealSolid = (theme.teal as any)?.solid ?? ink;

  function clearTimers() {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }

  function clearGraceInterval() {
    if (graceRef.current) { clearInterval(graceRef.current); graceRef.current = null; }
  }

  function clearGraceDelay() {
    if (graceDelayRef.current) { clearTimeout(graceDelayRef.current); graceDelayRef.current = null; }
  }

  function clearPhaseTimer() {
    if (phaseTimerRef.current) { clearInterval(phaseTimerRef.current); phaseTimerRef.current = null; }
  }

  function startPhaseCountdown(secs: number) {
    clearPhaseTimer();
    setPhaseSecsLeft(Math.ceil(secs));
    if (secs <= 0) return;
    let remaining = Math.ceil(secs);
    phaseTimerRef.current = setInterval(() => {
      remaining -= 1;
      setPhaseSecsLeft(remaining > 0 ? remaining : 0);
      if (remaining <= 0) clearPhaseTimer();
    }, 1000);
  }

  useEffect(() => {
    runCycleRef.current = function runCycle(key: BreathPattern) {
      if (!runningRef.current) return;
      const phases = BREATH_PATTERNS[key].phases;
      const [inh, holdIn, exh, holdOut] = phases.map((s) => s * 1000);

      if (key === "box") {
        perimeterAnim.setValue(0);
        setPhase(0);
        startPhaseCountdown(phases[0]);

        Animated.sequence([
          Animated.timing(perimeterAnim, { toValue: 1, duration: inh, useNativeDriver: false }),
          Animated.timing(perimeterAnim, { toValue: 2, duration: holdIn, useNativeDriver: false }),
          Animated.timing(perimeterAnim, { toValue: 3, duration: exh, useNativeDriver: false }),
          Animated.timing(perimeterAnim, { toValue: 4, duration: holdOut, useNativeDriver: false }),
        ]).start(({ finished }) => {
          if (finished && runningRef.current) {
            cyclesRef.current += 1;
            setCycles(cyclesRef.current);
            Haptics.selectionAsync();
            runCycleRef.current?.(key);
          }
        });

        const t1 = inh > 0 ? setTimeout(() => { if (!runningRef.current) return; setPhase(1); startPhaseCountdown(phases[1]); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }, inh) : null;
        const t2 = holdIn > 0 ? setTimeout(() => { if (!runningRef.current) return; setPhase(2); startPhaseCountdown(phases[2]); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }, inh + holdIn) : null;
        const t3 = exh > 0 ? setTimeout(() => { if (!runningRef.current) return; setPhase(3); startPhaseCountdown(phases[3]); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }, inh + holdIn + exh) : null;
        timersRef.current = [t1, t2, t3].filter(Boolean) as ReturnType<typeof setTimeout>[];
      } else {
        setPhase(0);
        startPhaseCountdown(phases[0]);
        Animated.timing(breathAnim, { toValue: 1, duration: inh, useNativeDriver: true }).start();

        const t1 = holdIn > 0 ? setTimeout(() => { if (runningRef.current) { breathAnim.stopAnimation(); setPhase(1); startPhaseCountdown(phases[1]); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } }, inh) : null;
        const t2 = setTimeout(() => {
          if (!runningRef.current) return;
          setPhase(2); startPhaseCountdown(phases[2]); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          Animated.timing(breathAnim, { toValue: 0.5, duration: exh, useNativeDriver: true }).start();
        }, inh + holdIn);
        const t3 = holdOut > 0 ? setTimeout(() => { if (runningRef.current) { breathAnim.stopAnimation(); setPhase(3); startPhaseCountdown(phases[3]); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } }, inh + holdIn + exh) : null;
        const total = inh + holdIn + exh + holdOut;
        const t4 = setTimeout(() => {
          if (!runningRef.current) return;
          cyclesRef.current += 1; setCycles(cyclesRef.current); Haptics.selectionAsync();
          runCycleRef.current?.(key);
        }, total);
        timersRef.current = [t1, t2, t3, t4].filter(Boolean) as ReturnType<typeof setTimeout>[];
      }
    };
  });

  function clearQuickResetTimer() {
    if (quickResetTimerRef.current) { clearTimeout(quickResetTimerRef.current); quickResetTimerRef.current = null; }
    if (quickResetCountdownRef.current) { clearInterval(quickResetCountdownRef.current); quickResetCountdownRef.current = null; }
  }

  function beginSession(key: BreathPattern) {
    runningRef.current = false;
    clearTimers(); clearPhaseTimer(); clearQuickResetTimer();
    breathAnim.stopAnimation(); breathAnim.setValue(0.5);
    perimeterAnim.stopAnimation(); perimeterAnim.setValue(0);
    setPattern(key); setPhase(0); setCycles(0); cyclesRef.current = 0;
    setPhaseSecsLeft(Math.ceil(BREATH_PATTERNS[key].phases[0]));
    setRunning(true); runningRef.current = true;
    setTimeout(() => runCycleRef.current?.(key), 100);
    if (quickReset) {
      setQuickResetSecsLeft(QUICK_RESET_SECONDS);
      quickResetTimerRef.current = setTimeout(() => { quickResetTimerRef.current = null; endSessionRef.current?.(); }, QUICK_RESET_SECONDS * 1000);
      let remaining = QUICK_RESET_SECONDS;
      quickResetCountdownRef.current = setInterval(() => {
        remaining -= 1;
        setQuickResetSecsLeft(remaining > 0 ? remaining : 0);
        if (remaining <= 0) {
          if (quickResetCountdownRef.current) { clearInterval(quickResetCountdownRef.current); quickResetCountdownRef.current = null; }
        }
      }, 1000);
    }
  }

  function startGrace(key: BreathPattern) {
    clearGraceInterval(); clearGraceDelay();
    setGracePending(key); setGraceCount(null);
    graceDelayRef.current = setTimeout(() => {
      graceDelayRef.current = null;
      setGraceCount(3);
      graceRef.current = setInterval(() => {
        setGraceCount((c) => {
          if (c === null || c <= 1) { clearGraceInterval(); return 0; }
          return c - 1;
        });
      }, 1000);
    }, 2000);
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (graceCount === 0 && gracePending !== null) {
      const key = gracePending;
      setGraceCount(null); setGracePending(null);
      beginSession(key);
    }
  }, [graceCount, gracePending]);

  function stopBreathing() {
    runningRef.current = false;
    clearTimers(); clearPhaseTimer(); clearQuickResetTimer();
    breathAnim.stopAnimation(); breathAnim.setValue(0.5);
    perimeterAnim.stopAnimation(); perimeterAnim.setValue(0);
    setRunning(false); setPhase(0); setCycles(0); cyclesRef.current = 0; setPhaseSecsLeft(0);
  }

  function fullStop() {
    clearGraceDelay(); clearGraceInterval();
    setGraceCount(null); setGracePending(null); setBreathWaiting(null);
    stopBreathing();
  }

  function handlePatternSelect(key: BreathPattern) {
    fullStop();
    setBreathWaiting(key);
  }

  function handleBreathStart() {
    if (!breathWaiting) return;
    const key = breathWaiting;
    setBreathWaiting(null);
    startGrace(key);
  }

  function handleEndSession() {
    const doneCycles = cyclesRef.current;
    const key = pattern;
    if (doneCycles > 0 && key) {
      const cycleSecs = BREATH_PATTERNS[key].phases.reduce((a, b) => a + b, 0);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSummary({ pattern: key, cycles: doneCycles, seconds: Math.round(doneCycles * cycleSecs) });
    }
    fullStop();
  }
  endSessionRef.current = handleEndSession;

  function finalizeSummary() {
    if (summary) {
      trackMindfulnessCompletion("breathing", {
        duration_seconds: summary.seconds,
        ...(moodBefore != null ? { mood_before: moodBefore } : {}),
        ...(moodAfter != null ? { mood_after: moodAfter } : {}),
      });
    }
    setSummary(null); setMoodBefore(null); setMoodAfter(null);
  }

  function handleRestart() {
    const savedPattern = pattern;
    stopBreathing();
    if (savedPattern) startGrace(savedPattern);
  }

  useEffect(() => {
    if (quickReset) startGrace("box");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickReset]);

  useEffect(() => () => {
    runningRef.current = false;
    clearTimers(); clearPhaseTimer(); clearQuickResetTimer(); clearGraceDelay(); clearGraceInterval();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const inGrace = gracePending !== null;

  return (
    <>
      <Pressable
        onPress={() => { if (summary) finalizeSummary(); fullStop(); onBack(); }}
        style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}
        accessibilityRole="button"
        accessibilityLabel="Back to practices"
      >
        <Text style={{ color: ink, fontSize: 18, fontWeight: "800" }}>←</Text>
        <Text style={{ color: ink, fontSize: 13, fontWeight: "700" }}>Practices</Text>
      </Pressable>
      <Text style={{ color: theme.textStrong, fontSize: 20, fontWeight: "900", marginBottom: 2 }}>
        {quickReset ? "2-Minute Reset" : "Breathing"}
      </Text>

      {inGrace ? (
        <GraceCountdown count={graceCount} accentColor={tealSolid} theme={theme} ink={ink} />
      ) : summary ? (
        <View style={{ alignItems: "center", gap: 18, paddingVertical: 24 }}>
          <ThemedIcon slot="ui.breath" size={48} />
          <Text style={{ color: theme.textStrong, fontSize: 20, fontWeight: "900" }}>Session complete</Text>
          <Text style={{ color: theme.textSoft, fontSize: 14 }}>
            {BREATH_PATTERNS[summary.pattern].label} · {summary.cycles} cycle{summary.cycles === 1 ? "" : "s"} · {Math.max(1, Math.round(summary.seconds / 60))} min
          </Text>
          <MoodDeltaPicker label="HOW DO YOU FEEL NOW?" value={moodAfter} onSelect={setMoodAfter} accentColor={tealSolid} theme={theme} />
          <Pressable onPress={finalizeSummary} style={[styles.endBtn, { borderColor: ink, backgroundColor: theme.card }]} accessibilityRole="button">
            <Text style={{ color: ink, fontSize: 13, fontWeight: "800" }}>DONE</Text>
          </Pressable>
        </View>
      ) : breathWaiting ? (
        <>
          <Text style={{ color: theme.textStrong, fontSize: 15, fontWeight: "900", marginBottom: 2 }}>
            {BREATH_PATTERNS[breathWaiting].label}
            <Text style={{ color: theme.textSoft, fontWeight: "600", fontSize: 13 }}> · {BREATH_PATTERNS[breathWaiting].desc}</Text>
          </Text>
          <Text style={{ color: theme.textSoft, fontSize: 13, lineHeight: 19, marginBottom: 10 }}>
            {BREATH_PATTERNS[breathWaiting].detail}
          </Text>
          <MoodDeltaPicker label="HOW DO YOU FEEL RIGHT NOW?" value={moodBefore} onSelect={setMoodBefore} accentColor={tealSolid} theme={theme} />
          <StartCircleButton onPress={handleBreathStart} accentColor={tealSolid} ink={ink} sublabel="Tap to begin" />
          <Pressable onPress={() => setBreathWaiting(null)} style={{ alignItems: "center", paddingVertical: 4 }} accessibilityRole="button">
            <Text style={{ color: theme.textSoft, fontSize: 13 }}>← Choose a different pattern</Text>
          </Pressable>
        </>
      ) : !running ? (
        <>
          <Text style={{ color: theme.textSoft, fontSize: 13, marginBottom: 10 }}>Choose a pattern to begin.</Text>
          {(Object.keys(BREATH_PATTERNS) as BreathPattern[]).map((key, idx) => {
            const p = BREATH_PATTERNS[key];
            const rotation = idx % 2 === 0 ? -0.4 : 0.4;
            return (
              <Pressable key={key} onPress={() => handlePatternSelect(key)} accessibilityRole="button" accessibilityLabel={p.label}>
                <ShadowCard size="card" bg={theme.teal.tint} accent={theme.teal.solid}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <Text style={{ color: theme.teal.fg, fontSize: 16, fontWeight: "900" }}>{p.label}</Text>
                      <Text style={{ color: theme.teal.sub, fontSize: 12, fontWeight: "700" }}>{p.desc}</Text>
                    </View>
                    <Text style={{ color: theme.teal.sub, fontSize: 12, lineHeight: 18, marginTop: 2 }}>{p.detail}</Text>
                  </View>
                </ShadowCard>
              </Pressable>
            );
          })}
        </>
      ) : (
        <View style={{ alignItems: "center", gap: 20, paddingVertical: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Text style={{ color: theme.textSoft, fontSize: 13, letterSpacing: 0.5 }}>
              {pattern ? BREATH_PATTERNS[pattern].label : ""}
            </Text>
            {quickReset && (
              <View style={{
                flexDirection: "row", alignItems: "center", gap: 5,
                backgroundColor: tealSolid + "22", borderRadius: 12,
                paddingHorizontal: 10, paddingVertical: 3,
              }}>
                <Text style={{ color: tealSolid, fontSize: 13, fontWeight: "900", fontVariant: ["tabular-nums"] }}>
                  {String(Math.floor(quickResetSecsLeft / 60)).padStart(1, "0")}:{String(quickResetSecsLeft % 60).padStart(2, "0")}
                </Text>
              </View>
            )}
          </View>

          {pattern === "box" ? (
            <BoxBreathingAnimationInner perimeterAnim={perimeterAnim} phase={phase} phaseSecsLeft={phaseSecsLeft} phaseColors={phaseColors} />
          ) : pattern ? (
            <CircleBreathingAnimationInner breathAnim={breathAnim} phase={phase} phaseSecsLeft={phaseSecsLeft} pattern={pattern} phaseColors={phaseColors} cardBorder={theme.cardBorder} textSoftColor={theme.textSoft} />
          ) : null}

          <Text style={{ color: theme.textSoft, fontSize: 13 }}>
            Cycles completed: <Text style={{ color: theme.textStrong, fontWeight: "800" }}>{cycles}</Text>
          </Text>

          <View style={{ flexDirection: "row", gap: 10, width: "100%" }}>
            <Pressable onPress={handleRestart} style={[styles.endBtn, { borderColor: ink, backgroundColor: theme.card, flex: 1 }]} accessibilityRole="button">
              <Text style={{ color: ink, fontSize: 13, fontWeight: "800", letterSpacing: 0.5 }}>↺ RESTART</Text>
            </Pressable>
            <Pressable onPress={handleEndSession} style={[styles.endBtn, { borderColor: ink, backgroundColor: theme.card, flex: 1 }]} accessibilityRole="button">
              <Text style={{ color: ink, fontSize: 13, fontWeight: "800", letterSpacing: 0.5 }}>END SESSION</Text>
            </Pressable>
          </View>
        </View>
      )}
    </>
  );
}
