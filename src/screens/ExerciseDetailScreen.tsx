import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, Image, Alert, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { toast } from '../lib/toast';
import Svg, { Polyline, Line, Text as SvgText, Rect, Defs, LinearGradient as SvgLinearGradient, Stop, Polygon } from 'react-native-svg';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeContext';
import { ThemedIcon } from '../theme/iconRegistry';
import { api } from '../api/client';
import { LoadingIndicator } from '../components/LoadingIndicator';
import { ShadowCard } from '../components/ShadowCard';
import { formatDuration, entryLabel, suggestNextWeight } from '../utils/exerciseFormatters';

const IMAGE_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';

function CyclingImage({ images, style }: { images: string[]; style: any }) {
  const { theme } = useTheme();
  const [idx, setIdx] = useState(0);
  const isFocused = useIsFocused();
  useEffect(() => {
    if (images.length <= 1 || !isFocused) return;
    const t = setInterval(() => setIdx(i => (i + 1) % images.length), 2000);
    return () => clearInterval(t);
  }, [images.length, isFocused]);
  if (!images.length) {
    return <View style={[style, { backgroundColor: theme.teal.tint, opacity: 0.5 }]} />;
  }
  return <Image source={{ uri: IMAGE_BASE + images[idx] }} style={style} resizeMode="cover" />;
}

const ZONES_BASE = [
  { name: 'very_light', label: 'Very light', color: '#8ED4D8' }, // teal
  { name: 'light',      label: 'Light',      color: '#B092D9' }, // purple
  { name: 'moderate',   label: 'Moderate',   color: '#F2A28C' }, // coral
  { name: 'hard',       label: 'Hard',       color: '#CE7A92' }, // berry
  { name: 'maximum',    label: 'Maximum',    color: null },       // deep berry — use theme.berry.solid
];

function getZones(theme: any) {
  return ZONES_BASE.map(z => ({
    ...z,
    color: z.color ?? theme.berry.solid,
  }));
}

interface HRSummary {
  avg_bpm: number | null;
  peak_bpm: number | null;
  time_in_zone_seconds: Record<string, number>;
  sample_count: number;
}

interface SessionEntry {
  id: string;
  sets: number | null;
  reps: number | null;
  duration_seconds: number | null;
  weight_used: number | null;
  target_rep_range_min: number | null;
  target_rep_range_max: number | null;
  actual_reps_per_set: number[] | null;
  all_sets_maxed: boolean | null;
  exercise: { id: string; name: string; category: string; primary_muscles: string[]; images: string[] };
}

interface SessionDetail {
  id: string;
  started_at: string;
  ended_at: string;
  duration_seconds: number;
  entries: SessionEntry[];
  hr_summary: HRSummary | null;
  hr_samples: Array<{ recorded_at: string; bpm: number }>;
}

// formatDuration / entryLabel now shared via utils/exerciseFormatters

function ZoneBar({ summary, theme }: { summary: HRSummary; theme: any }) {
  const ZONES = getZones(theme);
  const total = ZONES.reduce((sum, z) => sum + (summary.time_in_zone_seconds[z.name] ?? 0), 0);
  if (total === 0) return null;

  return (
    <View style={{ gap: 8 }}>
      {/* Stacked bar */}
      <View style={styles.zoneBar}>
        {ZONES.map((z) => {
          const secs = summary.time_in_zone_seconds[z.name] ?? 0;
          const flex = secs / total;
          if (flex < 0.005) return null;
          return <View key={z.name} style={{ flex, backgroundColor: z.color }} />;
        })}
      </View>

      {/* Legend */}
      <View style={styles.zoneLegend}>
        {ZONES.map((z) => {
          const secs = summary.time_in_zone_seconds[z.name] ?? 0;
          if (secs < 1) return null;
          const mins = Math.round(secs / 60);
          return (
            <View key={z.name} style={styles.zoneLegendItem}>
              <View style={[styles.zoneSwatch, { backgroundColor: z.color }]} />
              <Text style={[styles.zoneLegendText, { color: theme.textSoft }]}>
                {z.label}{mins > 0 ? ` · ${mins}m` : ''}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function HRChart({ samples, theme }: { samples: Array<{ recorded_at: string; bpm: number }>; theme: any }) {
  if (samples.length < 2) return null;

  const W = 320, H = 80;
  const PAD = { top: 8, bottom: 16, left: 28, right: 8 };

  const { points, minBpm, maxBpm, toX, toY, latestBpm } = useMemo(() => {
    const bpms = samples.map((s) => s.bpm);
    const mn = Math.min(...bpms) - 5;
    const mx = Math.max(...bpms) + 5;
    const times = samples.map((s) => new Date(s.recorded_at).getTime());
    const minT = times[0], maxT = times[times.length - 1];
    const chartW = W - PAD.left - PAD.right;
    const chartH = H - PAD.top - PAD.bottom;
    const txFn = (t: number) => PAD.left + ((t - minT) / (maxT - minT || 1)) * chartW;
    const tyFn = (bpm: number) => PAD.top + (1 - (bpm - mn) / (mx - mn || 1)) * chartH;
    const pts = samples.map((s, i) => `${txFn(times[i])},${tyFn(s.bpm)}`).join(' ');
    return { points: pts, minBpm: mn, maxBpm: mx, toX: txFn, toY: tyFn, latestBpm: bpms[bpms.length - 1] ?? 0 };
  }, [samples]);

  const ink = theme.ink;
  const times = useMemo(() => samples.map((s) => new Date(s.recorded_at).getTime()), [samples]);
  const minT = times[0], maxT = times[times.length - 1];

  return (
    <Svg
      width="100%"
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Heart rate chart, latest ${latestBpm} bpm`}
    >
      <Defs>
        <SvgLinearGradient id="exDetailFill" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={ink} stopOpacity="0.30" />
          <Stop offset="1" stopColor={ink} stopOpacity="0.02" />
        </SvgLinearGradient>
      </Defs>
      <Polygon points={`${points} ${toX(maxT)},${H - PAD.bottom} ${toX(minT)},${H - PAD.bottom}`} fill="url(#exDetailFill)" />
      <Polyline points={points} fill="none" stroke={ink} strokeWidth={2.5} />
      <SvgText x={PAD.left - 2} y={PAD.top + 4} fontSize={8} fill={theme.textSoft} textAnchor="end">
        {maxBpm}
      </SvgText>
      <SvgText x={PAD.left - 2} y={H - PAD.bottom} fontSize={8} fill={theme.textSoft} textAnchor="end">
        {Math.round(minBpm)}
      </SvgText>
    </Svg>
  );
}

export function ExerciseDetailScreen() {
  const { theme } = useTheme();
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { sessionId } = route.params as { sessionId: string };
  const ink = theme.ink;

  function handleDeleteSession() {
    Alert.alert(
      "Delete this workout?",
      "This session and all its logged sets will be removed. This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete", style: "destructive",
          onPress: async () => {
            try {
              await api.deleteExerciseSession(sessionId);
              toast("Workout deleted.");
              navigation.goBack();
            } catch {
              toast("Couldn't delete that session.", "error");
            }
          },
        },
      ]
    );
  }

  const [session, setSession] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [showInstructions, setShowInstructions] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    api.getExerciseSession(sessionId)
      .then((data) => { if (!cancelled) setSession(data); })
      .catch(() => { if (!cancelled) setLoadError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [sessionId]));

  if (loading) {
    return (
      <ScrollView contentContainerStyle={styles.content} style={{ backgroundColor: theme.page }}>
        <ShadowCard skeleton skeletonHeight={110} />
        <ShadowCard skeleton skeletonHeight={140} />
        <ShadowCard skeleton skeletonHeight={90} />
        <ShadowCard skeleton skeletonHeight={90} />
      </ScrollView>
    );
  }

  if (!session) {
    return (
      <View style={[styles.center, { backgroundColor: theme.page }]}>
        <Text style={{ color: theme.textSoft }}>
          {loadError ? "Couldn't load that session. Check your connection." : "Session not found."}
        </Text>
      </View>
    );
  }

  const hasHR = session.hr_summary && session.hr_summary.sample_count > 0;
  const hasZones = hasHR && Object.values(session.hr_summary!.time_in_zone_seconds).some((v) => v > 0);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const data = await api.getExerciseSession(sessionId);
      setSession(data);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <ScrollView
      style={{ backgroundColor: theme.page }}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.teal.solid} colors={[theme.teal.solid]} />}
    >
      {/* Header stats */}
      <View style={[styles.headerCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <View style={styles.statRow}>
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: ink }]}>
              {new Date(session.started_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </Text>
            <Text style={[styles.statLabel, { color: theme.textSoft }]}>DATE</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: theme.cardBorder }]} />
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: ink }]}>{formatDuration(session.duration_seconds)}</Text>
            <Text style={[styles.statLabel, { color: theme.textSoft }]}>DURATION</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: theme.cardBorder }]} />
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: ink }]}>{session.entries.length}</Text>
            <Text style={[styles.statLabel, { color: theme.textSoft }]}>EXERCISES</Text>
          </View>
        </View>

        {/* HR stats */}
        {hasHR && (
          <View style={[styles.hrRow, { borderTopColor: theme.cardBorder }]}>
            <View style={styles.stat}>
              <Text style={[styles.statValue, { color: theme.berry.solid }]}>
                {session.hr_summary!.avg_bpm ?? '—'}
              </Text>
              <Text style={[styles.statLabel, { color: theme.textSoft }]}>AVG BPM</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: theme.cardBorder }]} />
            <View style={styles.stat}>
              <Text style={[styles.statValue, { color: theme.coral.solid }]}>
                {session.hr_summary!.peak_bpm ?? '—'}
              </Text>
              <Text style={[styles.statLabel, { color: theme.textSoft }]}>PEAK BPM</Text>
            </View>
          </View>
        )}
      </View>

      {/* Zone bar */}
      {hasZones && (
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <Text style={[styles.sectionLabel, { color: theme.textSoft }]}>TIME IN ZONE</Text>
          <ZoneBar summary={session.hr_summary!} theme={theme} />
        </View>
      )}

      {/* HR chart */}
      {session.hr_samples.length >= 2 && (
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <Text style={[styles.sectionLabel, { color: theme.textSoft }]}>HEART RATE</Text>
          <HRChart samples={session.hr_samples} theme={theme} />
          {!hasZones && (
            <Text style={[styles.noZoneHint, { color: theme.textSoft }]}>
              Add your birthdate in Settings → Preferences to see heart rate zones.
            </Text>
          )}
        </View>
      )}

      {/* Exercise list */}
      <Text style={[styles.sectionLabel, { color: theme.textSoft, marginTop: 4 }]}>EXERCISES LOGGED</Text>
      {session.entries.length === 0 ? (
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder, alignItems: "center", paddingVertical: 20 }]}>
          <ThemedIcon slot="ui.gym" size={28} />
          <Text style={{ color: theme.textStrong, fontSize: 14, fontWeight: "800", marginTop: 6 }}>No exercises logged</Text>
          <Text style={{ color: theme.textSoft, fontSize: 12, marginTop: 4, textAlign: "center" }}>
            This session was saved without individual exercises.
          </Text>
        </View>
      ) : (
        session.entries.map((entry) => (
          <View key={entry.id} style={[styles.exerciseCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <CyclingImage
              images={entry.exercise.images ?? []}
              style={styles.exerciseImage}
            />
            <View style={styles.exerciseCardBody}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.exerciseName, { color: theme.textStrong }]}>{entry.exercise.name}</Text>
                {entry.exercise.primary_muscles.length > 0 && (
                  <Text style={[styles.exerciseMuscles, { color: theme.textSoft }]}>
                    {entry.exercise.primary_muscles.slice(0, 3).join(', ')}
                  </Text>
                )}
                {entry.all_sets_maxed === true && entry.weight_used != null && (
                  <View
                    style={[styles.progressionBadge, { backgroundColor: theme.teal.tint, borderColor: theme.teal.solid }]}
                    accessibilityLabel={`All sets maxed. Try ${suggestNextWeight(entry as any, entry.target_rep_range_max) ?? entry.weight_used + 5} pounds next time.`}
                  >
                    <ThemedIcon slot="ui.trophy" size={15} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.progressionTitle, { color: theme.teal.sub }]} allowFontScaling maxFontSizeMultiplier={1.3}>
                        All sets maxed!
                      </Text>
                      {(() => {
                        const next = suggestNextWeight(entry as any, entry.target_rep_range_max);
                        if (next && next > (entry.weight_used ?? 0)) {
                          return (
                            <Text style={[styles.progressionText, { color: theme.teal.sub }]} allowFontScaling maxFontSizeMultiplier={1.3}>
                              Try {next} lbs next time
                            </Text>
                          );
                        }
                        return (
                          <Text style={[styles.progressionText, { color: theme.teal.sub }]} allowFontScaling maxFontSizeMultiplier={1.3}>
                            Consider adding weight next time
                          </Text>
                        );
                      })()}
                    </View>
                  </View>
                )}
              </View>
              <View style={[styles.exerciseDetailChip, { backgroundColor: theme.teal.tint, borderColor: theme.teal.solid }]}>
                <Text style={[styles.exerciseDetail, { color: theme.teal.sub }]}>{entryLabel(entry)}</Text>
              </View>
            </View>
          </View>
        ))
      )}

      <Pressable
        onPress={handleDeleteSession}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          marginTop: 24,
          marginBottom: 12,
          paddingVertical: 12,
          borderRadius: 16,
          borderWidth: 1.5,
          borderColor: theme.coral.solid,
          backgroundColor: pressed ? theme.coral.tint : "transparent",
        })}
        accessibilityRole="button"
        accessibilityLabel="Delete this workout session"
      >
        <Ionicons name="trash-outline" size={16} color={theme.coral.solid} />
        <Text style={{ color: theme.coral.solid, fontWeight: "700", fontSize: 14 }}>Delete workout</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  headerCard: {
    borderRadius: 26,
    borderWidth: 2,
    overflow: 'hidden',
    shadowColor: "rgba(60,40,20,0.1)",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  statRow: { flexDirection: 'row', padding: 16, gap: 0 },
  hrRow: { flexDirection: 'row', padding: 16, borderTopWidth: 1 },
  stat: { flex: 1, alignItems: 'center', gap: 4 },
  statValue: { fontSize: 20, fontWeight: '900' },
  statLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 0.6, textTransform: 'uppercase' },
  statDivider: { width: 1, marginVertical: 2 },
  card: {
    borderRadius: 26,
    borderWidth: 2,
    padding: 14,
    gap: 12,
    shadowColor: "rgba(60,40,20,0.1)",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  sectionLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 0.6, textTransform: 'uppercase' },
  zoneBar: {
    height: 14,
    borderRadius: 7,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  zoneLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  zoneLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  zoneSwatch: { width: 10, height: 10, borderRadius: 5 },
  zoneLegendText: { fontSize: 11 },
  noZoneHint: { fontSize: 11, lineHeight: 17 },
  exerciseCard: {
    borderRadius: 22,
    borderWidth: 2,
    overflow: 'hidden',
    shadowColor: "rgba(60,40,20,0.1)",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  exerciseImage: { width: '100%', height: 220 },
  exerciseCardBody: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14 },
  exerciseDetailChip: {
    borderRadius: 16,
    borderWidth: 2,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  progressionBadge: {
    alignSelf: 'stretch',
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressionTitle: { fontSize: 13, fontWeight: '900', letterSpacing: 0.2 },
  progressionText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.2, marginTop: 1 },
  exerciseName: { fontSize: 14, fontWeight: '700' },
  exerciseMuscles: { fontSize: 11, textTransform: 'capitalize', marginTop: 2 },
  exerciseDetail: { fontSize: 13, fontWeight: '700' },
  divider: { height: 1, marginVertical: 2 },
});
