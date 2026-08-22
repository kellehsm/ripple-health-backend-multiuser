import React, { useState, useRef, useEffect, useCallback } from "react";
import { FeatureIntroSheet } from "../components/FeatureIntroSheet";
import { useFeatureIntro } from "../onboarding/useFeatureIntro";
import { findIntro } from "../onboarding/featureIntros";
import {
  RefreshControl,
  ScrollView,
  View,
  Text,
  Pressable,
  TextInput,
  StyleSheet,
  Animated
} from "react-native";
import { EmptyState } from "../components/EmptyState";
import { LinearGradient } from "expo-linear-gradient";
import { ScreenBackground } from "../components/ScreenBackground";
import { LoadingIndicator } from "../components/LoadingIndicator";
import { ShadowCard } from "../components/ShadowCard";
import { RippleLoader } from "../components/RippleLoader";
import * as Haptics from "expo-haptics";
import { useFocusEffect } from "@react-navigation/native";
import { useTheme } from "../theme/ThemeContext";
import { ThemedIcon } from "../theme/iconRegistry";
import { api } from "../api/client";
import { toast } from "../lib/toast";
import { trackMindfulnessCompletion, getTodayCompletedSections } from "../lib/mindfulnessTracker";
import { TooltipBubble } from "../components/TooltipBubble";
import { hasSeenTooltip, markTooltipSeen } from "../utils/tooltipSeen";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";
import { getToken } from "../lib/auth";
import {
  GraceCountdown,
  StartCircleButton,
  PmrBodyDiagram,
  MoodDeltaPicker,
  sharedStyles,
} from "./mindfulness/shared";
import { StatsHero } from "./mindfulness/StatsHero";
import { QuoteCard } from "./mindfulness/QuoteCard";
import { BodyScanSection } from "./mindfulness/BodyScanSection";
import { SoundscapesSection } from "./mindfulness/SoundscapesSection";
import { GratitudeHistory } from "./mindfulness/GratitudeHistory";

// ─── Types ────────────────────────────────────────────────────────────────────

type Section = "breathing" | "grounding" | "meditation" | "gratitude" | "body_scan" | "sounds";
type BreathPattern = "box" | "478" | "equal" | "coherent";
type GroundTechnique = "54321" | "pmr" | "stop";
type MeditationMode = "guided" | "unguided" | null;

// ─── Constants ────────────────────────────────────────────────────────────────

// Phase order: inhale, hold, exhale, hold — themed so palette switching works
function phaseColorsFor(theme: any): string[] {
  return [theme.teal.solid, theme.purple.solid, theme.coral.solid, theme.purple.solid];
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const BREATH_PATTERNS: Record<BreathPattern, { label: string; desc: string; phases: [number, number, number, number] }> = {
  box:      { label: "Box Breathing",      desc: "4 · 4 · 4 · 4",   phases: [4, 4, 4, 4] },
  "478":    { label: "4-7-8",              desc: "4 · 7 · 8 · 0",   phases: [4, 7, 8, 0] },
  equal:    { label: "Equal Breathing",    desc: "5 · 0 · 5 · 0",   phases: [5, 0, 5, 0] },
  coherent: { label: "Coherent Breathing", desc: "5.5 in · 5.5 out", phases: [5.5, 0, 5.5, 0] },
};

const PHASE_LABELS = ["INHALE", "HOLD", "EXHALE", "HOLD"];

const PMR_STEPS = [
  "Feet & toes",
  "Calves",
  "Thighs",
  "Abdomen",
  "Hands & arms",
  "Shoulders",
  "Face & jaw",
];
const PMR_DURATION = 10;

// PMR step → body area mapping
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

const GRATITUDE_PROMPTS = [
  "What's one thing that went well today, however small?",
  "Who made you smile or feel supported recently?",
  "What's something your body did well today?",
  "Name a simple pleasure you experienced this week.",
  "What's one thing in your environment you're grateful for?",
  "Who is someone you're glad to have in your life, and why?",
  "What challenge taught you something valuable recently?",
  "What made you feel calm or at ease today?",
  "What is something you often take for granted but are grateful for?",
  "What's a recent moment of kindness you witnessed or experienced?",
  "What skill or ability are you grateful to have?",
];

const DURATIONS = [5, 10, 15, 20, 30];

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
  const { theme } = useTheme();
  const phaseColors = phaseColorsFor(theme);
  const BOX = 190;
  const LINE_THICKNESS = 6;

  // Interpolate each side from the single 0→4 perimeter value
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
      {/* Phase label above box */}
      <Text style={{
        fontSize: 38,
        fontWeight: "900",
        letterSpacing: 3,
        color: phaseColor,
      }}>
        {phaseLabel}
      </Text>

      {/* The box */}
      <View style={{ width: BOX, height: BOX, position: "relative" }}>
        {/* Faint gray border box */}
        <View style={{
          position: "absolute",
          top: 0, left: 0,
          width: BOX, height: BOX,
          borderWidth: 1,
          borderColor: "rgba(150,150,150,0.25)",
          borderRadius: 2,
        }} />

        {/* Top side — INHALE (teal), draws LEFT→RIGHT */}
        <Animated.View style={{
          position: "absolute",
          top: 0,
          left: 0,
          height: LINE_THICKNESS,
          width: topWidth,
          backgroundColor: phaseColors[0],
          borderRadius: 3,
        }} />

        {/* Right side — HOLD1 (purple), draws TOP→DOWN */}
        <Animated.View style={{
          position: "absolute",
          top: 0,
          right: 0,
          width: LINE_THICKNESS,
          height: rightHeight,
          backgroundColor: phaseColors[1],
          borderRadius: 3,
        }} />

        {/* Bottom side — EXHALE (coral), draws RIGHT→LEFT (mirror via right anchor) */}
        <Animated.View style={{
          position: "absolute",
          bottom: 0,
          right: 0,
          height: LINE_THICKNESS,
          width: bottomWidth,
          backgroundColor: phaseColors[2],
          borderRadius: 3,
        }} />

        {/* Left side — HOLD2 (purple), draws BOTTOM→UP (mirror via bottom anchor) */}
        <Animated.View style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          width: LINE_THICKNESS,
          height: leftHeight,
          backgroundColor: phaseColors[3],
          borderRadius: 3,
        }} />

        {/* Centered countdown timer */}
        <View style={{
          position: "absolute",
          top: 0, left: 0, right: 0, bottom: 0,
          alignItems: "center",
          justifyContent: "center",
        }}>
          <Text style={{
            fontSize: 56,
            fontWeight: "900",
            color: phaseColor,
            lineHeight: 64,
          }}>
            {phaseSecsLeft}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ─── Circle Breathing Animation (for 4-7-8 and Equal) ────────────────────────

function CircleBreathingAnimation({
  breathAnim,
  phase,
  phaseSecsLeft,
  pattern,
}: {
  breathAnim: Animated.Value;
  phase: number;
  phaseSecsLeft: number;
  pattern: BreathPattern;
}) {
  const { theme } = useTheme();
  const phaseColors = phaseColorsFor(theme);
  const scaleInterp = breathAnim.interpolate({ inputRange: [0.5, 1], outputRange: [0.5, 1] });
  const phaseColor = phaseColors[phase] ?? phaseColors[0];
  const phases = BREATH_PATTERNS[pattern].phases;

  // Mini phase indicator bars
  const phaseBarLabels = ["I", "H", "E", "H"];
  const activeBars = phases.map((secs, i) => ({ secs, label: phaseBarLabels[i] + (secs > 0 ? secs : ""), active: i === phase, hasPhase: secs > 0 }));

  return (
    <View style={{ alignItems: "center", gap: 16 }}>
      <View style={{ width: 200, height: 200, alignItems: "center", justifyContent: "center" }}>
        <Animated.View style={{ transform: [{ scale: scaleInterp }] }}>
          <View style={{
            width: 180, height: 180, borderRadius: 90,
            backgroundColor: phaseColor,
            borderWidth: 3, borderColor: "rgba(0,0,0,0.15)",
            shadowColor: "rgba(60,40,20,0.1)", shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.12, shadowRadius: 14, elevation: 6,
            alignItems: "center", justifyContent: "center",
          }}>
            <Text style={{ color: "#fff", fontSize: 48, fontWeight: "900", lineHeight: 56 }}>
              {phaseSecsLeft}
            </Text>
            <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 11, letterSpacing: 1.5, fontWeight: "700" }}>
              SECONDS
            </Text>
          </View>
        </Animated.View>
      </View>

      {/* Mini phase indicator row */}
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        {activeBars.filter(b => b.hasPhase).map((b, i) => (
          <View key={i} style={{ alignItems: "center", gap: 3 }}>
            <View style={{
              height: 4,
              width: 32,
              borderRadius: 2,
              backgroundColor: b.active ? phaseColor : "rgba(150,150,150,0.3)",
            }} />
            <Text style={{
              fontSize: 10,
              fontWeight: b.active ? "800" : "500",
              color: b.active ? phaseColor : "#aaa",
              letterSpacing: 0.5,
            }}>
              {b.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MindfulnessScreen() {
  const { theme } = useTheme();
  const mindfulnessIntro = findIntro("mindfulness")!;
  const [introVisible, dismissIntro] = useFeatureIntro(mindfulnessIntro.key);
  const ink = theme.ink;

  const [activeSection, setActiveSection] = useState<Section | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const [sectionLoading, setSectionLoading] = useState(false);
  const [todayDone, setTodayDone] = useState<string[]>([]);
  const [quickReset, setQuickReset] = useState(false);
  const [hubVisit, setHubVisit] = useState(0);
  const [totalSessions, setTotalSessions] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const contentFade = useRef(new Animated.Value(1)).current;
  const fadeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (fadeTimeoutRef.current) {
      clearTimeout(fadeTimeoutRef.current);
      fadeTimeoutRef.current = null;
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      api.mindfulnessStats()
        .then((s: any) => { if (!cancelled) setTotalSessions(s?.total_sessions ?? 0); })
        .catch(() => { if (!cancelled) setTotalSessions(0); });
      hasSeenTooltip("mindfulness").then(seen => {
        if (!cancelled && !seen) {
          setShowTooltip(true);
          markTooltipSeen("mindfulness");
        }
      });
      getTodayCompletedSections().then((done) => { if (!cancelled) setTodayDone(done); });
      return () => { cancelled = true; };
    }, [])
  );

  function fadeTransition(onChange: () => void) {
    Animated.timing(contentFade, { toValue: 0, duration: 140, useNativeDriver: true }).start(() => {
      setSectionLoading(true);
      if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current);
      fadeTimeoutRef.current = setTimeout(() => {
        fadeTimeoutRef.current = null;
        onChange();
        setSectionLoading(false);
        Animated.timing(contentFade, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      }, 200);
    });
  }

  function navigateTo(section: Section) {
    Haptics.selectionAsync();
    setQuickReset(false);
    fadeTransition(() => setActiveSection(section));
  }

  function startQuickReset() {
    Haptics.selectionAsync();
    setQuickReset(true);
    fadeTransition(() => setActiveSection("breathing"));
  }

  function goBack() {
    setQuickReset(false);
    fadeTransition(() => {
      setActiveSection(null);
      setHubVisit((v) => v + 1);
      getTodayCompletedSections().then(setTodayDone);
    });
  }

  return (
    <LinearGradient colors={[theme.page, theme.gradientEnd]} style={{ flex: 1 }}>
    <ScreenBackground pageId="mindfulness" />
    <ScrollView
      style={{ backgroundColor: "transparent" }}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {
        setRefreshing(true);
        Promise.all([
          api.mindfulnessStats().then((s: any) => setTotalSessions(s?.total_sessions ?? 0)).catch(() => {}),
          getTodayCompletedSections().then(setTodayDone).catch(() => {}),
        ]).finally(() => setRefreshing(false));
      }} tintColor={theme.teal.solid} colors={[theme.teal.solid]} />}
    >
      {sectionLoading ? (
        <View style={{ alignItems: "center", paddingVertical: 80 }}>
          <RippleLoader size="large" />
        </View>
      ) : (
        <Animated.View style={{ opacity: contentFade, gap: 14 }}>
          {showTooltip && activeSection === null && (
            <TooltipBubble
              message="Your mindfulness hub — breathing exercises, grounding techniques, guided meditation, and gratitude prompts. Each section guides you step by step."
              onDismiss={() => setShowTooltip(false)}
            />
          )}
          {activeSection === null && (
            <>
              <View style={{ alignItems: "center", paddingTop: 4, paddingBottom: 2 }}>
                <ThemedIcon slot="screen.mindfulness" size={48} />
              </View>
              {totalSessions === 0 ? (
                <EmptyState
                  icon="🧘"
                  title="Start your first session"
                  subtitle="Choose a practice below to begin. Your progress and streaks will appear here."
                />
              ) : (
                <StatsHero theme={theme} ink={ink} refreshKey={hubVisit} />
              )}
              <TileGrid theme={theme} ink={ink} onSelect={navigateTo} onQuickReset={startQuickReset} todayDone={todayDone} />
              <QuoteCard theme={theme} />
            </>
          )}
          {activeSection === "breathing"  && <BreathingSection  theme={theme} ink={ink} onBack={goBack} quickReset={quickReset} />}
          {activeSection === "grounding"  && <GroundingSection  theme={theme} ink={ink} onBack={goBack} />}
          {activeSection === "meditation" && <MeditationSection theme={theme} ink={ink} onBack={goBack} />}
          {activeSection === "gratitude"  && <GratitudeSection  theme={theme} ink={ink} onBack={goBack} />}
          {activeSection === "body_scan"  && <BodyScanSection   theme={theme} ink={ink} onBack={goBack} />}
          {activeSection === "sounds"     && <SoundscapesSection theme={theme} ink={ink} onBack={goBack} />}
        </Animated.View>
      )}
    </ScrollView>
    <FeatureIntroSheet intro={mindfulnessIntro} visible={introVisible} onClose={dismissIntro} />
    </LinearGradient>
  );
}

// ─── Tile grid ────────────────────────────────────────────────────────────────

function TileGrid({ theme, ink, onSelect, onQuickReset, todayDone }: { theme: any; ink: string; onSelect: (s: Section) => void; onQuickReset: () => void; todayDone: string[] }) {
  const tiles: { section: Section; emoji: string; title: string; desc: string; colorKey: string }[] = [
    { section: "breathing",  emoji: "🫁", title: "Breathing",  desc: "Box · 4-7-8 · coherent",  colorKey: "teal"   },
    { section: "grounding",  emoji: "🌿", title: "Grounding",  desc: "5-4-3-2-1 · PMR · STOP",  colorKey: "coral"  },
    { section: "meditation", emoji: "⏱",  title: "Meditation", desc: "Bells · chimes · ambient", colorKey: "purple" },
    { section: "gratitude",  emoji: "📓", title: "Gratitude",  desc: "Prompts & journaling",     colorKey: "berry"  },
    { section: "body_scan",  emoji: "🧘", title: "Body Scan",  desc: "Head-to-toe attention",    colorKey: "blue"   },
    { section: "sounds",     emoji: "🎧", title: "Soundscapes", desc: "Ambient sound · sleep",   colorKey: "amber"  },
  ];

  const tealSolid = (theme.teal as any)?.solid ?? ink;

  return (
    <>
      <Text style={{ color: theme.textSoft, fontSize: 13, lineHeight: 18 }}>
        Choose a practice to begin.
      </Text>

      <Pressable onPress={onQuickReset} accessibilityRole="button" accessibilityLabel="Two minute reset">
        <ShadowCard size="card" bg={tealSolid} accent={tealSolid} rotate={-0.3} skipTransparency>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1 }}>
            <Text style={{ fontSize: 28 }}>⚡</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: "#fff", fontSize: 16, fontWeight: "900" }}>2-Minute Reset</Text>
              <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 12, marginTop: 2 }}>
                A quick guided breathing break — starts right away
              </Text>
            </View>
            <Text style={{ color: "#fff", fontSize: 20 }}>›</Text>
          </View>
        </ShadowCard>
      </Pressable>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {tiles.map((t, idx) => {
          const c = theme[t.colorKey];
          const rotation = idx % 2 === 0 ? -0.5 : 0.5;
          const doneToday = todayDone.includes(t.section);
          return (
            <Pressable
              key={t.section}
              onPress={() => onSelect(t.section)}
              style={{ width: "47%" }}
              accessibilityRole="button"
              accessibilityLabel={t.title + (doneToday ? ", completed today" : "")}
            >
              <ShadowCard size="card" bg={c?.solid ?? ink} accent={c?.solid} rotate={rotation} padding={18} skipTransparency>
                <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
                  <Text style={{ fontSize: 32, marginBottom: 8 }}>{t.emoji}</Text>
                  {doneToday && (
                    <View style={{ backgroundColor: "rgba(255,255,255,0.25)", borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2, flexDirection: "row", alignItems: "center", gap: 3 }}>
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#fff" }} />
                      <Text style={{ color: "#fff", fontSize: 9, fontWeight: "900" }}>DONE</Text>
                    </View>
                  )}
                </View>
                <Text style={{ color: "#fff", fontSize: 17, fontWeight: "900", marginBottom: 4 }}>{t.title}</Text>
                <Text style={{ color: "rgba(255,255,255,0.75)", fontSize: 12 }}>{t.desc}</Text>
              </ShadowCard>
            </Pressable>
          );
        })}
      </View>
    </>
  );
}

// ─── Back button ──────────────────────────────────────────────────────────────

function BackBtn({ ink, onBack }: { ink: string; onBack: () => void }) {
  return (
    <Pressable
      onPress={onBack}
      style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}
      accessibilityRole="button"
      accessibilityLabel="Back to practices"
    >
      <Text style={{ color: ink, fontSize: 18, fontWeight: "800" }}>←</Text>
      <Text style={{ color: ink, fontSize: 13, fontWeight: "700" }}>Practices</Text>
    </Pressable>
  );
}

// ─── Breathing section ────────────────────────────────────────────────────────

const QUICK_RESET_SECONDS = 120;

function BreathingSection({ theme, ink, onBack, quickReset }: { theme: any; ink: string; onBack: () => void; quickReset?: boolean }) {
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

  // Box breathing perimeter animation (0→4 over one full cycle)
  const perimeterAnim = useRef(new Animated.Value(0)).current;
  // Circle breathing scale animation
  const breathAnim = useRef(new Animated.Value(0.5)).current;

  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const runningRef = useRef(false);
  const graceRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const graceDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phaseTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cyclesRef = useRef(0);
  const quickResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const endSessionRef = useRef<(() => void) | undefined>(undefined);
  // Ref to hold the recursive runCycle function to avoid stale closures
  const runCycleRef = useRef<((key: BreathPattern) => void) | undefined>(undefined);

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
      if (remaining <= 0) {
        clearPhaseTimer();
      }
    }, 1000);
  }

  // Define runCycle and store in ref so recursive calls always get latest version
  useEffect(() => {
    runCycleRef.current = function runCycle(key: BreathPattern) {
      if (!runningRef.current) return;
      const phases = BREATH_PATTERNS[key].phases;
      const [inh, holdIn, exh, holdOut] = phases.map((s) => s * 1000);

      if (key === "box") {
        // Box breathing: animate perimeter 0→4
        perimeterAnim.setValue(0);
        const totalSecs = phases.reduce((a, b) => a + b, 0);

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

        // Schedule phase transitions for box
        const t1 = inh > 0 ? setTimeout(() => {
          if (!runningRef.current) return;
          setPhase(1);
          startPhaseCountdown(phases[1]);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }, inh) : null;
        const t2 = holdIn > 0 ? setTimeout(() => {
          if (!runningRef.current) return;
          setPhase(2);
          startPhaseCountdown(phases[2]);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }, inh + holdIn) : null;
        const t3 = exh > 0 ? setTimeout(() => {
          if (!runningRef.current) return;
          setPhase(3);
          startPhaseCountdown(phases[3]);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }, inh + holdIn + exh) : null;

        timersRef.current = [t1, t2, t3].filter(Boolean) as ReturnType<typeof setTimeout>[];
      } else {
        // Circle breathing
        setPhase(0);
        startPhaseCountdown(phases[0]);
        Animated.timing(breathAnim, { toValue: 1, duration: inh, useNativeDriver: true }).start();

        const t1 = holdIn > 0 ? setTimeout(() => {
          if (runningRef.current) { breathAnim.stopAnimation(); setPhase(1); startPhaseCountdown(phases[1]); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }
        }, inh) : null;

        const t2 = setTimeout(() => {
          if (!runningRef.current) return;
          setPhase(2);
          startPhaseCountdown(phases[2]);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          Animated.timing(breathAnim, { toValue: 0.5, duration: exh, useNativeDriver: true }).start();
        }, inh + holdIn);

        const t3 = holdOut > 0 ? setTimeout(() => {
          if (runningRef.current) { breathAnim.stopAnimation(); setPhase(3); startPhaseCountdown(phases[3]); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }
        }, inh + holdIn + exh) : null;

        const total = inh + holdIn + exh + holdOut;
        const t4 = setTimeout(() => {
          if (!runningRef.current) return;
          cyclesRef.current += 1;
          setCycles(cyclesRef.current);
          Haptics.selectionAsync();
          runCycleRef.current?.(key);
        }, total);

        timersRef.current = [t1, t2, t3, t4].filter(Boolean) as ReturnType<typeof setTimeout>[];
      }
    };
  });

  function beginSession(key: BreathPattern) {
    runningRef.current = false;
    clearTimers();
    clearPhaseTimer();
    clearQuickResetTimer();
    breathAnim.stopAnimation();
    breathAnim.setValue(0.5);
    perimeterAnim.stopAnimation();
    perimeterAnim.setValue(0);
    setPattern(key);
    setPhase(0);
    setCycles(0);
    cyclesRef.current = 0;
    setPhaseSecsLeft(Math.ceil(BREATH_PATTERNS[key].phases[0]));
    setRunning(true);
    runningRef.current = true;
    setTimeout(() => runCycleRef.current?.(key), 100);
    if (quickReset) {
      quickResetTimerRef.current = setTimeout(() => {
        quickResetTimerRef.current = null;
        endSessionRef.current?.();
      }, QUICK_RESET_SECONDS * 1000);
    }
  }

  function clearQuickResetTimer() {
    if (quickResetTimerRef.current) { clearTimeout(quickResetTimerRef.current); quickResetTimerRef.current = null; }
  }

  function startGrace(key: BreathPattern) {
    clearGraceInterval();
    clearGraceDelay();
    setGracePending(key);
    setGraceCount(null);
    graceDelayRef.current = setTimeout(() => {
      graceDelayRef.current = null;
      setGraceCount(3);
      graceRef.current = setInterval(() => {
        setGraceCount((c) => {
          if (c === null || c <= 1) {
            clearGraceInterval();
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
      const key = gracePending;
      setGraceCount(null);
      setGracePending(null);
      beginSession(key);
    }
  }, [graceCount, gracePending]);

  function stopBreathing() {
    runningRef.current = false;
    clearTimers();
    clearPhaseTimer();
    clearQuickResetTimer();
    breathAnim.stopAnimation();
    breathAnim.setValue(0.5);
    perimeterAnim.stopAnimation();
    perimeterAnim.setValue(0);
    setRunning(false);
    setPhase(0);
    setCycles(0);
    cyclesRef.current = 0;
    setPhaseSecsLeft(0);
  }

  function fullStop() {
    clearGraceDelay();
    clearGraceInterval();
    setGraceCount(null);
    setGracePending(null);
    setBreathWaiting(null);
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
    setSummary(null);
    setMoodBefore(null);
    setMoodAfter(null);
  }

  function handleRestart() {
    const savedPattern = pattern;
    stopBreathing();
    if (savedPattern) startGrace(savedPattern);
  }

  // Quick reset: skip pattern choice and start box breathing immediately
  useEffect(() => {
    if (quickReset) startGrace("box");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickReset]);

  useEffect(() => () => {
    runningRef.current = false;
    clearTimers();
    clearPhaseTimer();
    clearQuickResetTimer();
    clearGraceDelay();
    clearGraceInterval();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tealSolid = (theme.teal as any)?.solid ?? ink;
  const inGrace = gracePending !== null;

  return (
    <>
      <BackBtn ink={ink} onBack={() => { if (summary) finalizeSummary(); fullStop(); onBack(); }} />
      <Text style={{ color: theme.textStrong, fontSize: 20, fontWeight: "900", marginBottom: 2 }}>
        {quickReset ? "2-Minute Reset" : "Breathing"}
      </Text>

      {inGrace ? (
        <GraceCountdown count={graceCount} accentColor={tealSolid} theme={theme} ink={ink} />
      ) : summary ? (
        <View style={{ alignItems: "center", gap: 18, paddingVertical: 24 }}>
          <Text style={{ fontSize: 48 }}>🌬️</Text>
          <Text style={{ color: theme.textStrong, fontSize: 20, fontWeight: "900" }}>Session complete</Text>
          <Text style={{ color: theme.textSoft, fontSize: 14 }}>
            {BREATH_PATTERNS[summary.pattern].label} · {summary.cycles} cycle{summary.cycles === 1 ? "" : "s"} · {Math.max(1, Math.round(summary.seconds / 60))} min
          </Text>
          <MoodDeltaPicker
            label="HOW DO YOU FEEL NOW?"
            value={moodAfter}
            onSelect={setMoodAfter}
            accentColor={tealSolid}
            theme={theme}
          />
          <Pressable onPress={finalizeSummary} style={[styles.endBtn, { borderColor: ink, backgroundColor: theme.card }]} accessibilityRole="button">
            <Text style={{ color: ink, fontSize: 13, fontWeight: "800" }}>DONE</Text>
          </Pressable>
        </View>
      ) : breathWaiting ? (
        <>
          <Text style={{ color: theme.textSoft, fontSize: 13, marginBottom: 2 }}>
            {BREATH_PATTERNS[breathWaiting].label} · {BREATH_PATTERNS[breathWaiting].desc}
          </Text>
          <MoodDeltaPicker
            label="HOW DO YOU FEEL RIGHT NOW?"
            value={moodBefore}
            onSelect={setMoodBefore}
            accentColor={tealSolid}
            theme={theme}
          />
          <StartCircleButton
            onPress={handleBreathStart}
            accentColor={tealSolid}
            ink={ink}
            sublabel="Tap to begin"
          />
          <Pressable
            onPress={() => setBreathWaiting(null)}
            style={{ alignItems: "center", paddingVertical: 4 }}
            accessibilityRole="button"
          >
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
              <Pressable
                key={key}
                onPress={() => handlePatternSelect(key)}
                accessibilityRole="button"
              >
                <ShadowCard size="card" bg={theme.teal.tint} accent={theme.teal.solid} rotate={rotation}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.teal.fg, fontSize: 16, fontWeight: "900" }}>{p.label}</Text>
                    <Text style={{ color: theme.teal.sub, fontSize: 12, marginTop: 2 }}>{p.desc}</Text>
                  </View>
                  <Text style={{ color: theme.teal.fg, fontSize: 20 }}>›</Text>
                </ShadowCard>
              </Pressable>
            );
          })}
        </>
      ) : (
        <View style={{ alignItems: "center", gap: 20, paddingVertical: 16 }}>
          <Text style={{ color: theme.textSoft, fontSize: 13, letterSpacing: 0.5 }}>
            {pattern ? BREATH_PATTERNS[pattern].label : ""}
            {quickReset ? " · ends automatically" : ""}
          </Text>

          {pattern === "box" ? (
            <BoxBreathingAnimation
              perimeterAnim={perimeterAnim}
              phase={phase}
              phaseSecsLeft={phaseSecsLeft}
            />
          ) : pattern ? (
            <CircleBreathingAnimation
              breathAnim={breathAnim}
              phase={phase}
              phaseSecsLeft={phaseSecsLeft}
              pattern={pattern}
            />
          ) : null}

          <Text style={{ color: theme.textSoft, fontSize: 13 }}>
            Cycles completed: <Text style={{ color: theme.textStrong, fontWeight: "800" }}>{cycles}</Text>
          </Text>

          <View style={{ flexDirection: "row", gap: 10, width: "100%" }}>
            <Pressable
              onPress={handleRestart}
              style={[styles.endBtn, { borderColor: ink, backgroundColor: theme.card, flex: 1 }]}
              accessibilityRole="button"
            >
              <Text style={{ color: ink, fontSize: 13, fontWeight: "800", letterSpacing: 0.5 }}>↺ RESTART</Text>
            </Pressable>
            <Pressable
              onPress={handleEndSession}
              style={[styles.endBtn, { borderColor: ink, backgroundColor: theme.card, flex: 1 }]}
              accessibilityRole="button"
            >
              <Text style={{ color: ink, fontSize: 13, fontWeight: "800", letterSpacing: 0.5 }}>END SESSION</Text>
            </Pressable>
          </View>
        </View>
      )}
    </>
  );
}

// ─── Grounding section ────────────────────────────────────────────────────────

function GroundingSection({ theme, ink, onBack }: { theme: any; ink: string; onBack: () => void }) {
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
        if (c <= 1) {
          clearGetReadyTimer();
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  }

  function startPmrStep(s: number, phase: "tense" | "release") {
    stopTimer();
    setStep(s);
    setPmrPhase(phase);
    setCountdown(PMR_DURATION);
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
      setPmrGetReadyFor(null);
      setPmrGetReadyNextStep(null);
      startPmrStep(next, "tense");
    }
  }, [pmrGetReadyCountdown, pmrGetReadyNextStep]);

  function startPmrGrace() {
    clearPmrGraceInterval();
    clearPmrGraceDelay();
    setPmrGracePending(true);
    setPmrGraceCount(null);
    pmrGraceDelayRef.current = setTimeout(() => {
      pmrGraceDelayRef.current = null;
      setPmrGraceCount(3);
      pmrGraceRef.current = setInterval(() => {
        setPmrGraceCount((c) => {
          if (c === null || c <= 1) {
            clearPmrGraceInterval();
            return 0;
          }
          return c - 1;
        });
      }, 1000);
    }, 2000);
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (pmrGraceCount === 0) {
      setPmrGraceCount(null);
      setPmrGracePending(false);
      startPmrStep(0, "tense");
    }
  }, [pmrGraceCount]);

  function selectTechnique(t: GroundTechnique) {
    setTechnique(t);
    setStep(0);
    setPmrPhase("tense");
    if (t === "pmr") setPmrReadyToStart(true);
  }

  function handlePmrBegin() {
    setPmrReadyToStart(false);
    startPmrGrace();
  }

  function handlePmrRestart() {
    stopTimer();
    clearGetReadyTimer();
    clearPmrGraceDelay();
    setPmrGetReadyFor(null);
    setPmrGetReadyNextStep(null);
    setStep(0);
    setPmrPhase("tense");
    setCountdown(PMR_DURATION);
    setPmrReadyToStart(true);
  }

  function handleBack() {
    stopTimer();
    clearGetReadyTimer();
    clearPmrGraceDelay();
    clearPmrGraceInterval();
    setPmrGraceCount(null);
    setPmrGracePending(false);
    setPmrReadyToStart(false);
    setPmrGetReadyFor(null);
    setPmrGetReadyNextStep(null);
    setTechnique(null);
    onBack();
  }

  useEffect(() => () => {
    stopTimer();
    clearGetReadyTimer();
    clearPmrGraceDelay();
    clearPmrGraceInterval();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const inPmrGrace = pmrGracePending;

  // Get active area for current PMR step
  const activeArea = step < PMR_STEPS.length
    ? (PMR_AREA_MAP[PMR_STEPS[step]]?.area ?? "")
    : "";

  return (
    <>
      <BackBtn ink={ink} onBack={handleBack} />
      <Text style={{ color: theme.textStrong, fontSize: 20, fontWeight: "900", marginBottom: 2 }}>Grounding</Text>

      {technique === null ? (
        <>
          <Text style={{ color: theme.textSoft, fontSize: 13, marginBottom: 10 }}>Choose a technique.</Text>
          {([
            { key: "54321", label: "5-4-3-2-1 Sensory",            desc: "Engage all five senses sequentially" },
            { key: "pmr",   label: "Progressive Muscle Relaxation", desc: "Tense and release each muscle group" },
            { key: "stop",  label: "STOP Technique",                desc: "Stop · Take a breath · Observe · Proceed" },
          ] as const).map((t, idx) => (
            <Pressable
              key={t.key}
              onPress={() => selectTechnique(t.key)}
              accessibilityRole="button"
            >
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
              <View
                key={i}
                style={[styles.card, {
                  borderColor: current ? ink : theme.cardBorder ?? ink,
                  backgroundColor: current ? (theme.coral as any)?.tint : theme.card,
                  opacity: done ? 0.4 : 1,
                }]}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: current ? 8 : 0 }}>
                  <View style={{ width: 28, height: 28, borderRadius: 26, backgroundColor: current ? (theme.coral as any)?.solid : theme.cardBorder, alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ color: current ? "#fff" : theme.textSoft, fontWeight: "800", fontSize: 13 }}>{item.count}</Text>
                  </View>
                  <Text style={{ color: current ? (theme.coral as any)?.fg : theme.textSoft, fontWeight: "800", fontSize: 13, letterSpacing: 0.5 }}>
                    {item.sense}
                  </Text>
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
                      <Text style={{ color: "#fff", fontSize: 13, fontWeight: "800" }}>
                        {step + 1 < GROUNDING_54321.length ? "NEXT →" : "DONE ✓"}
                      </Text>
                    </Pressable>
                  </>
                )}
              </View>
            );
          })}
          {step > 0 && (
            <Pressable
              onPress={() => { Haptics.selectionAsync(); setStep(0); }}
              style={[styles.endBtn, { borderColor: ink, backgroundColor: theme.card }]}
              accessibilityRole="button"
            >
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
              <StartCircleButton
                onPress={handlePmrBegin}
                accentColor={coralSolid}
                ink={ink}
                sublabel="Tap to begin"
              />
            </View>
          ) : inPmrGrace ? (
            <GraceCountdown count={pmrGraceCount} accentColor={coralSolid} theme={theme} ink={ink} />
          ) : pmrGetReadyFor !== null ? (
            <View style={{ alignItems: "center", gap: 16, paddingVertical: 28 }}>
              <Text style={{ color: theme.textSoft, fontSize: 14, letterSpacing: 0.3 }}>
                Great work! Next up…
              </Text>
              <Text style={{ color: (theme.coral as any)?.fg, fontSize: 15, fontWeight: "700", textAlign: "center" }}>
                Get ready for
              </Text>
              <Text style={{ color: (theme.coral as any)?.fg, fontSize: 26, fontWeight: "900", textAlign: "center" }}>
                {pmrGetReadyFor}
              </Text>
              <View style={{
                width: 90, height: 90, borderRadius: 45,
                backgroundColor: theme.card,
                borderWidth: 2, borderColor: coralSolid,
                alignItems: "center", justifyContent: "center",
                shadowColor: "rgba(60,40,20,0.1)", shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.1, shadowRadius: 12, elevation: 3,
              }}>
                <Text style={{ color: coralSolid, fontSize: 40, fontWeight: "900" }}>
                  {pmrGetReadyCountdown}
                </Text>
              </View>
            </View>
          ) : (
            <>
              <Text style={{ color: theme.textSoft, fontSize: 13 }}>
                {step < PMR_STEPS.length ? `Step ${step + 1} of ${PMR_STEPS.length}` : "Complete"}
              </Text>

              {/* PMR Body Diagram */}
              {step < PMR_STEPS.length && (
                <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder ?? ink }]}>
                  <PmrBodyDiagram activeArea={activeArea} accentColor={coralSolid} />
                </View>
              )}

              {step < PMR_STEPS.length && (
                <View style={[styles.card, { backgroundColor: (theme.coral as any)?.tint, borderColor: ink }]}>
                  <Text style={{ color: (theme.coral as any)?.fg, fontSize: 19, fontWeight: "900", marginBottom: 6 }}>
                    {PMR_STEPS[step]}
                  </Text>
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
                <Pressable
                  onPress={handlePmrRestart}
                  style={[styles.endBtn, { borderColor: ink, backgroundColor: theme.card, flex: 1 }]}
                  accessibilityRole="button"
                >
                  <Text style={{ color: ink, fontSize: 13, fontWeight: "800" }}>↺ RESTART</Text>
                </Pressable>
                <Pressable
                  onPress={() => { stopTimer(); clearGetReadyTimer(); setTechnique(null); }}
                  style={[styles.endBtn, { borderColor: ink, backgroundColor: theme.card, flex: 1 }]}
                  accessibilityRole="button"
                >
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
              <View
                key={i}
                style={[styles.card, {
                  borderColor: current ? ink : theme.cardBorder ?? ink,
                  backgroundColor: current ? (theme.coral as any)?.tint : theme.card,
                  opacity: done ? 0.4 : 1,
                }]}
              >
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
                    <Text style={{ color: "#fff", fontSize: 13, fontWeight: "800" }}>
                      {step + 1 < STOP_STEPS.length ? "NEXT →" : "DONE ✓"}
                    </Text>
                  </Pressable>
                )}
              </View>
            );
          })}
          {step > 0 && (
            <Pressable
              onPress={() => { Haptics.selectionAsync(); setStep(0); }}
              style={[styles.endBtn, { borderColor: ink, backgroundColor: theme.card }]}
              accessibilityRole="button"
            >
              <Text style={{ color: ink, fontSize: 13, fontWeight: "800", letterSpacing: 0.5 }}>↺ RESTART</Text>
            </Pressable>
          )}
        </View>
      )}
    </>
  );
}

// ─── Meditation section ───────────────────────────────────────────────────────

type MeditationAsset = { id: string; title: string; meta?: { emoji?: string } };

function MeditationSection({ theme, ink, onBack }: { theme: any; ink: string; onBack: () => void }) {
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
        p.volume = 1;
        p.play();
        chimePlayerRef.current = p;
      }
    } catch {}
  }

  function startAmbient() {
    if (!ambientId) return;
    // Release any existing player first so we never orphan a looping player.
    if (ambientPlayerRef.current) {
      try { ambientPlayerRef.current.pause(); ambientPlayerRef.current.remove(); } catch {}
      ambientPlayerRef.current = null;
    }
    try {
      const p = createAudioPlayer(authedSource(ambientId));
      p.loop = true;
      p.volume = 0.55;
      p.play();
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
    setDuration(mins);
    setRemaining(mins * 60);
    setRunning(true);
    setEndedEarlySecs(null);
    loggedRef.current = false;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    activateKeepAwakeAsync("meditation").catch(() => {});
    playChime();
    startAmbient();
    if (intervalBells && chimes.length > 0) {
      bellTimerRef.current = setInterval(() => playChime(), 5 * 60 * 1000);
    }
    timerRef.current = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          stopTimer();
          setRunning(false);
          stopAudio();
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
    clearGraceInterval();
    clearGraceDelay();
    setGracePendingDuration(mins);
    setGraceCount(null);
    graceDelayRef.current = setTimeout(() => {
      graceDelayRef.current = null;
      setGraceCount(3);
      graceRef.current = setInterval(() => {
        setGraceCount((c) => {
          if (c === null || c <= 1) {
            clearGraceInterval();
            return 0;
          }
          return c - 1;
        });
      }, 1000);
    }, 2000);
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (graceCount === 0 && gracePendingDuration !== null) {
      const mins = gracePendingDuration;
      setGraceCount(null);
      setGracePendingDuration(null);
      beginMeditation(mins);
    }
  }, [graceCount, gracePendingDuration]);

  function stopSession() {
    stopTimer();
    stopAudio();
    deactivateKeepAwake("meditation").catch(() => {});
    setRunning(false);
    setDuration(null);
    setRemaining(0);
    setEndedEarlySecs(null);
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
    stopTimer();
    // Stop + release ambient/bell audio so restarting never leaves an
    // orphaned looping player behind.
    stopAudio();
    deactivateKeepAwake("meditation").catch(() => {});
    setRunning(false);
    setDuration(null);
    setRemaining(0);
    setEndedEarlySecs(null);
    setMeditationWaiting(savedDuration);
  }

  function endSessionEarly() {
    if (duration === null) { stopSession(); return; }
    const elapsed = duration * 60 - remaining;
    stopTimer();
    stopAudio();
    deactivateKeepAwake("meditation").catch(() => {});
    setRunning(false);
    if (elapsed < 60) {
      // Under a minute — nothing meaningful to log; discard like before.
      setDuration(null);
      setRemaining(0);
      setEndedEarlySecs(null);
      return;
    }
    // Route to the completion screen so the partial session gets logged
    // (elapsed time) and the mood-after step is kept.
    setEndedEarlySecs(elapsed);
    setRemaining(0);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  function fullStop() {
    clearGraceDelay();
    clearGraceInterval();
    setGraceCount(null);
    setGracePendingDuration(null);
    setMeditationWaiting(null);
    stopSession();
  }

  function handleDurationSelect(mins: number) {
    setMeditationWaiting(mins);
  }

  function handleMeditationStart() {
    if (!meditationWaiting) return;
    const mins = meditationWaiting;
    setMeditationWaiting(null);
    startGrace(mins);
  }

  function handleGoBack() {
    // If a finished session was never logged (user backs out of the done screen), log it plain
    if (duration !== null && remaining === 0 && !running) logCompletion(true);
    fullStop();
    releaseChimePlayer();
    // Reset mode so next entry starts fresh
    setMode(null);
    onBack();
  }

  function handleBackFromDuration() {
    setMeditationWaiting(null);
    // Go back to mode selection
    setMode(null);
  }

  useEffect(() => () => {
    stopTimer();
    clearGraceDelay();
    clearGraceInterval();
    stopAudio();
    releaseChimePlayer();
    deactivateKeepAwake("meditation").catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const fmtTime = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  const done = duration !== null && remaining === 0 && !running;
  const inGrace = gracePendingDuration !== null;

  return (
    <>
      <BackBtn ink={ink} onBack={handleGoBack} />
      <Text style={{ color: theme.textStrong, fontSize: 20, fontWeight: "900", marginBottom: 2 }}>Meditation</Text>

      {inGrace ? (
        <GraceCountdown count={graceCount} accentColor={purpleSolid} theme={theme} ink={ink} />
      ) : meditationWaiting !== null ? (
        <>
          <MoodDeltaPicker
            label="HOW DO YOU FEEL RIGHT NOW?"
            value={moodBefore}
            onSelect={setMoodBefore}
            accentColor={purpleSolid}
            theme={theme}
          />

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
              <Text style={{ fontSize: 20 }}>🔔</Text>
              <Text style={{ color: theme.textStrong, fontSize: 13, fontWeight: "700", flex: 1 }}>
                Interval bell every 5 minutes
              </Text>
              <Text style={{ color: intervalBells ? purpleSolid : theme.textSoft, fontSize: 13, fontWeight: "900" }}>
                {intervalBells ? "ON" : "OFF"}
              </Text>
            </Pressable>
          )}

          {ambients.length > 0 && (
            <View style={{ gap: 8 }}>
              <Text style={{ color: theme.textSoft, fontSize: 11, fontWeight: "800", letterSpacing: 0.6 }}>
                🎧 AMBIENT SOUND
              </Text>
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

          <StartCircleButton
            onPress={handleMeditationStart}
            accentColor={purpleSolid}
            ink={ink}
            sublabel={`${meditationWaiting} min · ${mode === "guided" ? "Guided" : "Unguided"}`}
          />
          <Pressable
            onPress={handleBackFromDuration}
            style={{ alignItems: "center", paddingVertical: 4 }}
            accessibilityRole="button"
          >
            <Text style={{ color: theme.textSoft, fontSize: 13 }}>← Choose a different duration</Text>
          </Pressable>
        </>
      ) : mode === null ? (
        // Mode selection step
        <>
          <Text style={{ color: theme.textSoft, fontSize: 13, marginBottom: 10 }}>Choose a session type.</Text>
          <Pressable
            onPress={() => setMode("guided")}
            accessibilityRole="button"
          >
            <ShadowCard size="card" bg={(theme.purple as any)?.tint} accent={(theme.purple as any)?.solid} rotate={-0.4}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                <Text style={{ fontSize: 32 }}>🎵</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: (theme.purple as any)?.fg, fontSize: 16, fontWeight: "900" }}>Guided</Text>
                  <Text style={{ color: (theme.purple as any)?.sub, fontSize: 12, marginTop: 2 }}>Music & voice prompts</Text>
                </View>
                <Text style={{ color: (theme.purple as any)?.fg, fontSize: 20 }}>›</Text>
              </View>
            </ShadowCard>
          </Pressable>
          <Pressable
            onPress={() => setMode("unguided")}
            accessibilityRole="button"
          >
            <ShadowCard size="card" bg={(theme.purple as any)?.tint} accent={(theme.purple as any)?.solid} rotate={0.4}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                <Text style={{ fontSize: 32 }}>🔇</Text>
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
        // Duration picker
        <>
          <Text style={{ color: theme.textSoft, fontSize: 13, marginBottom: 2 }}>
            {mode === "guided" ? "Guided session" : "Unguided session"} — choose a duration.
          </Text>
          <Pressable
            onPress={() => setMode(null)}
            style={{ paddingVertical: 4, marginBottom: 8 }}
            accessibilityRole="button"
          >
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
                  shadowColor: "rgba(60,40,20,0.1)", shadowOffset: { width: 0, height: 6 },
                  shadowOpacity: 0.08, shadowRadius: 10, elevation: 2,
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
        <View style={{ alignItems: "center", gap: 16, paddingVertical: 24 }}>
          <Text style={{ fontSize: 48 }}>🎉</Text>
          <Text style={{ color: theme.textStrong, fontSize: 20, fontWeight: "900" }}>Session complete</Text>
          <Text style={{ color: theme.textSoft, fontSize: 14 }}>{duration} min · {mode === "guided" ? "Guided" : "Unguided"}</Text>
          <MoodDeltaPicker
            label="HOW DO YOU FEEL NOW?"
            value={moodAfter}
            onSelect={setMoodAfter}
            accentColor={purpleSolid}
            theme={theme}
          />
          <Pressable
            onPress={() => { logCompletion(true); setDuration(null); setMode(null); setMoodBefore(null); setMoodAfter(null); }}
            style={[styles.endBtn, { borderColor: ink, backgroundColor: theme.card }]}
          >
            <Text style={{ color: ink, fontSize: 13, fontWeight: "800" }}>DONE</Text>
          </Pressable>
        </View>
      ) : (
        // Running session
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
            <Pressable
              onPress={handleRestart}
              style={[styles.endBtn, { borderColor: ink, backgroundColor: theme.card, flex: 1 }]}
              accessibilityRole="button"
            >
              <Text style={{ color: ink, fontSize: 13, fontWeight: "800", letterSpacing: 0.5 }}>↺ RESTART</Text>
            </Pressable>
            <Pressable
              onPress={stopSession}
              style={[styles.endBtn, { borderColor: ink, backgroundColor: theme.card, flex: 1 }]}
              accessibilityRole="button"
            >
              <Text style={{ color: ink, fontSize: 13, fontWeight: "800", letterSpacing: 0.5 }}>END SESSION</Text>
            </Pressable>
          </View>

          {(ambientId !== null || intervalBells) && (
            <View style={{ width: "100%", gap: 10 }}>
              {ambientId !== null && (
                <View style={{
                  flexDirection: "row", gap: 12, borderWidth: 2,
                  borderColor: ink, borderRadius: 16, padding: 12,
                  alignItems: "center", backgroundColor: theme.card,
                }}>
                  <Text style={{ fontSize: 22 }}>🎧</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: ink, fontSize: 14, fontWeight: "800" }}>
                      {ambients.find((a) => a.id === ambientId)?.title ?? "Ambient sound"}
                    </Text>
                    <Text style={{ color: theme.textSoft, fontSize: 12 }}>Playing softly in the background</Text>
                  </View>
                </View>
              )}
              {intervalBells && (
                <View style={{
                  flexDirection: "row", gap: 12, borderWidth: 2,
                  borderColor: ink, borderRadius: 16, padding: 12,
                  alignItems: "center", backgroundColor: theme.card,
                }}>
                  <Text style={{ fontSize: 22 }}>🔔</Text>
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

// ─── Gratitude section ────────────────────────────────────────────────────────

function GratitudeSection({ theme, ink, onBack }: { theme: any; ink: string; onBack: () => void }) {
  const [promptIdx, setPromptIdx] = useState(() => Math.floor(Math.random() * GRATITUDE_PROMPTS.length));
  const [dataPrompt, setDataPrompt] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedCount, setSavedCount] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const s: any = await api.sleepStats();
        const secs = Number(s?.yesterday_seconds ?? 0);
        if (alive && secs > 0 && secs < 6 * 3600) {
          const h = Math.round((secs / 3600) * 10) / 10;
          setDataPrompt(`Sleep was short last night (${h}h). What helped you get through today anyway?`);
        }
      } catch {}
    })();
    return () => { alive = false; };
  }, []);

  function handleReroll() {
    Haptics.selectionAsync();
    setDataPrompt(null);
    setPromptIdx((prev) => {
      let next = Math.floor(Math.random() * GRATITUDE_PROMPTS.length);
      // Ensure we get a different prompt
      while (next === prev && GRATITUDE_PROMPTS.length > 1) {
        next = Math.floor(Math.random() * GRATITUDE_PROMPTS.length);
      }
      return next;
    });
  }

  async function handleSave() {
    if (!text.trim()) return;
    setSaving(true);
    try {
      await api.logMoodMoment(5, "Grateful", text.trim());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast("Saved to your journal.");
      trackMindfulnessCompletion("gratitude");
      setSaved(true);
      setText("");
      setSavedCount((c) => c + 1);
    } catch {
      toast("Couldn't save — try again.", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <BackBtn ink={ink} onBack={onBack} />
      <Text style={{ color: theme.textStrong, fontSize: 20, fontWeight: "900", marginBottom: 2 }}>Gratitude</Text>

      {saved ? (
        <View style={{ alignItems: "center", gap: 16, paddingVertical: 24 }}>
          <Text style={{ fontSize: 48 }}>🙏</Text>
          <Text style={{ color: theme.textStrong, fontSize: 18, fontWeight: "800", textAlign: "center" }}>Saved to your journal</Text>
          <Pressable onPress={() => setSaved(false)} style={[styles.endBtn, { borderColor: ink, backgroundColor: theme.card }]}>
            <Text style={{ color: ink, fontSize: 13, fontWeight: "800" }}>WRITE ANOTHER</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <ShadowCard size="card" bg={(theme.berry as any)?.tint} accent={(theme.berry as any)?.solid} rotate={-0.5}>
            {/* Header row with label and reroll button */}
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
              <Text style={{ color: (theme.berry as any)?.sub, fontSize: 9, fontWeight: "900", letterSpacing: 0.6, flex: 1 }}>
                TODAY'S PROMPT
              </Text>
              <Pressable
                onPress={handleReroll}
                accessibilityRole="button"
                accessibilityLabel="Get a different prompt"
                style={{
                  paddingHorizontal: 8, paddingVertical: 4,
                  borderRadius: 10,
                  backgroundColor: (theme.berry as any)?.solid + "22",
                }}
              >
                <Text style={{ fontSize: 14 }}>🔀</Text>
              </Pressable>
            </View>
            <Text style={{ color: (theme.berry as any)?.fg, fontSize: 16, lineHeight: 24, fontWeight: "600" }}>
              {dataPrompt ?? GRATITUDE_PROMPTS[promptIdx]}
            </Text>
          </ShadowCard>

          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Write your reflection here…"
            placeholderTextColor={theme.textSoft}
            style={{
              borderWidth: 2, borderColor: ink, borderRadius: 22, padding: 14,
              fontSize: 15, minHeight: 120, color: theme.textStrong,
              backgroundColor: theme.card, textAlignVertical: "top",
              shadowColor: "rgba(60,40,20,0.1)", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 2,
            }}
            multiline
            accessibilityLabel="Gratitude journal entry"
          />

          <Pressable
            onPress={handleSave}
            disabled={!text.trim() || saving}
            style={[styles.saveBtn, { backgroundColor: (theme.berry as any)?.solid, borderColor: ink, opacity: text.trim() ? 1 : 0.4 }]}
            accessibilityRole="button"
          >
            {saving
              ? <LoadingIndicator size="small" color="#fff" />
              : <Text style={{ color: "#fff", fontSize: 14, fontWeight: "800", letterSpacing: 0.5 }}>SAVE TO JOURNAL</Text>}
          </Pressable>
        </>
      )}

      <GratitudeHistory theme={theme} ink={ink} refreshKey={savedCount} />
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = sharedStyles;
