import React, { useEffect, useRef, useState } from "react";
import { View, Text, Pressable } from "react-native";
import * as Haptics from "expo-haptics";
import { ShadowCard } from "../../components/ShadowCard";
import { trackMindfulnessCompletion } from "../../lib/mindfulnessTracker";
import {
  BODY_DIAGRAM_ORDER,
  PmrBodyDiagram,
  GraceCountdown,
  StartCircleButton,
  MoodDeltaPicker,
  sharedStyles,
} from "./shared";

const SCAN_PROMPTS: Record<string, string> = {
  face:      "Soften your forehead, eyes, and jaw. Notice any tension melting away.",
  shoulders: "Let your shoulders drop away from your ears. Feel their weight.",
  arms:      "Follow the sensation down your arms to your fingertips.",
  abdomen:   "Notice your belly rising and falling with each breath.",
  thighs:    "Feel the weight of your legs resting. Let them be heavy.",
  calves:    "Bring gentle attention to your calves. Just observe.",
  feet:      "Notice your feet — warmth, pressure, tingling. Let them relax fully.",
};

const SCAN_DURATIONS = [5, 10];

export function BodyScanSection({ theme, ink, onBack }: { theme: any; ink: string; onBack: () => void }) {
  const [duration, setDuration] = useState<number | null>(null);
  const [waiting, setWaiting] = useState<number | null>(null);
  const [graceCount, setGraceCount] = useState<number | null>(null);
  const [gracePending, setGracePending] = useState<number | null>(null);
  const [stepIdx, setStepIdx] = useState(0);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [secsLeft, setSecsLeft] = useState(0);
  const [moodBefore, setMoodBefore] = useState<number | null>(null);
  const [moodAfter, setMoodAfter] = useState<number | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const graceRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const graceDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const group = (theme.blue as any) ?? (theme.purple as any) ?? {};
  const sleepSolid = group.solid ?? ink;

  function stopTimer() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }
  function clearGrace() {
    if (graceRef.current) { clearInterval(graceRef.current); graceRef.current = null; }
    if (graceDelayRef.current) { clearTimeout(graceDelayRef.current); graceDelayRef.current = null; }
  }

  function begin(mins: number) {
    stopTimer();
    const perStep = Math.round((mins * 60) / BODY_DIAGRAM_ORDER.length);
    setDuration(mins);
    setStepIdx(0);
    setSecsLeft(perStep);
    setRunning(true);
    setDone(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    timerRef.current = setInterval(() => {
      setSecsLeft((s) => {
        if (s <= 1) {
          setStepIdx((idx) => {
            if (idx + 1 < BODY_DIAGRAM_ORDER.length) {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              return idx + 1;
            }
            stopTimer();
            setRunning(false);
            setDone(true);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            return idx;
          });
          return perStep;
        }
        return s - 1;
      });
    }, 1000);
  }

  function startGrace(mins: number) {
    clearGrace();
    setGracePending(mins);
    setGraceCount(null);
    graceDelayRef.current = setTimeout(() => {
      graceDelayRef.current = null;
      setGraceCount(3);
      graceRef.current = setInterval(() => {
        setGraceCount((c) => {
          if (c === null || c <= 1) {
            if (graceRef.current) { clearInterval(graceRef.current); graceRef.current = null; }
            return 0;
          }
          return c - 1;
        });
      }, 1000);
    }, 2000);
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (graceCount === 0 && gracePending !== null) {
      const mins = gracePending;
      setGraceCount(null);
      setGracePending(null);
      begin(mins);
    }
  }, [graceCount, gracePending]);

  function finish() {
    if (duration !== null) {
      trackMindfulnessCompletion("body_scan", {
        duration_seconds: duration * 60,
        ...(moodBefore != null ? { mood_before: moodBefore } : {}),
        ...(moodAfter != null ? { mood_after: moodAfter } : {}),
      });
    }
    setDone(false);
    setDuration(null);
    setMoodBefore(null);
    setMoodAfter(null);
  }

  function fullStop() {
    stopTimer();
    clearGrace();
    setGraceCount(null);
    setGracePending(null);
    setWaiting(null);
    setRunning(false);
    setDone(false);
    setDuration(null);
  }

  useEffect(() => () => { stopTimer(); clearGrace(); }, []);

  const activeArea = BODY_DIAGRAM_ORDER[stepIdx]?.area ?? "";
  const inGrace = gracePending !== null;

  return (
    <>
      <Pressable
        onPress={() => { fullStop(); onBack(); }}
        style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}
        accessibilityRole="button"
        accessibilityLabel="Back to practices"
      >
        <Text style={{ color: ink, fontSize: 18, fontWeight: "800" }}>←</Text>
        <Text style={{ color: ink, fontSize: 13, fontWeight: "700" }}>Practices</Text>
      </Pressable>
      <Text style={{ color: theme.textStrong, fontSize: 20, fontWeight: "900", marginBottom: 2 }}>Body Scan</Text>

      {inGrace ? (
        <GraceCountdown count={graceCount} accentColor={sleepSolid} theme={theme} ink={ink} />
      ) : waiting !== null ? (
        <>
          <MoodDeltaPicker
            label="HOW DO YOU FEEL RIGHT NOW?"
            value={moodBefore}
            onSelect={setMoodBefore}
            accentColor={sleepSolid}
            theme={theme}
          />
          <StartCircleButton
            onPress={() => { const mins = waiting; setWaiting(null); startGrace(mins); }}
            accentColor={sleepSolid}
            ink={ink}
            sublabel={`${waiting} min body scan`}
          />
          <Pressable onPress={() => setWaiting(null)} style={{ alignItems: "center", paddingVertical: 4 }} accessibilityRole="button">
            <Text style={{ color: theme.textSoft, fontSize: 13 }}>← Choose a different duration</Text>
          </Pressable>
        </>
      ) : done ? (
        <View style={{ alignItems: "center", gap: 18, paddingVertical: 24 }}>
          <Text style={{ fontSize: 48 }}>🌙</Text>
          <Text style={{ color: theme.textStrong, fontSize: 20, fontWeight: "900" }}>Scan complete</Text>
          <Text style={{ color: theme.textSoft, fontSize: 14 }}>{duration} min · head to toe</Text>
          <MoodDeltaPicker
            label="HOW DO YOU FEEL NOW?"
            value={moodAfter}
            onSelect={setMoodAfter}
            accentColor={sleepSolid}
            theme={theme}
          />
          <Pressable onPress={finish} style={[sharedStyles.endBtn, { borderColor: ink, backgroundColor: theme.card }]} accessibilityRole="button">
            <Text style={{ color: ink, fontSize: 13, fontWeight: "800" }}>DONE</Text>
          </Pressable>
        </View>
      ) : !running ? (
        <>
          <Text style={{ color: theme.textSoft, fontSize: 13, marginBottom: 10 }}>
            A guided journey of attention from head to toe. Choose a length.
          </Text>
          {SCAN_DURATIONS.map((mins, idx) => (
            <Pressable key={mins} onPress={() => { Haptics.selectionAsync(); setWaiting(mins); }} accessibilityRole="button">
              <ShadowCard size="card" bg={group.tint ?? theme.card} accent={sleepSolid} rotate={idx % 2 === 0 ? -0.4 : 0.4}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: group.fg ?? theme.textStrong, fontSize: 16, fontWeight: "900" }}>{mins} minutes</Text>
                  <Text style={{ color: group.sub ?? theme.textSoft, fontSize: 12, marginTop: 2 }}>
                    ~{Math.round((mins * 60) / BODY_DIAGRAM_ORDER.length)}s per body area
                  </Text>
                </View>
                <Text style={{ color: group.fg ?? theme.textStrong, fontSize: 20 }}>›</Text>
              </ShadowCard>
            </Pressable>
          ))}
        </>
      ) : (
        <View style={{ gap: 14 }}>
          <Text style={{ color: theme.textSoft, fontSize: 13 }}>
            Area {stepIdx + 1} of {BODY_DIAGRAM_ORDER.length}
          </Text>
          <View style={[sharedStyles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder ?? ink }]}>
            <PmrBodyDiagram activeArea={activeArea} accentColor={sleepSolid} />
          </View>
          <View style={[sharedStyles.card, { backgroundColor: group.tint ?? theme.card, borderColor: ink }]}>
            <Text style={{ color: group.fg ?? theme.textStrong, fontSize: 18, fontWeight: "900", marginBottom: 6 }}>
              {BODY_DIAGRAM_ORDER[stepIdx].label}
            </Text>
            <Text style={{ color: group.sub ?? theme.textSoft, fontSize: 14, lineHeight: 21, marginBottom: 12 }}>
              {SCAN_PROMPTS[activeArea]}
            </Text>
            <View style={{ alignItems: "center" }}>
              <Text style={{ color: group.fg ?? theme.textStrong, fontSize: 40, fontWeight: "900" }}>{secsLeft}</Text>
            </View>
          </View>
          <Pressable
            onPress={fullStop}
            style={[sharedStyles.endBtn, { borderColor: ink, backgroundColor: theme.card }]}
            accessibilityRole="button"
          >
            <Text style={{ color: ink, fontSize: 13, fontWeight: "800", letterSpacing: 0.5 }}>END SESSION</Text>
          </Pressable>
        </View>
      )}
    </>
  );
}
