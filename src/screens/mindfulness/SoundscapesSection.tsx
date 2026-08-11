import React, { useEffect, useRef, useState } from "react";
import { View, Text, Pressable } from "react-native";
import * as Haptics from "expo-haptics";
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";
import { ShadowCard } from "../../components/ShadowCard";
import { api } from "../../api/client";
import { getToken } from "../../lib/auth";
import { trackMindfulnessCompletion } from "../../lib/mindfulnessTracker";
import { sharedStyles } from "./shared";

type MediaAsset = {
  id: string;
  title: string;
  kind: string;
  category: string | null;
  mime: string;
  meta: { emoji?: string; [k: string]: any };
};

const SLEEP_TIMERS = [5, 15, 30, 60];
const FADE_STEPS = 20;
const FADE_MS = 8000;

export function SoundscapesSection({ theme, ink, onBack }: { theme: any; ink: string; onBack: () => void }) {
  const [assets, setAssets] = useState<MediaAsset[] | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [sleepMins, setSleepMins] = useState<number | null>(null);
  const [sleepLeft, setSleepLeft] = useState<number | null>(null);

  const playerRef = useRef<AudioPlayer | null>(null);
  const tokenRef = useRef<string | null>(null);
  const sleepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fadeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const playedRef = useRef(false);

  const group = (theme.amber as any) ?? (theme.coral as any) ?? {};
  const accent = group.solid ?? ink;

  useEffect(() => {
    let cancelled = false;
    getToken().then((t) => { tokenRef.current = t; });
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    api.mediaList("audio", "soundscape")
      .then((rows: MediaAsset[]) => { if (!cancelled) setAssets(rows); })
      .catch(() => { if (!cancelled) setAssets([]); });
    return () => { cancelled = true; };
  }, []);

  function clearSleep() {
    if (sleepTimerRef.current) { clearInterval(sleepTimerRef.current); sleepTimerRef.current = null; }
    if (fadeTimerRef.current) { clearInterval(fadeTimerRef.current); fadeTimerRef.current = null; }
    setSleepLeft(null);
  }

  function stopPlayback() {
    clearSleep();
    setSleepMins(null);
    if (playerRef.current) {
      try { playerRef.current.pause(); playerRef.current.remove(); } catch {}
      playerRef.current = null;
    }
    setPlayingId(null);
  }

  function fadeOutAndStop() {
    const player = playerRef.current;
    if (!player) { stopPlayback(); return; }
    if (fadeTimerRef.current) return;
    let step = 0;
    const startVol = player.volume;
    fadeTimerRef.current = setInterval(() => {
      step += 1;
      try { player.volume = Math.max(0, startVol * (1 - step / FADE_STEPS)); } catch {}
      if (step >= FADE_STEPS) {
        stopPlayback();
      }
    }, FADE_MS / FADE_STEPS);
  }

  function armSleepTimer(mins: number) {
    clearSleep();
    let remaining = mins * 60;
    setSleepLeft(remaining);
    sleepTimerRef.current = setInterval(() => {
      remaining -= 1;
      setSleepLeft(remaining > 0 ? remaining : 0);
      if (remaining <= 0) {
        if (sleepTimerRef.current) { clearInterval(sleepTimerRef.current); sleepTimerRef.current = null; }
        fadeOutAndStop();
      }
    }, 1000);
  }

  function togglePlay(asset: MediaAsset) {
    Haptics.selectionAsync();
    if (playingId === asset.id) {
      stopPlayback();
      return;
    }
    stopPlayback();
    const source = {
      uri: api.mediaFileUrl(asset.id),
      headers: tokenRef.current ? { Authorization: `Bearer ${tokenRef.current}` } : undefined,
    };
    const player = createAudioPlayer(source);
    player.loop = true;
    player.volume = 1;
    player.play();
    playerRef.current = player;
    setPlayingId(asset.id);
    if (!playedRef.current) {
      playedRef.current = true;
      trackMindfulnessCompletion("sounds");
    }
    if (sleepMins) armSleepTimer(sleepMins);
  }

  function selectSleep(mins: number) {
    Haptics.selectionAsync();
    if (sleepMins === mins) {
      setSleepMins(null);
      clearSleep();
      return;
    }
    setSleepMins(mins);
    if (playingId) armSleepTimer(mins);
  }

  useEffect(() => () => { stopPlayback(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fmtSleep = sleepLeft !== null
    ? `${Math.floor(sleepLeft / 60)}:${String(sleepLeft % 60).padStart(2, "0")}`
    : null;

  return (
    <>
      <Pressable
        onPress={() => { stopPlayback(); onBack(); }}
        style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}
        accessibilityRole="button"
        accessibilityLabel="Back to practices"
      >
        <Text style={{ color: ink, fontSize: 18, fontWeight: "800" }}>←</Text>
        <Text style={{ color: ink, fontSize: 13, fontWeight: "700" }}>Practices</Text>
      </Pressable>
      <Text style={{ color: theme.textStrong, fontSize: 20, fontWeight: "900", marginBottom: 2 }}>Soundscapes</Text>

      {assets === null ? (
        <Text style={{ color: theme.textSoft, fontSize: 13 }}>Loading…</Text>
      ) : assets.length === 0 ? (
        <View style={{ alignItems: "center", gap: 12, paddingVertical: 40 }}>
          <Text style={{ fontSize: 44 }}>🎧</Text>
          <Text style={{ color: theme.textStrong, fontSize: 16, fontWeight: "800" }}>No soundscapes yet</Text>
          <Text style={{ color: theme.textSoft, fontSize: 13, textAlign: "center", lineHeight: 19, paddingHorizontal: 20 }}>
            Ambient sounds will appear here once they're added to the media library.
          </Text>
        </View>
      ) : (
        <>
          <Text style={{ color: theme.textSoft, fontSize: 13, marginBottom: 4 }}>
            Tap a sound to play. It loops until you stop it.
          </Text>

          {assets.map((a, idx) => {
            const active = playingId === a.id;
            return (
              <Pressable key={a.id} onPress={() => togglePlay(a)} accessibilityRole="button" accessibilityLabel={a.title + (active ? ", playing" : "")}>
                <ShadowCard
                  size="card"
                  bg={active ? accent : (group.tint ?? theme.card)}
                  accent={accent}
                  rotate={idx % 2 === 0 ? -0.4 : 0.4}
                  skipTransparency={active}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1 }}>
                    <Text style={{ fontSize: 26 }}>{a.meta?.emoji ?? "🎧"}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: active ? "#fff" : (group.fg ?? theme.textStrong), fontSize: 15, fontWeight: "900" }}>
                        {a.title}
                      </Text>
                      {active && (
                        <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 11, marginTop: 2 }}>
                          Playing{fmtSleep ? ` · sleep in ${fmtSleep}` : " · looping"}
                        </Text>
                      )}
                    </View>
                    <Text style={{ color: active ? "#fff" : (group.fg ?? theme.textStrong), fontSize: 20 }}>
                      {active ? "⏸" : "▶"}
                    </Text>
                  </View>
                </ShadowCard>
              </Pressable>
            );
          })}

          <View style={[sharedStyles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder ?? ink, marginTop: 4 }]}>
            <Text style={{ color: theme.textSoft, fontSize: 11, fontWeight: "800", letterSpacing: 0.6, marginBottom: 8 }}>
              😴 SLEEP TIMER — FADES OUT, THEN STOPS
            </Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {SLEEP_TIMERS.map((mins) => {
                const selected = sleepMins === mins;
                return (
                  <Pressable
                    key={mins}
                    onPress={() => selectSleep(mins)}
                    accessibilityRole="button"
                    style={{
                      flex: 1, alignItems: "center", paddingVertical: 10,
                      borderRadius: 14, borderWidth: 2,
                      borderColor: selected ? accent : (theme.cardBorder ?? ink),
                      backgroundColor: selected ? accent + "26" : "transparent",
                    }}
                  >
                    <Text style={{ color: selected ? accent : theme.textSoft, fontWeight: "900", fontSize: 14 }}>{mins}</Text>
                    <Text style={{ color: selected ? accent : theme.textSoft, fontSize: 10 }}>min</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </>
      )}
    </>
  );
}
