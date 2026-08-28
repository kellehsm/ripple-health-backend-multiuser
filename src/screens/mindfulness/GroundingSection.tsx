import React, { useState, useRef, useEffect } from "react";
import { View, Text, Pressable } from "react-native";
import * as Haptics from "expo-haptics";
import { ShadowCard } from "../../components/ShadowCard";
import { trackMindfulnessCompletion } from "../../lib/mindfulnessTracker";
import {
  GraceCountdown,
  StartCircleButton,
  PmrBodyDiagram,
  sharedStyles as styles,
} from "./shared";

// ─── Constants ────────────────────────────────────────────────────────────────

type GroundTechnique = "54321" | "pmr" | "stop";

const PMR_STEPS = [
  "Feet & toes", "Calves", "Thighs", "Abdomen", "Hands & arms", "Shoulders", "Face & jaw",
];
const PMR_DURATION = 10;

const PMR_AREA_MAP: Record<string, { area: string; emoji: string }> = {
  "Feet & toes":  { area: "feet",      emoji: "🦶" },
  "Calves":       { area: "calves",    emoji: "🦵" },
  "Thighs":       { area: "thighs",    emoji: "🦵" },
  "Abdomen":      { area: "abdomen",   emoji: "🫁" },
  "Hands & arms": { area: "arms",      emoji: "🤲" },
  "Shoulders":    { area: "shoulders", emoji: "💪" },
  "Face & jaw":   { area: "face",      emoji: "😌" },
};

const GROUNDING_54321 = [
  { count: 5, sense: "SEE",   prompt: "Name 5 things you can see around you." },
  { count: 4, sense: "TOUCH", prompt: "Notice 4 things you can physically feel." },
  { count: 3, sense: "HEAR",  prompt: "Identify 3 sounds you can hear right now." },
  { count: 2, sense: "SMELL", prompt: "Notice 2 things you can smell." },
  { count: 1, sense: "TASTE", prompt: "Notice 1 thing you can taste." },
];

const STOP_STEPS = [
  { letter: "S", word: "Stop",    prompt: "Pause whatever you're doing — just stop for a moment." },
  { letter: "T", word: "Take",    prompt: "Take a slow, deep breath in … and out." },
  { letter: "O", word: "Observe", prompt: "Notice your thoughts, feelings, and body sensations without judgment." },
  { letter: "P", word: "Proceed", prompt: "Continue with a little more awareness of the present moment." },
];

// ─── GroundingSection ─────────────────────────────────────────────────────────

export function GroundingSection({ theme, ink, onBack }: { theme: any; ink: string; onBack: () => void }) {
  const [technique, setTechnique] = useState<GroundTechnique | null>(null);
  const [step, setStep] = useState(0);
  const [pmrPhase, setPmrPhase] = useState<"tense" | "release">("tense");
  const [countdown, setCountdown] = useState(PMR_DURATION);
  const [pmrGraceCount, setPmrGraceCount] = useState<number | null>(null);
  const [pmrGracePending, setPmrGracePending] = useState(false);
  const [pmrReadyToStart, setPmrReadyToStart] = useState(false);
  const [pmrGetReadyFor, setPmrGetReadyFor] = useState<string | null>(null);
  const [pmrGetReadyNextStep, setPmrGetReadyNextStep] = useState<number | null>(null);
  const [pmrGetReadyCountdown, setPmrGetReadyCountdown] = useState(3);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pmrGraceRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pmrGraceDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const getReadyTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const coralSolid = (theme.coral as any)?.solid ?? ink;

  function stopTimer() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }

  function clearGetReadyTimer() {
    if (getReadyTimerRef.current) { clearInterval(getReadyTimerRef.current); getReadyTimerRef.current = null; }
  }

  function clearPmrGraceInterval() {
    if (pmrGraceRef.current) { clearInterval(pmrGraceRef.current); pmrGraceRef.current = null; }
  }

  function clearPmrGraceDelay() {
    if (pmrGraceDelayRef.current) { clearTimeout(pmrGraceDelayRef.current); pmrGraceDelayRef.current = null; }
  }

  function startGetReady(nextStep: number) {
    clearGetReadyTimer();
    setPmrGetReadyFor(PMR_STEPS[nextStep]);
    setPmrGetReadyNextStep(nextStep);
    setPmrGetReadyCountdown(3);
    getReadyTimerRef.current = setInterval(() => {
      setPmrGetReadyCountdown((c) => {
        if (c <= 1) { clearGetReadyTimer(); return 0; }
        return c - 1;
      });
    }, 1000);
  }

  function startPmrStep(s: number, phase: "tense" | "release") {
    stopTimer();
    setStep(s); setPmrPhase(phase); setCountdown(PMR_DURATION);
    timerRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          stopTimer();
          if (phase === "tense") {
            startPmrStep(s, "release");
          } else if (s + 1 < PMR_STEPS.length) {
            startGetReady(s + 1);
          } else {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            trackMindfulnessCompletion("grounding");
            setTechnique(null);
          }
          return PMR_DURATION;
        }
        return c - 1;
      });
    }, 1000);
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (pmrGetReadyCountdown === 0 && pmrGetReadyNextStep !== null) {
      const next = pmrGetReadyNextStep;
      setPmrGetReadyFor(null); setPmrGetReadyNextStep(null);
      startPmrStep(next, "tense");
    }
  }, [pmrGetReadyCountdown, pmrGetReadyNextStep]);

  function startPmrGrace() {
    clearPmrGraceInterval(); clearPmrGraceDelay();
    setPmrGracePending(true); setPmrGraceCount(null);
    pmrGraceDelayRef.current = setTimeout(() => {
      pmrGraceDelayRef.current = null;
      setPmrGraceCount(3);
      pmrGraceRef.current = setInterval(() => {
        setPmrGraceCount((c) => {
          if (c === null || c <= 1) { clearPmrGraceInterval(); return 0; }
          return c - 1;
        });
      }, 1000);
    }, 2000);
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (pmrGraceCount === 0) { setPmrGraceCount(null); setPmrGracePending(false); startPmrStep(0, "tense"); }
  }, [pmrGraceCount]);

  function selectTechnique(t: GroundTechnique) {
    setTechnique(t); setStep(0); setPmrPhase("tense");
    if (t === "pmr") setPmrReadyToStart(true);
  }

  function handlePmrBegin() { setPmrReadyToStart(false); startPmrGrace(); }

  function handlePmrRestart() {
    stopTimer(); clearGetReadyTimer(); clearPmrGraceDelay();
    setPmrGetReadyFor(null); setPmrGetReadyNextStep(null);
    setStep(0); setPmrPhase("tense"); setCountdown(PMR_DURATION);
    setPmrReadyToStart(true);
  }

  function handleBack() {
    stopTimer(); clearGetReadyTimer(); clearPmrGraceDelay(); clearPmrGraceInterval();
    setPmrGraceCount(null); setPmrGracePending(false); setPmrReadyToStart(false);
    setPmrGetReadyFor(null); setPmrGetReadyNextStep(null);
    setTechnique(null);
    onBack();
  }

  useEffect(() => () => {
    stopTimer(); clearGetReadyTimer(); clearPmrGraceDelay(); clearPmrGraceInterval();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const inPmrGrace = pmrGracePending;
  const activeArea = step < PMR_STEPS.length ? (PMR_AREA_MAP[PMR_STEPS[step]]?.area ?? "") : "";

  return (
    <>
      <Pressable
        onPress={handleBack}
        style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}
        accessibilityRole="button"
        accessibilityLabel="Back to practices"
      >
        <Text style={{ color: ink, fontSize: 18, fontWeight: "800" }}>←</Text>
        <Text style={{ color: ink, fontSize: 13, fontWeight: "700" }}>Practices</Text>
      </Pressable>
      <Text style={{ color: theme.textStrong, fontSize: 20, fontWeight: "900", marginBottom: 2 }}>Grounding</Text>

      {technique === null ? (
        <>
          <Text style={{ color: theme.textSoft, fontSize: 13, marginBottom: 10 }}>Choose a technique.</Text>
          {([
            { key: "54321", label: "5-4-3-2-1 Sensory",            desc: "Engage all five senses sequentially" },
            { key: "pmr",   label: "Progressive Muscle Relaxation", desc: "Tense and release each muscle group" },
            { key: "stop",  label: "STOP Technique",                desc: "Stop · Take a breath · Observe · Proceed" },
          ] as const).map((t, idx) => (
            <Pressable key={t.key} onPress={() => selectTechnique(t.key)} accessibilityRole="button">
              <ShadowCard size="card" bg={(theme.coral as any)?.tint} accent={(theme.coral as any)?.solid} rotate={idx % 2 === 0 ? -0.4 : 0.4}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: (theme.coral as any)?.fg, fontSize: 15, fontWeight: "900" }}>{t.label}</Text>
                  <Text style={{ color: (theme.coral as any)?.sub, fontSize: 12, marginTop: 2 }}>{t.desc}</Text>
                </View>
                <Text style={{ color: (theme.coral as any)?.fg, fontSize: 20 }}>▶</Text>
              </ShadowCard>
            </Pressable>
          ))}
        </>
      ) : technique === "54321" ? (
        <View style={{ gap: 14 }}>
          {GROUNDING_54321.map((item, i) => {
            const done = i < step;
            const current = i === step;
            return (
              <View key={i} style={[styles.card, {
                borderColor: current ? ink : theme.cardBorder ?? ink,
                backgroundColor: current ? (theme.coral as any)?.tint : theme.card,
                opacity: done ? 0.4 : 1,
              }]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: current ? 8 : 0 }}>
                  <View style={{ width: 28, height: 28, borderRadius: 26, backgroundColor: current ? (theme.coral as any)?.solid : theme.cardBorder, alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ color: current ? "#fff" : theme.textSoft, fontWeight: "800", fontSize: 13 }}>{item.count}</Text>
                  </View>
                  <Text style={{ color: current ? (theme.coral as any)?.fg : theme.textSoft, fontWeight: "800", fontSize: 13, letterSpacing: 0.5 }}>{item.sense}</Text>
                  {done && <Text style={{ color: theme.textSoft, fontSize: 16 }}>✓</Text>}
                </View>
                {current && (
                  <>
                    <Text style={{ color: (theme.coral as any)?.fg, fontSize: 15, lineHeight: 21, marginBottom: 14 }}>{item.prompt}</Text>
                    <Pressable
                      onPress={() => { Haptics.selectionAsync(); if (step + 1 < GROUNDING_54321.length) { setStep(step + 1); } else { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); trackMindfulnessCompletion("grounding"); setTechnique(null); } }}
                      style={[styles.nextBtn, { backgroundColor: (theme.coral as any)?.solid, borderColor: ink }]}
                      accessibilityRole="button"
                    >
                      <Text style={{ color: "#fff", fontSize: 13, fontWeight: "800" }}>{step + 1 < GROUNDING_54321.length ? "NEXT →" : "DONE ✓"}</Text>
                    </Pressable>
                  </>
                )}
              </View>
            );
          })}
          {step > 0 && (
            <Pressable onPress={() => { Haptics.selectionAsync(); setStep(0); }} style={[styles.endBtn, { borderColor: ink, backgroundColor: theme.card }]} accessibilityRole="button">
              <Text style={{ color: ink, fontSize: 13, fontWeight: "800", letterSpacing: 0.5 }}>↺ RESTART</Text>
            </Pressable>
          )}
        </View>
      ) : technique === "pmr" ? (
        <View style={{ gap: 14 }}>
          {pmrReadyToStart ? (
            <View style={{ gap: 12 }}>
              <View style={[styles.card, { backgroundColor: (theme.coral as any)?.tint, borderColor: (theme.coral as any)?.solid }]}>
                <Text style={{ color: (theme.coral as any)?.fg, fontSize: 14, lineHeight: 22, textAlign: "center" }}>
                  {`${PMR_STEPS.length} muscle groups — ${PMR_DURATION}s tense, ${PMR_DURATION}s release each.`}
                </Text>
                <Text style={{ color: (theme.coral as any)?.sub, fontSize: 13, marginTop: 6, textAlign: "center" }}>
                  Find a comfortable position — lying down or seated.
                </Text>
              </View>
              <StartCircleButton onPress={handlePmrBegin} accentColor={coralSolid} ink={ink} sublabel="Tap to begin" />
            </View>
          ) : inPmrGrace ? (
            <GraceCountdown count={pmrGraceCount} accentColor={coralSolid} theme={theme} ink={ink} />
          ) : pmrGetReadyFor !== null ? (
            <View style={{ alignItems: "center", gap: 16, paddingVertical: 28 }}>
              <Text style={{ color: theme.textSoft, fontSize: 14, letterSpacing: 0.3 }}>Great work! Next up…</Text>
              <Text style={{ color: (theme.coral as any)?.fg, fontSize: 15, fontWeight: "700", textAlign: "center" }}>Get ready for</Text>
              <Text style={{ color: (theme.coral as any)?.fg, fontSize: 26, fontWeight: "900", textAlign: "center" }}>{pmrGetReadyFor}</Text>
              <View style={{
                width: 90, height: 90, borderRadius: 45, backgroundColor: theme.card,
                borderWidth: 2, borderColor: coralSolid, alignItems: "center", justifyContent: "center",
                shadowColor: "rgba(60,40,20,0.1)", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 3,
              }}>
                <Text style={{ color: coralSolid, fontSize: 40, fontWeight: "900" }}>{pmrGetReadyCountdown}</Text>
              </View>
            </View>
          ) : (
            <>
              <Text style={{ color: theme.textSoft, fontSize: 13 }}>
                {step < PMR_STEPS.length ? `Step ${step + 1} of ${PMR_STEPS.length}` : "Complete"}
              </Text>
              {step < PMR_STEPS.length && (
                <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder ?? ink }]}>
                  <PmrBodyDiagram activeArea={activeArea} accentColor={coralSolid} textSoftColor={theme.textSoft} />
                </View>
              )}
              {step < PMR_STEPS.length && (
                <View style={[styles.card, { backgroundColor: (theme.coral as any)?.tint, borderColor: ink }]}>
                  <Text style={{ color: (theme.coral as any)?.fg, fontSize: 19, fontWeight: "900", marginBottom: 6 }}>{PMR_STEPS[step]}</Text>
                  <Text style={{ color: (theme.coral as any)?.sub, fontSize: 15, marginBottom: 14 }}>
                    {pmrPhase === "tense" ? "Tense this area as hard as you can." : "Slowly release the tension. Notice the difference."}
                  </Text>
                  <View style={{ alignItems: "center" }}>
                    <Text style={{ color: (theme.coral as any)?.fg, fontSize: 42, fontWeight: "900" }}>{countdown}</Text>
                    <Text style={{ color: (theme.coral as any)?.sub, fontSize: 11, letterSpacing: 0.5 }}>{pmrPhase.toUpperCase()}</Text>
                  </View>
                </View>
              )}
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Pressable onPress={handlePmrRestart} style={[styles.endBtn, { borderColor: ink, backgroundColor: theme.card, flex: 1 }]} accessibilityRole="button">
                  <Text style={{ color: ink, fontSize: 13, fontWeight: "800" }}>↺ RESTART</Text>
                </Pressable>
                <Pressable onPress={() => { stopTimer(); clearGetReadyTimer(); setTechnique(null); }} style={[styles.endBtn, { borderColor: ink, backgroundColor: theme.card, flex: 1 }]} accessibilityRole="button">
                  <Text style={{ color: ink, fontSize: 13, fontWeight: "800" }}>STOP</Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      ) : (
        // STOP technique
        <View style={{ gap: 12 }}>
          {STOP_STEPS.map((s, i) => {
            const done = i < step;
            const current = i === step;
            return (
              <View key={i} style={[styles.card, {
                borderColor: current ? ink : theme.cardBorder ?? ink,
                backgroundColor: current ? (theme.coral as any)?.tint : theme.card,
                opacity: done ? 0.4 : 1,
              }]}>
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
                  <View style={{ width: 32, height: 32, borderRadius: 12, backgroundColor: current ? (theme.coral as any)?.solid : theme.cardBorder, alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Text style={{ color: current ? "#fff" : theme.textSoft, fontWeight: "900", fontSize: 15 }}>{s.letter}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: current ? (theme.coral as any)?.fg : theme.textSoft, fontWeight: "800", fontSize: 14, marginBottom: current ? 6 : 0 }}>{s.word}</Text>
                    {current && <Text style={{ color: (theme.coral as any)?.fg, fontSize: 14, lineHeight: 20 }}>{s.prompt}</Text>}
                  </View>
                  {done && <Text style={{ color: theme.textSoft, fontSize: 16 }}>✓</Text>}
                </View>
                {current && (
                  <Pressable
                    onPress={() => { Haptics.selectionAsync(); if (step + 1 < STOP_STEPS.length) { setStep(step + 1); } else { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); trackMindfulnessCompletion("grounding"); setTechnique(null); } }}
                    style={[styles.nextBtn, { backgroundColor: (theme.coral as any)?.solid, borderColor: ink, marginTop: 12 }]}
                  >
                    <Text style={{ color: "#fff", fontSize: 13, fontWeight: "800" }}>{step + 1 < STOP_STEPS.length ? "NEXT →" : "DONE ✓"}</Text>
                  </Pressable>
                )}
              </View>
            );
          })}
          {step > 0 && (
            <Pressable onPress={() => { Haptics.selectionAsync(); setStep(0); }} style={[styles.endBtn, { borderColor: ink, backgroundColor: theme.card }]} accessibilityRole="button">
              <Text style={{ color: ink, fontSize: 13, fontWeight: "800", letterSpacing: 0.5 }}>↺ RESTART</Text>
            </Pressable>
          )}
        </View>
      )}
    </>
  );
}
