import React, { useState, useRef, useEffect } from "react";
import { Animated, View, Text, Pressable } from "react-native";
import * as Haptics from "expo-haptics";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";
import { ShadowCard } from "../../components/ShadowCard";
import { ThemedIcon } from "../../theme/iconRegistry";
import { api } from "../../api/client";
import { getToken } from "../../lib/auth";
import { trackMindfulnessCompletion } from "../../lib/mindfulnessTracker";
import {
  GraceCountdown,
  StartCircleButton,
  MoodDeltaPicker,
  sharedStyles as styles,
} from "./shared";

// ─── Types ────────────────────────────────────────────────────────────────────

type MeditationMode = "guided" | "unguided" | null;
type MeditationAsset = { id: string; title: string; meta?: { emoji?: string } };

const DURATIONS = [5, 10, 15, 20, 30];

// ─── MeditationSection ────────────────────────────────────────────────────────

export function MeditationSection({ theme, ink, onBack }: { theme: any; ink: string; onBack: () => void }) {
  const [mode, setMode] = useState<MeditationMode>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [running, setRunning] = useState(false);
  const [meditationWaiting, setMeditationWaiting] = useState<number | null>(null);
  const [graceCount, setGraceCount] = useState<number | null>(null);
  const [gracePendingDuration, setGracePendingDuration] = useState<number | null>(null);
  const [moodBefore, setMoodBefore] = useState<number | null>(null);
  const [moodAfter, setMoodAfter] = useState<number | null>(null);
  const [endedEarlySecs, setEndedEarlySecs] = useState<number | null>(null);
  const [intervalBells, setIntervalBells] = useState(false);
  const [chimes, setChimes] = useState<MeditationAsset[]>([]);
  const [ambients, setAmbients] = useState<MeditationAsset[]>([]);
  const [ambientId, setAmbientId] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const graceRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const graceDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chimePlayerRef = useRef<AudioPlayer | null>(null);
  const ambientPlayerRef = useRef<AudioPlayer | null>(null);
  const bellTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tokenRef = useRef<string | null>(null);
  const loggedRef = useRef(false);

  const purpleSolid = (theme.purple as any)?.solid ?? ink;

  useEffect(() => {
    let cancelled = false;
    getToken().then((t) => { tokenRef.current = t; });
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    api.mediaList("audio", "chime")
      .then((rows: MeditationAsset[]) => { if (!cancelled) setChimes(rows); })
      .catch(() => {});
    api.mediaList("audio", "soundscape")
      .then((rows: MeditationAsset[]) => { if (!cancelled) setAmbients(rows); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  function authedSource(id: string) {
    return {
      uri: api.mediaFileUrl(id),
      headers: tokenRef.current ? { Authorization: `Bearer ${tokenRef.current}` } : undefined,
    };
  }

  function playChime() {
    if (chimes.length === 0) return;
    try {
      if (chimePlayerRef.current) {
        chimePlayerRef.current.seekTo(0);
        chimePlayerRef.current.play();
      } else {
        const p = createAudioPlayer(authedSource(chimes[0].id));
        p.volume = 1; p.play();
        chimePlayerRef.current = p;
      }
    } catch {}
  }

  function startAmbient() {
    if (!ambientId) return;
    if (ambientPlayerRef.current) {
      try { ambientPlayerRef.current.pause(); ambientPlayerRef.current.remove(); } catch {}
      ambientPlayerRef.current = null;
    }
    try {
      const p = createAudioPlayer(authedSource(ambientId));
      p.loop = true; p.volume = 0.55; p.play();
      ambientPlayerRef.current = p;
    } catch {}
  }

  function stopAudio() {
    if (bellTimerRef.current) { clearInterval(bellTimerRef.current); bellTimerRef.current = null; }
    if (ambientPlayerRef.current) {
      try { ambientPlayerRef.current.pause(); ambientPlayerRef.current.remove(); } catch {}
      ambientPlayerRef.current = null;
    }
  }

  function releaseChimePlayer() {
    if (chimePlayerRef.current) {
      try { chimePlayerRef.current.remove(); } catch {}
      chimePlayerRef.current = null;
    }
  }

  function stopTimer() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }

  function clearGraceInterval() {
    if (graceRef.current) { clearInterval(graceRef.current); graceRef.current = null; }
  }

  function clearGraceDelay() {
    if (graceDelayRef.current) { clearTimeout(graceDelayRef.current); graceDelayRef.current = null; }
  }

  function beginMeditation(mins: number) {
    stopTimer();
    setDuration(mins); setRemaining(mins * 60); setRunning(true); setEndedEarlySecs(null);
    loggedRef.current = false;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    activateKeepAwakeAsync("meditation").catch(() => {});
    playChime(); startAmbient();
    if (intervalBells && chimes.length > 0) {
      bellTimerRef.current = setInterval(() => playChime(), 5 * 60 * 1000);
    }
    timerRef.current = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          stopTimer(); setRunning(false); stopAudio();
          deactivateKeepAwake("meditation").catch(() => {});
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          playChime();
          return 0;
        }
        return r - 1;
      });
    }, 1000);
  }

  function startGrace(mins: number) {
    clearGraceInterval(); clearGraceDelay();
    setGracePendingDuration(mins); setGraceCount(null);
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
    if (graceCount === 0 && gracePendingDuration !== null) {
      const mins = gracePendingDuration;
      setGraceCount(null); setGracePendingDuration(null);
      beginMeditation(mins);
    }
  }, [graceCount, gracePendingDuration]);

  function stopSession() {
    stopTimer(); stopAudio();
    deactivateKeepAwake("meditation").catch(() => {});
    setRunning(false); setDuration(null); setRemaining(0); setEndedEarlySecs(null);
  }

  function logCompletion(withMood: boolean) {
    if (loggedRef.current || duration === null) return;
    loggedRef.current = true;
    trackMindfulnessCompletion("meditation", {
      duration_seconds: endedEarlySecs ?? duration * 60,
      ...(withMood && moodBefore != null ? { mood_before: moodBefore } : {}),
      ...(withMood && moodAfter != null ? { mood_after: moodAfter } : {}),
    });
  }

  function handleRestart() {
    if (duration === null) return;
    const savedDuration = duration;
    stopTimer(); stopAudio();
    deactivateKeepAwake("meditation").catch(() => {});
    setRunning(false); setDuration(null); setRemaining(0); setEndedEarlySecs(null);
    setMeditationWaiting(savedDuration);
  }

  function endSessionEarly() {
    if (duration === null) { stopSession(); return; }
    const elapsed = duration * 60 - remaining;
    stopTimer(); stopAudio();
    deactivateKeepAwake("meditation").catch(() => {});
    setRunning(false);
    if (elapsed < 60) {
      setDuration(null); setRemaining(0); setEndedEarlySecs(null);
      return;
    }
    setEndedEarlySecs(elapsed); setRemaining(0);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  function fullStop() {
    clearGraceDelay(); clearGraceInterval();
    setGraceCount(null); setGracePendingDuration(null); setMeditationWaiting(null);
    stopSession();
  }

  function handleDurationSelect(mins: number) { setMeditationWaiting(mins); }

  function handleMeditationStart() {
    if (!meditationWaiting) return;
    const mins = meditationWaiting;
    setMeditationWaiting(null);
    startGrace(mins);
  }

  function handleGoBack() {
    if (duration !== null && remaining === 0 && !running) logCompletion(true);
    fullStop(); releaseChimePlayer();
    setMode(null);
    onBack();
  }

  function handleBackFromDuration() {
    setMeditationWaiting(null);
    setMode(null);
  }

  useEffect(() => () => {
    stopTimer(); clearGraceDelay(); clearGraceInterval();
    stopAudio(); releaseChimePlayer();
    deactivateKeepAwake("meditation").catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const fmtTime = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  const done = duration !== null && remaining === 0 && !running;
  const inGrace = gracePendingDuration !== null;

  // ── Done view spring entrance ──────────────────────────────────────────────
  const doneAnim = useRef(new Animated.Value(0)).current;
  const prevDoneRef = useRef(false);
  useEffect(function () {
    if (done && !prevDoneRef.current) {
      doneAnim.setValue(0);
      Animated.spring(doneAnim, { toValue: 1, tension: 80, friction: 10, useNativeDriver: true }).start();
    }
    prevDoneRef.current = done;
  }, [done]);

  return (
    <>
      <Pressable
        onPress={handleGoBack}
        style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}
        accessibilityRole="button"
        accessibilityLabel="Back to practices"
      >
        <Text style={{ color: ink, fontSize: 18, fontWeight: "800" }}>←</Text>
        <Text style={{ color: ink, fontSize: 13, fontWeight: "700" }}>Practices</Text>
      </Pressable>
      <Text style={{ color: theme.textStrong, fontSize: 20, fontWeight: "900", marginBottom: 2 }}>Meditation</Text>

      {inGrace ? (
        <GraceCountdown count={graceCount} accentColor={purpleSolid} theme={theme} ink={ink} />
      ) : meditationWaiting !== null ? (
        <>
          <MoodDeltaPicker label="HOW DO YOU FEEL RIGHT NOW?" value={moodBefore} onSelect={setMoodBefore} accentColor={purpleSolid} theme={theme} />

          {chimes.length > 0 && (
            <Pressable
              onPress={() => { Haptics.selectionAsync(); setIntervalBells(!intervalBells); }}
              accessibilityRole="button"
              style={{
                flexDirection: "row", alignItems: "center", gap: 10,
                borderWidth: 2, borderRadius: 16, padding: 12,
                borderColor: intervalBells ? purpleSolid : (theme.cardBorder ?? ink),
                backgroundColor: intervalBells ? purpleSolid + "1E" : theme.card,
              }}
            >
              <ThemedIcon slot="ui.bell" size={20} />
              <Text style={{ color: theme.textStrong, fontSize: 13, fontWeight: "700", flex: 1 }}>Interval bell every 5 minutes</Text>
              <Text style={{ color: intervalBells ? purpleSolid : theme.textSoft, fontSize: 13, fontWeight: "900" }}>{intervalBells ? "ON" : "OFF"}</Text>
            </Pressable>
          )}

          {ambients.length > 0 && (
            <View style={{ gap: 8 }}>
              <Text style={{ color: theme.textSoft, fontSize: 11, fontWeight: "800", letterSpacing: 0.6 }}>🎧 AMBIENT SOUND</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                <Pressable
                  onPress={() => { Haptics.selectionAsync(); setAmbientId(null); }}
                  accessibilityRole="button"
                  style={{
                    paddingVertical: 8, paddingHorizontal: 14, borderRadius: 16, borderWidth: 2,
                    borderColor: ambientId === null ? purpleSolid : (theme.cardBorder ?? ink),
                    backgroundColor: ambientId === null ? purpleSolid + "1E" : theme.card,
                  }}
                >
                  <Text style={{ color: ambientId === null ? purpleSolid : theme.textSoft, fontSize: 12, fontWeight: "800" }}>Silence</Text>
                </Pressable>
                {ambients.map((a) => {
                  const sel = ambientId === a.id;
                  return (
                    <Pressable
                      key={a.id}
                      onPress={() => { Haptics.selectionAsync(); setAmbientId(a.id); }}
                      accessibilityRole="button"
                      style={{
                        paddingVertical: 8, paddingHorizontal: 14, borderRadius: 16, borderWidth: 2,
                        borderColor: sel ? purpleSolid : (theme.cardBorder ?? ink),
                        backgroundColor: sel ? purpleSolid + "1E" : theme.card,
                      }}
                    >
                      <Text style={{ color: sel ? purpleSolid : theme.textSoft, fontSize: 12, fontWeight: "800" }}>
                        {a.meta?.emoji ? a.meta.emoji + " " : ""}{a.title}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          <StartCircleButton onPress={handleMeditationStart} accentColor={purpleSolid} ink={ink} sublabel={`${meditationWaiting} min · ${mode === "guided" ? "Guided" : "Unguided"}`} />
          <Pressable onPress={handleBackFromDuration} style={{ alignItems: "center", paddingVertical: 4 }} accessibilityRole="button">
            <Text style={{ color: theme.textSoft, fontSize: 13 }}>← Choose a different duration</Text>
          </Pressable>
        </>
      ) : mode === null ? (
        <>
          <Text style={{ color: theme.textSoft, fontSize: 13, marginBottom: 10 }}>Choose a session type.</Text>
          <Pressable onPress={() => setMode("guided")} accessibilityRole="button">
            <ShadowCard size="card" bg={(theme.purple as any)?.tint} accent={(theme.purple as any)?.solid}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                <ThemedIcon slot="ui.music" size={32} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: (theme.purple as any)?.fg, fontSize: 16, fontWeight: "900" }}>Guided</Text>
                  <Text style={{ color: (theme.purple as any)?.sub, fontSize: 12, marginTop: 2 }}>Music & voice prompts</Text>
                </View>
                <Text style={{ color: (theme.purple as any)?.fg, fontSize: 20 }}>›</Text>
              </View>
            </ShadowCard>
          </Pressable>
          <Pressable onPress={() => setMode("unguided")} accessibilityRole="button">
            <ShadowCard size="card" bg={(theme.purple as any)?.tint} accent={(theme.purple as any)?.solid}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                <ThemedIcon slot="ui.mute" size={32} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: (theme.purple as any)?.fg, fontSize: 16, fontWeight: "900" }}>Unguided</Text>
                  <Text style={{ color: (theme.purple as any)?.sub, fontSize: 12, marginTop: 2 }}>Quiet timed session</Text>
                </View>
                <Text style={{ color: (theme.purple as any)?.fg, fontSize: 20 }}>›</Text>
              </View>
            </ShadowCard>
          </Pressable>
        </>
      ) : !running && !done ? (
        <>
          <Text style={{ color: theme.textSoft, fontSize: 13, marginBottom: 2 }}>
            {mode === "guided" ? "Guided session" : "Unguided session"} — choose a duration.
          </Text>
          <Pressable onPress={() => setMode(null)} style={{ paddingVertical: 4, marginBottom: 8 }} accessibilityRole="button">
            <Text style={{ color: theme.textSoft, fontSize: 13 }}>← Change session type</Text>
          </Pressable>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {DURATIONS.map((d) => (
              <Pressable
                key={d}
                onPress={() => handleDurationSelect(d)}
                style={{
                  borderWidth: 2, borderColor: ink, borderRadius: 22,
                  paddingVertical: 14, paddingHorizontal: 18,
                  backgroundColor: (theme.purple as any)?.tint,
                  shadowColor: "rgba(60,40,20,0.1)", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 2,
                }}
                accessibilityRole="button"
                accessibilityLabel={d + " minutes"}
              >
                <Text style={{ color: (theme.purple as any)?.fg, fontWeight: "900", fontSize: 18 }}>{d}</Text>
                <Text style={{ color: (theme.purple as any)?.sub, fontSize: 11 }}>min</Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : done ? (
        <Animated.View style={{
          alignItems: "center", gap: 16, paddingVertical: 24,
          opacity: doneAnim,
          transform: [{ scale: doneAnim.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }) }],
        }}>
          <ThemedIcon slot="ui.celebrate" size={48} />
          <Text style={{ color: theme.textStrong, fontSize: 20, fontWeight: "900" }}>Session complete</Text>
          <Text style={{ color: theme.textSoft, fontSize: 14 }}>{duration} min · {mode === "guided" ? "Guided" : "Unguided"}</Text>
          <MoodDeltaPicker label="HOW DO YOU FEEL NOW?" value={moodAfter} onSelect={setMoodAfter} accentColor={purpleSolid} theme={theme} />
          <Pressable
            onPress={() => { logCompletion(true); setDuration(null); setMode(null); setMoodBefore(null); setMoodAfter(null); }}
            style={[styles.endBtn, { borderColor: ink, backgroundColor: theme.card }]}
          >
            <Text style={{ color: ink, fontSize: 13, fontWeight: "800" }}>DONE</Text>
          </Pressable>
        </Animated.View>
      ) : (
        <View style={{ alignItems: "center", gap: 20, paddingVertical: 16 }}>
          <Text style={{ color: theme.textSoft, fontSize: 13 }}>{duration} min · {mode === "guided" ? "Guided" : "Unguided"}</Text>
          <View style={{
            width: 180, height: 180, borderRadius: 90,
            backgroundColor: purpleSolid,
            borderWidth: 3, borderColor: ink,
            shadowColor: "rgba(60,40,20,0.1)", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.12, shadowRadius: 14, elevation: 6,
            alignItems: "center", justifyContent: "center",
          }}>
            <Text style={{ color: "#fff", fontSize: 36, fontWeight: "900" }}>{fmtTime}</Text>
            <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 11, letterSpacing: 0.5, marginTop: 4 }}>REMAINING</Text>
          </View>
          <View style={{ flexDirection: "row", gap: 10, width: "100%" }}>
            <Pressable onPress={handleRestart} style={[styles.endBtn, { borderColor: ink, backgroundColor: theme.card, flex: 1 }]} accessibilityRole="button">
              <Text style={{ color: ink, fontSize: 13, fontWeight: "800", letterSpacing: 0.5 }}>↺ RESTART</Text>
            </Pressable>
            <Pressable onPress={endSessionEarly} style={[styles.endBtn, { borderColor: ink, backgroundColor: theme.card, flex: 1 }]} accessibilityRole="button">
              <Text style={{ color: ink, fontSize: 13, fontWeight: "800", letterSpacing: 0.5 }}>END SESSION</Text>
            </Pressable>
          </View>

          {(ambientId !== null || intervalBells) && (
            <View style={{ width: "100%", gap: 10 }}>
              {ambientId !== null && (
                <View style={{ flexDirection: "row", gap: 12, borderWidth: 2, borderColor: ink, borderRadius: 16, padding: 12, alignItems: "center", backgroundColor: theme.card }}>
                  <ThemedIcon slot="ui.headphones" size={22} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: ink, fontSize: 14, fontWeight: "800" }}>{ambients.find((a) => a.id === ambientId)?.title ?? "Ambient sound"}</Text>
                    <Text style={{ color: theme.textSoft, fontSize: 12 }}>Playing softly in the background</Text>
                  </View>
                </View>
              )}
              {intervalBells && (
                <View style={{ flexDirection: "row", gap: 12, borderWidth: 2, borderColor: ink, borderRadius: 16, padding: 12, alignItems: "center", backgroundColor: theme.card }}>
                  <ThemedIcon slot="ui.bell" size={22} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: ink, fontSize: 14, fontWeight: "800" }}>Interval bell</Text>
                    <Text style={{ color: theme.textSoft, fontSize: 12 }}>A gentle chime every 5 minutes</Text>
                  </View>
                </View>
              )}
            </View>
          )}
        </View>
      )}
    </>
  );
}
