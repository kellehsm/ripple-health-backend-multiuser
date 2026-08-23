import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Alert, Image, Modal, RefreshControl, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { toast } from '../lib/toast';
import { FeatureIntroSheet } from '../components/FeatureIntroSheet';
import { useFeatureIntro } from '../onboarding/useFeatureIntro';
import { findIntro } from '../onboarding/featureIntros';
import { ScreenBackground } from '../components/ScreenBackground';
import Svg, { Circle, Rect } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { onSolid } from '../theme/colorUtils';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeContext';
import { ThemedIcon } from '../theme/iconRegistry';
import { ShadowCard } from '../components/ShadowCard';
import { GhostRow } from '../components/GhostRow';
import { SectionLabel } from '../components/SectionLabel';
import { FONT_SIZES } from '../theme/tokens';
import { api } from '../api/client';
import { LoadingIndicator } from '../components/LoadingIndicator';
import { WorkoutSetupWizard } from './WorkoutSetupWizard';
import { useTabPreferences } from '../hooks/useTabPreferences';
import { TooltipBubble } from '../components/TooltipBubble';
import { hasSeenTooltip, markTooltipSeen } from '../utils/tooltipSeen';
import { WorkoutPlannerModal, PlanExercise } from '../components/WorkoutPlannerModal';
import { getCached, setCached, invalidateCache } from '../utils/staleCache';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface DetectedWorkout {
  start: string;
  end: string;
  duration_minutes: number;
  avg_bpm: number;
  peak_bpm: number;
}

const DETECTED_DISMISS_KEY = 'detected_workout_dismissed';

function formatClock(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours() % 12 || 12;
  return `${h}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() >= 12 ? 'PM' : 'AM'}`;
}

interface WorkoutSuggestion {
  type: string;
  title: string;
  body: string;
  cta: string | null;
  data: Record<string, any> | null;
}

/** Maps suggestion type to exerciseSuggestion.* slot id. */
function suggestionSlot(type: string): string {
  const known = ['rest_day','neglected_muscle','program_gap','preferred_day','consistency_streak','low_completion','no_history','generic'];
  return `exerciseSuggestion.${known.includes(type) ? type : 'generic'}`;
}

interface ActiveProgram {
  id: string;
  name: string;
  days_per_week: number;
  preferred_minutes: number;
  is_active: boolean;
  days: Array<{
    id: string;
    day_number: number;
    focus: string;
    exercises: Array<{ exercise_id: string; name: string; sets: number; rep_range_min: number; rep_range_max: number }>;
  }>;
}

interface ExerciseSession {
  id: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number;
  entry_count: number;
  exercise_names: string[] | null;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 86400000 && d.getDate() === now.getDate()) return 'Today';
  if (diff < 172800000) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const FOCUS_LABEL: Record<string, string> = {
  push: 'Push', pull: 'Pull', legs: 'Legs',
  upper: 'Upper Body', lower: 'Lower Body', full_body: 'Full Body',
};

const IMAGE_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';

// See ExerciseSessionScreen.CyclingImage — GIF-native pacing (400ms) + prefetch
// + stacked frames toggled by opacity to avoid RN's cross-fade + re-decode.
function CyclingImage({ images, style }: { images: string[]; style: any }) {
  const { theme } = useTheme();
  const [idx, setIdx] = useState(0);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(false);
    if (images.length === 0) return;
    let cancelled = false;
    Promise.all(images.map(uri => Image.prefetch(IMAGE_BASE + uri).catch(() => null)))
      .then(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; };
  }, [images.join("|")]);
  useEffect(() => {
    if (!ready || images.length <= 1) return;
    const t = setInterval(() => setIdx(i => (i + 1) % images.length), 400);
    return () => clearInterval(t);
  }, [ready, images.length]);
  if (!images.length) {
    return <View style={[style, { backgroundColor: theme.teal.bg, opacity: 0.5 }]} />;
  }
  return (
    <View style={[style, { overflow: "hidden" }]}>
      {images.map((uri, i) => (
        <Image
          key={uri}
          source={{ uri: IMAGE_BASE + uri }}
          style={[StyleSheet.absoluteFill, { opacity: i === idx ? 1 : 0 }]}
          resizeMode="cover"
          fadeDuration={0}
        />
      ))}
    </View>
  );
}

function ExerciseEmptyState({ onPress }: { onPress: () => void }) {
  const { theme } = useTheme();
  const c = theme.teal.solid;
  return (
    <View style={{ alignItems: "center", paddingVertical: 48 }}>
      <Svg width={120} height={100} viewBox="0 0 120 100">
        <Circle cx="60" cy="50" r="36" fill={c} opacity={0.15} />
        <Circle cx="22" cy="50" r="14" fill={c} opacity={0.7} />
        <Circle cx="98" cy="50" r="14" fill={c} opacity={0.7} />
        <Rect x="30" y="44" width="60" height="12" rx="6" fill={c} opacity={0.7} />
        <Rect x="8" y="44" width="28" height="12" rx="6" fill={c} opacity={0.25} />
        <Rect x="84" y="44" width="28" height="12" rx="6" fill={c} opacity={0.25} />
      </Svg>
      <Text style={{ fontSize: 16, fontWeight: "700", color: theme.textStrong, marginTop: 16 }}>No workouts yet</Text>
      <Text style={{ fontSize: 13, color: theme.textSoft, marginTop: 6, textAlign: "center", maxWidth: 240 }}>
        Log your first session to start building your exercise history
      </Text>
      <Pressable
        onPress={() => { Haptics.selectionAsync(); onPress(); }}
        style={{ marginTop: 20, paddingHorizontal: 20, paddingVertical: 11, borderRadius: 22, borderWidth: 2, borderColor: theme.ink, backgroundColor: theme.teal.solid }}
      >
        <Text style={{ fontWeight: "700", color: onSolid(theme.teal.solid) }}>Log a workout</Text>
      </Pressable>
    </View>
  );
}

export function ExerciseScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<any>();
  const { preferences, loading: prefsLoading } = useTabPreferences();
  const exerciseIntro = findIntro("exercise")!;
  const [introVisible, dismissIntro] = useFeatureIntro(exerciseIntro.key);
  const ink = theme.ink;

  const [showTooltip, setShowTooltip] = useState(false);
  const [sessions, setSessions] = useState<ExerciseSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<WorkoutSuggestion | null>(null);
  const [detected, setDetected] = useState<DetectedWorkout | null>(null);
  const [loggingDetected, setLoggingDetected] = useState(false);
  const [activeProgram, setActiveProgram] = useState<ActiveProgram | null>(null);
  const [plannerVisible, setPlannerVisible] = useState(false);
  const [plannerInitialQueue, setPlannerInitialQueue] = useState<PlanExercise[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Wizard gate — null = loading, false = show wizard, true = show main screen
  const [wizardDone, setWizardDone] = useState<boolean | null>(null);

  // Program overflow menu / rename state
  const [programMenuVisible, setProgramMenuVisible] = useState(false);
  const [renamingProgram, setRenamingProgram] = useState(false);
  const [renameText, setRenameText] = useState("");

  interface DayExercise {
    exercise_id: string;
    name: string;
    sets: number;
    rep_range_min: number;
    rep_range_max: number;
    images: string[];
    primary_muscles: string[];
  }
  interface SelectedDay {
    day: ActiveProgram['days'][0];
    exercises: DayExercise[];
  }
  const [selectedDay, setSelectedDay] = useState<SelectedDay | null>(null);
  const [dayLoading, setDayLoading] = useState(false);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    hasSeenTooltip("exercise").then(seen => {
      if (!cancelled && !seen) {
        setShowTooltip(true);
        markTooltipSeen("exercise");
      }
    });
    if (prefsLoading) return () => { cancelled = true; };
    if (!preferences.selectedModules.includes('exercise')) {
      navigation.navigate('Home');
      return () => { cancelled = true; };
    }

    const cached = getCached<{
      wizardDone: boolean;
      sessions: ExerciseSession[];
      suggestion: WorkoutSuggestion | null;
      activeProgram: ActiveProgram | null;
    }>('exercise:main');
    if (cached) {
      setWizardDone(cached.wizardDone);
      setSessions(cached.sessions);
      setSuggestion(cached.suggestion);
      setActiveProgram(cached.activeProgram);
      setLoading(false);
      setRefreshing(false);
      return () => { cancelled = true; };
    }

    if (!refreshing) setLoading(true);
    setLoadError(null);
    Promise.all([
      api.getWorkoutWizardStatus().catch(() => ({ complete: false })),
      api.listExerciseSessions(20, 0).catch(() => []),
      api.getExerciseSuggestion().catch(() => null),
      api.listWorkoutPrograms().catch(() => []),
    ]).then(([status, sessionList, sug, progs]) => {
      if (!cancelled) {
        const wizardDoneVal = status.complete === true;
        const sessionsVal: ExerciseSession[] = sessionList ?? [];
        const sugVal: WorkoutSuggestion | null = sug ?? null;
        const activeProgramVal: ActiveProgram | null = (progs as any[]).find((p: any) => p.is_active) ?? null;
        setCached('exercise:main', {
          wizardDone: wizardDoneVal,
          sessions: sessionsVal,
          suggestion: sugVal,
          activeProgram: activeProgramVal,
        });
        setWizardDone(wizardDoneVal);
        setSessions(sessionsVal);
        setSuggestion(sugVal);
        setActiveProgram(activeProgramVal);
      }
    }).catch(() => {
      if (!cancelled) setLoadError("Couldn't load workout data");
    }).finally(() => { if (!cancelled) { setLoading(false); setRefreshing(false); } });
    return () => { cancelled = true; };
  }, [prefsLoading, preferences.selectedModules, reloadKey]));

  // Detected-workout check — independent of the main cache since it's time-sensitive
  useFocusEffect(useCallback(() => {
    let cancelled = false;
    api.getDetectedWorkout()
      .then(async (res: { detected: DetectedWorkout | null }) => {
        if (cancelled || !res?.detected) return;
        const dismissed = await AsyncStorage.getItem(DETECTED_DISMISS_KEY);
        if (cancelled || dismissed === res.detected.start) return;
        setDetected(res.detected);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [reloadKey]));

  async function handleLogDetected() {
    if (!detected || loggingDetected) return;
    setLoggingDetected(true);
    Haptics.selectionAsync().catch(() => {});
    try {
      const session = await api.startExerciseSession({ started_at: detected.start, ended_at: detected.end });
      invalidateCache('exercise:main');
      setDetected(null);
      navigation.navigate('ExerciseSession', { sessionId: session.id });
    } catch {
      toast('Could not log workout');
    } finally {
      setLoggingDetected(false);
    }
  }

  function handleDismissDetected() {
    if (!detected) return;
    AsyncStorage.setItem(DETECTED_DISMISS_KEY, detected.start).catch(() => {});
    setDetected(null);
  }

  function handleOpenProgramMenu() {
    Haptics.selectionAsync().catch(() => {});
    setProgramMenuVisible(true);
  }

  function handleStartRename() {
    if (!activeProgram) return;
    setRenameText(activeProgram.name);
    setRenamingProgram(true);
    setProgramMenuVisible(false);
  }

  async function handleSaveRename() {
    if (!activeProgram) return;
    const next = renameText.trim();
    if (!next || next === activeProgram.name) { setRenamingProgram(false); return; }
    try {
      await api.patchWorkoutProgram(activeProgram.id, { name: next });
      invalidateCache('exercise:main');
      setActiveProgram({ ...activeProgram, name: next });
      setRenamingProgram(false);
    } catch {
      toast("Couldn't rename that plan.", "error");
    }
  }

  function handleDeletePlan() {
    if (!activeProgram) return;
    setProgramMenuVisible(false);
    Alert.alert(
      "Delete this plan?",
      `"${activeProgram.name}" and all its days will be removed. Past workout sessions are not affected.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete", style: "destructive",
          onPress: async () => {
            try {
              await api.deleteWorkoutProgram(activeProgram.id);
              invalidateCache('exercise:main');
              setActiveProgram(null);
              toast("Plan removed.");
            } catch {
              toast("Couldn't delete that plan.", "error");
            }
          },
        },
      ]
    );
  }

  async function handleRestartWizard() {
    setProgramMenuVisible(false);
    try {
      await api.resetWorkoutWizard();
      invalidateCache('exercise:main');
      setWizardDone(false);
    } catch {
      toast("Couldn't restart the wizard.", "error");
    }
  }

  function handleBuildCustom() {
    setProgramMenuVisible(false);
    navigation.navigate('CustomPlanBuilder');
  }

  async function handleBeginWorkout(queue: PlanExercise[]) {
    const session = await api.startExerciseSession();
    invalidateCache('exercise:main');
    setPlannerVisible(false);
    navigation.navigate('ExerciseSession', {
      sessionId: session.id,
      plannedExercises: queue,
    });
  }

  async function handleSelectDay(day: ActiveProgram['days'][0]) {
    setSelectedDay({
      day,
      exercises: day.exercises.map(e => ({ ...e, images: [], primary_muscles: [] })),
    });
    setDayLoading(true);
    try {
      const details = await Promise.all(
        day.exercises.map(e => api.getExerciseDetail(e.exercise_id).catch(() => null))
      );
      setSelectedDay({
        day,
        exercises: day.exercises.map((e, i) => ({
          ...e,
          images: details[i]?.images ?? [],
          primary_muscles: details[i]?.primary_muscles ?? [],
        })),
      });
    } finally {
      setDayLoading(false);
    }
  }

  // Loading state — show spinner while checking wizard status
  if (loading || wizardDone === null) {
    return (
      <View style={[styles.container, { backgroundColor: theme.page, alignItems: 'center', justifyContent: 'center' }]}>
        <ScreenBackground pageId="exercise" />
        <LoadingIndicator />
      </View>
    );
  }

  // Wizard not yet completed — show setup wizard
  if (!wizardDone) {
    return (
      <WorkoutSetupWizard
        onComplete={() => {
          setWizardDone(true);
          api.listWorkoutPrograms()
            .then((progs: any[]) => setActiveProgram((progs ?? []).find((p: any) => p.is_active) ?? null))
            .catch(() => {});
        }}
      />
    );
  }

  // Check if there's an open (unfinished) session
  const openSession = sessions.find((s) => !s.ended_at);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
    <View style={[styles.container, { backgroundColor: theme.page }]}>
      <ScreenBackground pageId="exercise" />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              invalidateCache('exercise:main');
              setRefreshing(true);
              setReloadKey((k) => k + 1);
            }}
            tintColor={theme.teal.solid}
            colors={[theme.teal.solid]}
          />
        }
      >

        {showTooltip && (
          <TooltipBubble
            message="Your workout hub — start a session, follow your program, or review past workouts. Use the wizard to build a program and get daily split suggestions."
            onDismiss={() => setShowTooltip(false)}
          />
        )}
        {loadError ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: theme.teal.tint, borderRadius: 12, borderWidth: 1.5, borderColor: theme.teal.solid, padding: 10, marginBottom: 8 }}>
            <Ionicons name="alert-circle-outline" size={16} color={theme.teal.solid} />
            <Text style={{ color: theme.textSoft, fontSize: 12, flex: 1 }}>{loadError}</Text>
            <Pressable onPress={() => { invalidateCache('exercise:main'); setReloadKey((k) => k + 1); }} hitSlop={8} accessibilityRole="button" accessibilityLabel="Retry loading exercise data">
              <Text style={{ color: theme.teal.solid, fontSize: 12, fontWeight: "800" }}>Retry</Text>
            </Pressable>
          </View>
        ) : null}
        {/* Active session banner — tap the row to continue, tap the X to
            discard the unfinished session (removes it and its log entries). */}
        {openSession && (
          <View style={[styles.activeBanner, { backgroundColor: theme.teal.tint, borderColor: theme.teal.solid }]}>
            <Pressable
              onPress={() => navigation.navigate('ExerciseSession', { sessionId: openSession.id })}
              style={{ flex: 1, flexDirection: "row", alignItems: "center" }}
            >
              <View style={[styles.activeDot, { backgroundColor: theme.teal.solid }]} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.activeBannerTitle, { color: theme.teal.sub }]}>Session in progress</Text>
                <Text style={[styles.activeBannerSub, { color: theme.textSoft }]}>
                  Started {new Date(openSession.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · tap to continue
                </Text>
              </View>
              <Text style={{ color: theme.teal.solid, fontSize: 18 }}>›</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                Alert.alert(
                  "Discard this session?",
                  "The unfinished session and any sets you logged in it will be deleted.",
                  [
                    { text: "Keep it", style: "cancel" },
                    {
                      text: "Discard", style: "destructive",
                      onPress: async () => {
                        try {
                          await api.deleteExerciseSession(openSession.id);
                          invalidateCache('exercise:main');
                          setReloadKey((k) => k + 1);
                          toast("Session discarded.");
                        } catch {
                          toast("Couldn't discard that session.", "error");
                        }
                      },
                    },
                  ]
                );
              }}
              hitSlop={12}
              style={{ paddingHorizontal: 10, paddingVertical: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Discard this unfinished session"
            >
              <Ionicons name="close-circle" size={22} color={theme.coral.solid} />
            </Pressable>
          </View>
        )}

        {/* Start new session button */}
        {!openSession && (
          <Pressable
            onPress={() => { setPlannerInitialQueue([]); setPlannerVisible(true); }}
            style={[styles.startBtn, { backgroundColor: ink, borderColor: ink, shadowColor: "rgba(60,40,20,0.1)" }]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <ThemedIcon slot="ui.run" size={18} color={theme.page} />
              <Text style={[styles.startBtnText, { color: theme.page }]}>Start workout session</Text>
            </View>
          </Pressable>
        )}

        {/* Always-visible plan-creation shortcuts. Users can restart the AI
            wizard or hand-build a plan at any time, whether or not they
            already have an active plan. The overflow menu on the active
            program card still surfaces these too. */}
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable
            onPress={() => { navigation.navigate('CustomPlanBuilder'); }}
            style={({ pressed }) => [
              styles.planShortcut,
              { borderColor: theme.teal.solid, backgroundColor: pressed ? theme.teal.tint : "transparent" },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Build a custom workout plan"
          >
            <Ionicons name="construct-outline" size={16} color={theme.teal.solid} />
            <Text style={[styles.planShortcutText, { color: theme.teal.solid }]}>Build my own plan</Text>
          </Pressable>
          <Pressable
            onPress={handleRestartWizard}
            style={({ pressed }) => [
              styles.planShortcut,
              { borderColor: theme.textSoft, backgroundColor: pressed ? theme.page : "transparent" },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Take the plan quiz"
          >
            <Ionicons name="sparkles-outline" size={16} color={theme.textStrong} />
            <Text style={[styles.planShortcutText, { color: theme.textStrong }]}>Take the plan quiz</Text>
          </Pressable>
        </View>

        {/* Active workout program */}
        {activeProgram && (
          <>
            <SectionLabel text="Your Plan" />
            <ShadowCard padding={14}>
              <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
                <View style={{ flex: 1 }}>
                  {renamingProgram ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <TextInput
                        value={renameText}
                        onChangeText={setRenameText}
                        autoFocus
                        style={{
                          flex: 1, borderWidth: 2, borderColor: ink, borderRadius: 12,
                          paddingHorizontal: 10, paddingVertical: 6, fontSize: 15,
                          fontWeight: "900", color: theme.textStrong,
                        }}
                      />
                      <Pressable onPress={handleSaveRename} hitSlop={8} accessibilityLabel="Save program name">
                        <Ionicons name="checkmark" size={20} color={theme.teal.solid} />
                      </Pressable>
                      <Pressable onPress={() => setRenamingProgram(false)} hitSlop={8} accessibilityLabel="Cancel rename">
                        <Ionicons name="close" size={20} color={theme.textSoft} />
                      </Pressable>
                    </View>
                  ) : (
                    <Text style={[styles.programName, { color: theme.textStrong }]}>{activeProgram.name}</Text>
                  )}
                  <Text style={{ color: theme.textSoft, fontSize: FONT_SIZES.caption, marginBottom: 8 }}>
                    {activeProgram.preferred_minutes} min · {activeProgram.days_per_week} day{activeProgram.days_per_week !== 1 ? 's' : ''}/week
                  </Text>
                </View>
                <Pressable
                  onPress={handleOpenProgramMenu}
                  hitSlop={8}
                  style={{ padding: 4 }}
                  accessibilityRole="button"
                  accessibilityLabel="Plan options"
                >
                  <Ionicons name="ellipsis-horizontal" size={20} color={theme.textSoft} />
                </Pressable>
              </View>
              {(activeProgram.days ?? []).length === 0 ? (
                <GhostRow label="No days in this plan yet" icon="📋" />
              ) : (activeProgram.days ?? []).map((day, i) => (
                <Pressable
                  key={day.id}
                  onPress={() => handleSelectDay(day)}
                  style={[styles.programDay, { borderTopColor: theme.cardBorder ?? '#E5E7EB', borderTopWidth: i === 0 ? 0 : 1 }]}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <View style={[styles.dayBadge, { backgroundColor: theme.teal?.solid ?? ink }]}>
                      <Text style={{ color: '#fff', fontWeight: '800', fontSize: 11 }}>D{day.day_number}</Text>
                    </View>
                    <Text style={{ color: theme.textStrong, fontWeight: '700', fontSize: 13 }}>
                      {FOCUS_LABEL[day.focus] ?? day.focus}
                    </Text>
                  </View>
                  <Text style={{ color: theme.textSoft, fontSize: 12, lineHeight: 17 }} numberOfLines={2}>
                    {(day.exercises ?? []).map((e) => e.name).join(' · ')}
                  </Text>
                  <Text style={{ color: theme.teal.sub, fontSize: FONT_SIZES.caption, fontWeight: '700', marginTop: 4 }}>Tap to preview ›</Text>
                </Pressable>
              ))}
            </ShadowCard>
          </>
        )}

        {/* Detected workout card — sustained elevated HR with no logged session */}
        {detected && (
          <ShadowCard padding={14} accent={theme.berry.solid}>
            <View style={styles.suggestionHeader}>
              <ThemedIcon slot="metric.heart" size={22} style={styles.suggestionIcon as any} />
              <Text style={[styles.suggestionTitle, { color: theme.textStrong }]}>Workout detected</Text>
            </View>
            <Text style={[styles.suggestionBody, { color: theme.textSoft }]}>
              Your heart rate was elevated {formatClock(detected.start)}–{formatClock(detected.end)} ({detected.duration_minutes} min, avg {detected.avg_bpm} bpm, peak {detected.peak_bpm}). Want to log what you did?
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable
                onPress={handleLogDetected}
                disabled={loggingDetected}
                style={[styles.suggestionCta, { borderColor: ink, opacity: loggingDetected ? 0.5 : 1 }]}
                accessibilityRole="button"
                accessibilityLabel="Log detected workout"
              >
                <Text style={[styles.suggestionCtaText, { color: ink }]}>{loggingDetected ? 'Logging…' : 'Log workout'}</Text>
              </Pressable>
              <Pressable
                onPress={handleDismissDetected}
                style={[styles.suggestionCta, { borderColor: theme.cardBorder }]}
                accessibilityRole="button"
                accessibilityLabel="Dismiss detected workout"
              >
                <Text style={[styles.suggestionCtaText, { color: theme.textSoft }]}>Dismiss</Text>
              </Pressable>
            </View>
          </ShadowCard>
        )}

        {/* Suggestion card */}
        {suggestion && (
          <ShadowCard padding={14}>
            <View style={styles.suggestionHeader}>
              <ThemedIcon slot={suggestionSlot(suggestion.type)} size={22} style={styles.suggestionIcon as any} />
              <Text style={[styles.suggestionTitle, { color: theme.textStrong }]}>{suggestion.title}</Text>
            </View>
            <Text style={[styles.suggestionBody, { color: theme.textSoft }]}>{suggestion.body}</Text>
            {suggestion.cta && (
              <Pressable
                onPress={() => { setPlannerInitialQueue([]); setPlannerVisible(true); }}
                style={[styles.suggestionCta, { borderColor: ink }]}
              >
                <Text style={[styles.suggestionCtaText, { color: ink }]}>{suggestion.cta}</Text>
              </Pressable>
            )}
          </ShadowCard>
        )}

        {/* Sessions history */}
        {loading ? (
          <View style={styles.center}><LoadingIndicator /></View>
        ) : sessions.filter((s) => s.ended_at).length === 0 ? (
          <ExerciseEmptyState onPress={() => { setPlannerInitialQueue([]); setPlannerVisible(true); }} />
        ) : (
          <>
            <SectionLabel text="Recent Sessions" />
            {sessions.filter((s) => s.ended_at).map((session) => {
              const isEmpty = session.entry_count === 0 && session.duration_seconds < 30;
              if (isEmpty) {
                return (
                  <GhostRow
                    key={session.id}
                    label={`${formatDate(session.started_at)} · empty session`}
                    action={{
                      label: "Delete",
                      onPress: async () => {
                        const prev = sessions;
                        setSessions((cur) => cur.filter((s) => s.id !== session.id));
                        try {
                          await api.deleteExerciseSession(session.id);
                          invalidateCache('exercise:main');
                          toast("Session removed.");
                        } catch {
                          setSessions(prev);
                          toast("Couldn't delete that session.", "error");
                        }
                      },
                    }}
                  />
                );
              }
              return (
              <ShadowCard key={session.id} padding={14}>
                <Pressable
                  onPress={() => navigation.navigate('ExerciseDetail', { sessionId: session.id })}
                  style={{ flex: 1 }}
                  accessibilityRole="button"
                  accessibilityLabel={`View session from ${formatDate(session.started_at)}`}
                >
                  <View style={styles.sessionCardRow}>
                    <Text style={[styles.sessionDate, { color: theme.textStrong }]}>
                      {formatDate(session.started_at)}
                    </Text>
                    <Text style={[styles.sessionDuration, { color: theme.textSoft }]}>
                      {formatDuration(session.duration_seconds)}
                    </Text>
                  </View>
                  {session.exercise_names && session.exercise_names.length > 0 && (
                    <Text style={[styles.sessionExercises, { color: theme.textSoft }]} numberOfLines={1}>
                      {session.exercise_names.slice(0, 3).join(' · ')}
                      {session.exercise_names.length > 3 ? ` +${session.exercise_names.length - 3}` : ''}
                    </Text>
                  )}
                  <View style={styles.sessionCardRow}>
                    <Text style={[styles.sessionCount, { color: theme.teal.fg }]}>
                      {session.entry_count} exercise{session.entry_count !== 1 ? 's' : ''}
                    </Text>
                    <Pressable
                      onPress={() => {
                        Alert.alert(
                          "Delete this workout?",
                          `${formatDate(session.started_at)} and all its logged sets will be removed.`,
                          [
                            { text: "Cancel", style: "cancel" },
                            {
                              text: "Delete", style: "destructive",
                              onPress: async () => {
                                const prev = sessions;
                                setSessions((cur) => cur.filter((s) => s.id !== session.id));
                                try {
                                  await api.deleteExerciseSession(session.id);
                                  invalidateCache('exercise:main');
                                  toast("Workout deleted.");
                                } catch {
                                  setSessions(prev);
                                  toast("Couldn't delete that session.", "error");
                                }
                              },
                            },
                          ]
                        );
                      }}
                      hitSlop={12}
                      style={{ padding: 6 }}
                      accessibilityRole="button"
                      accessibilityLabel={`Delete workout from ${formatDate(session.started_at)}`}
                    >
                      <Ionicons name="trash-outline" size={16} color={theme.textSoft} />
                    </Pressable>
                  </View>
                </Pressable>
              </ShadowCard>
              );
            })}
          </>
        )}
      </ScrollView>

      <WorkoutPlannerModal
        visible={plannerVisible}
        onClose={() => setPlannerVisible(false)}
        onBegin={handleBeginWorkout}
        initialQueue={plannerInitialQueue}
      />

      {/* Plan overflow menu */}
      <Modal visible={programMenuVisible} transparent animationType="fade" onRequestClose={() => setProgramMenuVisible(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }} onPress={() => setProgramMenuVisible(false)}>
          <Pressable onPress={(e) => e.stopPropagation()} style={{ backgroundColor: theme.card, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 2, borderBottomWidth: 0, borderColor: theme.cardBorder, padding: 12, gap: 4 }}>
            <Text style={{ color: theme.textSoft, fontSize: 11, fontWeight: "800", letterSpacing: 1, textAlign: "center", paddingVertical: 8 }}>PLAN OPTIONS</Text>
            {[
              { label: "Rename plan", icon: "create-outline" as const, onPress: handleStartRename },
              { label: "Build my own plan", icon: "construct-outline" as const, onPress: handleBuildCustom },
              { label: "Start over with the wizard", icon: "sparkles-outline" as const, onPress: handleRestartWizard },
              { label: "Delete this plan", icon: "trash-outline" as const, onPress: handleDeletePlan, danger: true },
            ].map((row) => (
              <Pressable
                key={row.label}
                onPress={row.onPress}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  paddingVertical: 14,
                  paddingHorizontal: 12,
                  borderRadius: 12,
                  backgroundColor: pressed ? theme.page : "transparent",
                })}
                accessibilityRole="button"
                accessibilityLabel={row.label}
              >
                <Ionicons name={row.icon} size={20} color={row.danger ? theme.coral.solid : theme.textStrong} />
                <Text style={{ color: row.danger ? theme.coral.solid : theme.textStrong, fontSize: 15, fontWeight: "600" }}>{row.label}</Text>
              </Pressable>
            ))}
            <Pressable onPress={() => setProgramMenuVisible(false)} style={{ paddingVertical: 12, alignItems: "center" }}>
              <Text style={{ color: theme.textSoft, fontSize: 14, fontWeight: "700" }}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={!!selectedDay}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelectedDay(null)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.page }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: theme.cardBorder }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 22, fontWeight: '900', color: theme.textStrong }}>
                {FOCUS_LABEL[selectedDay?.day.focus ?? ''] ?? selectedDay?.day.focus ?? ''}
              </Text>
              <Text style={{ fontSize: 13, color: theme.textSoft, marginTop: 2 }}>
                Day {selectedDay?.day.day_number} · {selectedDay?.exercises.length} exercise{selectedDay?.exercises.length !== 1 ? 's' : ''}
              </Text>
            </View>
            <Pressable onPress={() => setSelectedDay(null)} hitSlop={12}>
              <Text style={{ fontSize: 20, color: theme.textSoft }}>✕</Text>
            </Pressable>
          </View>

          {dayLoading && !selectedDay?.exercises.some(e => e.images.length > 0) ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><LoadingIndicator /></View>
          ) : (
            <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 110 }} showsVerticalScrollIndicator={false}>
              {selectedDay?.exercises.map((ex, i) => (
                <View key={ex.exercise_id} style={{ backgroundColor: theme.card, borderRadius: 22, borderWidth: 2, borderColor: theme.cardBorder, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 3 }}>
                  {ex.images.length > 0 ? (
                    <CyclingImage images={ex.images} style={{ width: '100%', height: 220 }} />
                  ) : (
                    <View style={{ width: '100%', height: 220, backgroundColor: theme.teal.tint, alignItems: 'center', justifyContent: 'center' }}>
                      {dayLoading ? <LoadingIndicator /> : <ThemedIcon slot="ui.gym" size={48} />}
                    </View>
                  )}
                  <View style={{ padding: 14, gap: 4 }}>
                    <Text style={{ fontSize: 17, fontWeight: '800', color: theme.textStrong }}>{ex.name}</Text>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: theme.teal.solid }}>
                      {ex.sets} sets · {ex.rep_range_min}–{ex.rep_range_max} reps
                    </Text>
                    {ex.primary_muscles.length > 0 && (
                      <Text style={{ fontSize: 13, color: theme.textSoft, textTransform: 'capitalize' }}>
                        {ex.primary_muscles.slice(0, 3).join(', ')}
                      </Text>
                    )}
                  </View>
                </View>
              ))}
            </ScrollView>
          )}

          {/* Start button pinned to bottom */}
          <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, paddingBottom: 28, backgroundColor: theme.page, borderTopWidth: 1, borderTopColor: theme.cardBorder }}>
            <Pressable
              onPress={() => {
                const dayExercises: PlanExercise[] = (selectedDay?.exercises ?? []).map(e => ({
                  id: e.exercise_id,
                  name: e.name,
                  category: '',
                  equipment: null,
                  primary_muscles: e.primary_muscles,
                  images: e.images,
                }));
                setSelectedDay(null);
                setPlannerInitialQueue(dayExercises);
                setPlannerVisible(true);
              }}
              style={{ backgroundColor: ink, borderRadius: 26, borderWidth: 2, borderColor: ink, paddingVertical: 16, alignItems: 'center', shadowColor: 'rgba(60,40,20,0.1)', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.12, shadowRadius: 14, elevation: 4 }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <ThemedIcon slot="ui.run" size={18} color={theme.page} />
                <Text style={{ color: theme.page, fontSize: 16, fontWeight: '800' }}>Start this workout</Text>
              </View>
            </Pressable>
          </View>
        </SafeAreaView>
      </Modal>
      <FeatureIntroSheet intro={exerciseIntro} visible={introVisible} onClose={dismissIntro} />
    </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  planShortcut: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  planShortcutText: { fontSize: 13, fontWeight: "700" },
  activeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 26,
    borderWidth: 2,
  },
  activeDot: { width: 10, height: 10, borderRadius: 5 },
  activeBannerTitle: { fontSize: 14, fontWeight: '700' },
  activeBannerSub: { fontSize: 12, marginTop: 2 },
  startBtn: {
    borderRadius: 26,
    borderWidth: 2,
    paddingVertical: 16,
    alignItems: 'center',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 4,
  },
  startBtnText: { fontSize: 16, fontWeight: '900', letterSpacing: -0.3 },
  center: { paddingTop: 40, alignItems: 'center' },
  empty: { paddingTop: 48, alignItems: 'center', gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: '800' },
  emptySub: { fontSize: 14, textAlign: 'center' },
  sectionLabel: { fontSize: FONT_SIZES.micro, fontWeight: '900', letterSpacing: 0.6, marginTop: 4, textTransform: 'uppercase' },
  suggestionCard: {
    borderRadius: 26,
    borderWidth: 2,
    padding: 14,
    gap: 8,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 4,
  },
  suggestionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  suggestionIcon: { fontSize: 20 },
  suggestionTitle: { fontSize: FONT_SIZES.subheading, fontWeight: '800', flex: 1 },
  suggestionBody: { fontSize: FONT_SIZES.body, lineHeight: 20 },
  suggestionCta: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 2,
  },
  suggestionCtaText: { fontSize: 13, fontWeight: '700' },
  sessionCard: {
    borderRadius: 26,
    borderWidth: 2,
    padding: 14,
    gap: 6,
    shadowColor: "rgba(60,40,20,0.1)",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  sessionCardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sessionDate: { fontSize: FONT_SIZES.subheading, fontWeight: '800' },
  sessionDuration: { fontSize: FONT_SIZES.body },
  sessionExercises: { fontSize: FONT_SIZES.body },
  sessionCount: { fontSize: FONT_SIZES.label, fontWeight: '700' },
  programCard: {
    borderRadius: 26,
    borderWidth: 2,
    padding: 14,
    shadowColor: "rgba(60,40,20,0.1)",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  programName: { fontSize: FONT_SIZES.subheading, fontWeight: '900', marginBottom: 2 },
  programDay: { paddingTop: 8, marginTop: 6 },
  dayBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
});
