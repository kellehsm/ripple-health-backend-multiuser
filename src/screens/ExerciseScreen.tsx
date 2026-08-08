import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Alert, Image, Modal } from 'react-native';
import Svg, { Circle, Rect } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { onSolid } from '../theme/colorUtils';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeContext';
import { ShadowCard } from '../components/ShadowCard';
import { api } from '../api/client';
import { LoadingIndicator } from '../components/LoadingIndicator';
import { WorkoutSetupWizard } from './WorkoutSetupWizard';
import { useTabPreferences } from '../hooks/useTabPreferences';
import { TooltipBubble } from '../components/TooltipBubble';
import { hasSeenTooltip, markTooltipSeen } from '../utils/tooltipSeen';
import { WorkoutPlannerModal, PlanExercise } from '../components/WorkoutPlannerModal';

interface WorkoutSuggestion {
  type: string;
  title: string;
  body: string;
  cta: string | null;
  data: Record<string, any> | null;
}

const SUGGESTION_ICON: Record<string, string> = {
  rest_day: '😴',
  neglected_muscle: '🎯',
  program_gap: '📋',
  preferred_day: '📅',
  consistency_streak: '🔥',
  low_completion: '⏱️',
  no_history: '🏋️',
  generic: '💪',
};

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

function CyclingImage({ images, style }: { images: string[]; style: any }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (images.length <= 1) return;
    const t = setInterval(() => setIdx(i => (i + 1) % images.length), 2000);
    return () => clearInterval(t);
  }, [images.length]);
  if (!images.length) {
    return <View style={[style, { backgroundColor: '#D8F5EB', opacity: 0.5 }]} />;
  }
  return <Image source={{ uri: IMAGE_BASE + images[idx] }} style={style} resizeMode="cover" />;
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
  const ink = theme.ink;

  const [showTooltip, setShowTooltip] = useState(false);
  const [sessions, setSessions] = useState<ExerciseSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [suggestion, setSuggestion] = useState<WorkoutSuggestion | null>(null);
  const [activeProgram, setActiveProgram] = useState<ActiveProgram | null>(null);
  const [plannerVisible, setPlannerVisible] = useState(false);
  const [plannerInitialQueue, setPlannerInitialQueue] = useState<PlanExercise[]>([]);

  // Wizard gate — null = loading, false = show wizard, true = show main screen
  const [wizardDone, setWizardDone] = useState<boolean | null>(null);

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
    setLoading(true);
    Promise.all([
      api.getWorkoutWizardStatus().catch(() => ({ complete: false })),
      api.listExerciseSessions(20, 0).catch(() => []),
      api.getExerciseSuggestion().catch(() => null),
      api.listWorkoutPrograms().catch(() => []),
    ]).then(([status, sessionList, sug, progs]) => {
      if (!cancelled) {
        setWizardDone(status.complete === true);
        setSessions(sessionList ?? []);
        setSuggestion(sug ?? null);
        setActiveProgram((progs as any[]).find((p: any) => p.is_active) ?? null);
      }
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [prefsLoading, preferences.selectedModules]));

  async function handleBeginWorkout(queue: PlanExercise[]) {
    const session = await api.startExerciseSession();
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
    <View style={[styles.container, { backgroundColor: theme.page }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {showTooltip && (
          <TooltipBubble
            message="Your workout hub — start a session, follow your program, or review past workouts. Use the wizard to build a program and get daily split suggestions."
            onDismiss={() => setShowTooltip(false)}
          />
        )}
        {/* Active session banner */}
        {openSession && (
          <Pressable
            onPress={() => navigation.navigate('ExerciseSession', { sessionId: openSession.id })}
            style={[styles.activeBanner, { backgroundColor: theme.teal.tint, borderColor: theme.teal.solid }]}
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
        )}

        {/* Start new session button */}
        {!openSession && (
          <Pressable
            onPress={() => { setPlannerInitialQueue([]); setPlannerVisible(true); }}
            style={[styles.startBtn, { backgroundColor: ink, borderColor: ink, shadowColor: "rgba(60,40,20,0.1)" }]}
          >
            <Text style={[styles.startBtnText, { color: theme.page }]}>🏃 Start workout session</Text>
          </Pressable>
        )}

        {/* Active workout program */}
        {activeProgram && (
          <>
            <Text style={[styles.sectionLabel, { color: theme.textSoft }]}>YOUR PLAN</Text>
            <View style={[styles.programCard, { backgroundColor: theme.card, borderColor: theme.cardBorder, shadowColor: "rgba(60,40,20,0.1)" }]}>
              <Text style={[styles.programName, { color: theme.textStrong }]}>{activeProgram.name}</Text>
              <Text style={{ color: theme.textSoft, fontSize: 12, marginBottom: 8 }}>
                {activeProgram.preferred_minutes} min · {activeProgram.days_per_week} day{activeProgram.days_per_week !== 1 ? 's' : ''}/week
              </Text>
              {(activeProgram.days ?? []).map((day, i) => (
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
                  <Text style={{ color: theme.teal.sub, fontSize: 11, fontWeight: '700', marginTop: 4 }}>Tap to preview ›</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}

        {/* Suggestion card */}
        {suggestion && (
          <View style={[styles.suggestionCard, { backgroundColor: theme.card, borderColor: theme.cardBorder, shadowColor: "rgba(60,40,20,0.1)" }]}>
            <View style={styles.suggestionHeader}>
              <Text style={styles.suggestionIcon}>{SUGGESTION_ICON[suggestion.type] ?? '💪'}</Text>
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
          </View>
        )}

        {/* Sessions history */}
        {loading ? (
          <View style={styles.center}><LoadingIndicator /></View>
        ) : sessions.filter((s) => s.ended_at).length === 0 ? (
          <ExerciseEmptyState onPress={() => { setPlannerInitialQueue([]); setPlannerVisible(true); }} />
        ) : (
          <>
            <Text style={[styles.sectionLabel, { color: theme.textSoft }]}>RECENT SESSIONS</Text>
            {sessions.filter((s) => s.ended_at).map((session) => (
              <Pressable
                key={session.id}
                onPress={() => navigation.navigate('ExerciseDetail', { sessionId: session.id })}
                style={[styles.sessionCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
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
                  <Text style={{ color: theme.textSoft, fontSize: 16 }}>›</Text>
                </View>
              </Pressable>
            ))}
          </>
        )}
      </ScrollView>

      <WorkoutPlannerModal
        visible={plannerVisible}
        onClose={() => setPlannerVisible(false)}
        onBegin={handleBeginWorkout}
        initialQueue={plannerInitialQueue}
      />

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
                <View key={ex.exercise_id} style={{ backgroundColor: theme.card, borderRadius: 22, borderWidth: 2, borderColor: theme.cardBorder, overflow: 'hidden', shadowColor: 'rgba(60,40,20,0.1)', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.10, shadowRadius: 12, elevation: 3 }}>
                  {ex.images.length > 0 ? (
                    <CyclingImage images={ex.images} style={{ width: '100%', height: 220 }} />
                  ) : (
                    <View style={{ width: '100%', height: 220, backgroundColor: theme.teal.tint, alignItems: 'center', justifyContent: 'center' }}>
                      {dayLoading ? <LoadingIndicator /> : <Text style={{ fontSize: 48 }}>🏋️</Text>}
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
              <Text style={{ color: theme.page, fontSize: 16, fontWeight: '800' }}>🏃 Start this workout</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
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
  sectionLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 0.6, marginTop: 4, textTransform: 'uppercase' },
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
  suggestionTitle: { fontSize: 14, fontWeight: '800', flex: 1 },
  suggestionBody: { fontSize: 13, lineHeight: 19 },
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
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.10,
    shadowRadius: 12,
    elevation: 3,
  },
  sessionCardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sessionDate: { fontSize: 16, fontWeight: '800' },
  sessionDuration: { fontSize: 13 },
  sessionExercises: { fontSize: 13 },
  sessionCount: { fontSize: 12, fontWeight: '700' },
  programCard: {
    borderRadius: 26,
    borderWidth: 2,
    padding: 14,
    shadowColor: "rgba(60,40,20,0.1)",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 4,
  },
  programName: { fontSize: 15, fontWeight: '900', marginBottom: 2 },
  programDay: { paddingTop: 8, marginTop: 6 },
  dayBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
});
