import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Alert } from 'react-native';
import { api } from '../../api/client';
import { fmtDate, todayStr } from '../../utils/dateUtils';
import { CycleLog, Prediction, getPhaseLabel } from './shared';
import { MonthCalendar } from './MonthCalendar';
import { CycleDayLogModal } from './CycleDayLogModal';
import { CycleHero, PhaseGuideCard } from './CycleHero';
import { CycleInsights } from './CycleInsights';

export function CycleView({ theme }: { theme: any }) {
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [history, setHistory] = useState<Array<{ start: string; end: string; length_days: number }>>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedLog, setSelectedLog] = useState<CycleLog | null>(null);
  const [logModalDate, setLogModalDate] = useState<string | null>(null);
  const [logModalLog, setLogModalLog] = useState<CycleLog | null>(null);
  const [calRefresh, setCalRefresh] = useState(0);
  const [instructionDismissed, setInstructionDismissed] = useState<boolean | null>(null);
  const [topSymptoms, setTopSymptoms] = useState<string[]>([]);
  const [todayLog, setTodayLog] = useState<CycleLog | null>(null);
  const [savingQuick, setSavingQuick] = useState(false);

  useEffect(() => {
    api.getCyclePrediction().then((res: any) => setPrediction(res)).catch(() => {});
    api.getCycleLog(todayStr()).then((log: any) => setTodayLog(log ?? null)).catch(() => setTodayLog(null));
    api.getCycleHistory().then((res: any) => setHistory(res ?? [])).catch(() => {});
    api.getCycleInstructionCardStatus().then((res: any) => setInstructionDismissed(res?.dismissed ?? false)).catch(() => setInstructionDismissed(false));
    api.getRankedSymptoms().then((res: any) => {
      const common: string[] = res?.common ?? [];
      setTopSymptoms(common.slice(0, 3));
    }).catch(() => {});
  }, [calRefresh]);

  async function onDayPress(dateStr: string) {
    setSelectedDate(dateStr);
    try {
      const log = await api.getCycleLog(dateStr);
      setSelectedLog(log ?? null);
    } catch {
      setSelectedLog(null);
    }
  }

  async function dismissInstruction() {
    setInstructionDismissed(true);
    try { await api.dismissCycleInstructionCard(); } catch {}
  }

  async function periodStartedToday() {
    setSavingQuick(true);
    try {
      await api.upsertCycleLog({ log_date: todayStr(), flow_intensity: 'medium' });
      setCalRefresh((r) => r + 1);
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed to log');
    } finally {
      setSavingQuick(false);
    }
  }

  const todayHasFlow = !!(todayLog?.flow_intensity && todayLog.flow_intensity !== 'none');

  const today = todayStr();

  // Regularity: check last 3 cycle lengths
  let cycleRegularity: 'Consistent' | 'Irregular' | null = null;
  if (history.length >= 3) {
    const recentLengths = history.slice(-3).map((h) => h.length_days);
    const minL = Math.min(...recentLengths);
    const maxL = Math.max(...recentLengths);
    cycleRegularity = (maxL - minL) <= 3 ? 'Consistent' : 'Irregular';
  }

  const showInsightsCard = (prediction?.cycleLengthsUsed ?? 0) >= 3;

  // Selected day panel data
  const selectedDateLabel = selectedDate
    ? new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : '';

  const isFutureOrNoLog = selectedDate && (selectedDate > today || !selectedLog);

  // Phase for selected date (approximation based on prediction currentCycleDay offset)
  let selectedPhase = '';
  if (selectedDate && prediction?.lastPeriodStart) {
    const dayNum = Math.round((new Date(selectedDate).getTime() - new Date(prediction.lastPeriodStart).getTime()) / 86400000) + 1;
    if (dayNum > 0) selectedPhase = getPhaseLabel(dayNum);
  }

  const currentPhase = prediction?.currentCycleDay != null ? getPhaseLabel(prediction.currentCycleDay) : null;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>
      {/* Cycle hero — day ring, phase, countdown, fertile window */}
      <CycleHero theme={theme} prediction={prediction} />

      {/* Quick actions */}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {!todayHasFlow && (
          <Pressable
            style={[insStyles.quickBtn, { backgroundColor: (theme.berry?.tint ?? theme.cycle.mood), borderColor: theme.berry?.solid ?? '#A62A50' }]}
            disabled={savingQuick}
            onPress={periodStartedToday}
            accessibilityRole="button"
            accessibilityLabel="Log that your period started today"
          >
            <Text style={{ color: theme.berry?.fg ?? '#7A1F3C', fontWeight: '800', fontSize: 13 }}>
              {savingQuick ? 'Saving…' : '🩸 Period started today'}
            </Text>
          </Pressable>
        )}
        <Pressable
          style={[insStyles.quickBtn, { backgroundColor: theme.teal.tint, borderColor: theme.teal.solid }]}
          onPress={() => { setLogModalDate(today); setLogModalLog(todayLog); }}
          accessibilityRole="button"
          accessibilityLabel="Log today's cycle details"
        >
          <Text style={{ color: theme.teal.fg, fontWeight: '800', fontSize: 13 }}>
            {todayHasFlow || todayLog ? '✏️ Edit today' : '📝 Log today'}
          </Text>
        </Pressable>
      </View>

      {/* Instruction card */}
      {instructionDismissed === false && (
        <View style={[insStyles.card, { backgroundColor: theme.teal.tint, borderColor: theme.teal.solid, shadowColor: "rgba(60,40,20,0.1)" }]}>
          <Text style={[insStyles.cardTitle, { color: theme.teal.fg }]}>Getting started with Cycle Tracking</Text>
          <Text style={{ color: theme.teal.fg, fontSize: 13, lineHeight: 19, marginTop: 4 }}>
            Log your flow, symptoms, and mood each day to see predictions and patterns.
          </Text>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
            <Pressable
              style={[insStyles.btn, { borderColor: theme.teal.solid, backgroundColor: theme.card }]}
              onPress={() => Alert.alert('Cycle Tracking', 'Tap any day on the calendar to log flow, symptoms, mood, and energy. After 3+ cycles, you will see period predictions.')}
            >
              <Text style={{ color: theme.teal.fg, fontWeight: '700', fontSize: 13 }}>Learn more</Text>
            </Pressable>
            <Pressable
              style={[insStyles.btn, { borderColor: theme.teal.solid, backgroundColor: theme.teal.solid }]}
              onPress={dismissInstruction}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Dismiss</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Calendar */}
      <MonthCalendar
        key={calRefresh}
        theme={theme}
        onDayPress={onDayPress}
        refreshKey={calRefresh}
      />

      {/* Selected day detail panel */}
      {selectedDate && (
        <View style={[insStyles.panel, { backgroundColor: theme.card, borderColor: theme.cardBorder, shadowColor: "rgba(60,40,20,0.1)" }]}>
          <Text style={[insStyles.panelTitle, { color: theme.textStrong }]}>
            {selectedDateLabel}{selectedPhase ? ` · ${selectedPhase} phase` : ''}
          </Text>

          {isFutureOrNoLog ? (
            <>
              <Text style={{ color: theme.textSoft, fontSize: 13, marginTop: 4 }}>No log for this day.</Text>
              <Pressable
                style={[insStyles.editBtn, { borderColor: theme.ink, backgroundColor: theme.teal.tint }]}
                onPress={() => { setLogModalDate(selectedDate); setLogModalLog(null); }}
              >
                <Text style={{ color: theme.teal.fg, fontWeight: '700', fontSize: 13 }}>Log this day</Text>
              </Pressable>
            </>
          ) : selectedLog ? (
            <>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                {selectedLog.flow_intensity && selectedLog.flow_intensity !== 'none' && (
                  <Text style={[insStyles.tag, { backgroundColor: theme.cycle.period, color: '#7A4A38' }]}>
                    Flow: {selectedLog.flow_intensity}
                  </Text>
                )}
                {selectedLog.mood_label && (
                  <Text style={[insStyles.tag, { backgroundColor: theme.cycle.mood, color: '#7A3850' }]}>
                    Mood: {selectedLog.mood_label}
                  </Text>
                )}
                {selectedLog.energy_level != null && (
                  <Text style={[insStyles.tag, { backgroundColor: theme.cycle.symptom, color: '#2A5A58' }]}>
                    Energy: {selectedLog.energy_level}/10
                  </Text>
                )}
              </View>
              {(selectedLog.symptoms ?? []).length > 0 && (
                <Text style={{ color: theme.textSoft, fontSize: 13, marginTop: 4 }}>
                  Symptoms: {selectedLog.symptoms!.join(', ')}
                </Text>
              )}
              {selectedLog.notes ? (
                <Text style={{ color: theme.textSoft, fontSize: 13, marginTop: 4, fontStyle: 'italic' }}>
                  "{selectedLog.notes}"
                </Text>
              ) : null}
              <Pressable
                style={[insStyles.editBtn, { borderColor: theme.ink, backgroundColor: theme.teal.tint }]}
                onPress={() => { setLogModalDate(selectedDate); setLogModalLog(selectedLog); }}
              >
                <Text style={{ color: theme.teal.fg, fontWeight: '700', fontSize: 13 }}>Edit Entry</Text>
              </Pressable>
            </>
          ) : null}
        </View>
      )}

      {/* Trend, phase patterns, energy curve, this-cycle comparison */}
      <CycleInsights theme={theme} prediction={prediction} history={history} refresh={calRefresh} />

      {/* Phase guide */}
      {currentPhase && <PhaseGuideCard theme={theme} currentPhase={currentPhase} />}

      {/* Cycle insights card */}
      {showInsightsCard && (
        <View style={[insStyles.panel, { backgroundColor: theme.card, borderColor: theme.cardBorder, shadowColor: "rgba(60,40,20,0.1)" }]}>
          <Text style={[insStyles.panelTitle, { color: theme.textStrong }]}>Cycle Insights</Text>
          <View style={{ gap: 6, marginTop: 6 }}>
            {prediction?.avgCycleLength != null && (
              <Text style={{ color: theme.textSoft, fontSize: 13 }}>
                Average cycle: <Text style={{ color: theme.textStrong, fontWeight: '700' }}>{prediction.avgCycleLength} days</Text>
              </Text>
            )}
            {(() => {
              const avgPL = prediction?.avgPeriodLength ?? 5;
              return (
                <Text style={{ color: theme.textSoft, fontSize: 13 }}>
                  Average period: <Text style={{ color: theme.textStrong, fontWeight: '700' }}>{avgPL} days</Text>
                </Text>
              );
            })()}
            {cycleRegularity && (
              <Text style={{ color: theme.textSoft, fontSize: 13 }}>
                Regularity: <Text style={{ color: cycleRegularity === 'Consistent' ? theme.teal.fg : (theme as any).berry?.fg ?? '#7A1F3C', fontWeight: '700' }}>{cycleRegularity}</Text>
              </Text>
            )}
            {topSymptoms.length > 0 && (
              <Text style={{ color: theme.textSoft, fontSize: 13 }}>
                Top symptoms: <Text style={{ color: theme.textStrong, fontWeight: '700' }}>{topSymptoms.join(', ')}</Text>
              </Text>
            )}
            {prediction?.cycleLengthsUsed != null && (
              <Text style={{ color: theme.textSoft, fontSize: 11, marginTop: 2 }}>
                Based on {prediction.cycleLengthsUsed} cycles
              </Text>
            )}
          </View>
        </View>
      )}

      {/* Cycle history */}
      {history.length > 0 && (
        <View style={[insStyles.panel, { backgroundColor: theme.card, borderColor: theme.cardBorder, shadowColor: "rgba(60,40,20,0.1)" }]}>
          <Text style={[insStyles.panelTitle, { color: theme.textStrong }]}>Cycle History</Text>
          {history.slice(0, 6).map((h, i) => (
            <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: 'rgba(0,0,0,0.06)' }}>
              <Text style={{ color: theme.textSoft, fontSize: 13 }}>
                {fmtDate(h.start)} – {fmtDate(h.end)}
              </Text>
              <Text style={{ color: theme.textStrong, fontSize: 13, fontWeight: '700' }}>
                {h.length_days}d
              </Text>
            </View>
          ))}
        </View>
      )}

      {logModalDate && (
        <CycleDayLogModal
          date={logModalDate}
          existingLog={logModalLog}
          theme={theme}
          onClose={() => { setLogModalDate(null); setLogModalLog(null); }}
          onSaved={() => {
            setLogModalDate(null);
            setLogModalLog(null);
            setCalRefresh((r) => r + 1);
            // Re-fetch selected log if same date
            if (selectedDate === logModalDate) {
              api.getCycleLog(logModalDate).then((log: any) => setSelectedLog(log ?? null)).catch(() => setSelectedLog(null));
            }
          }}
        />
      )}
    </ScrollView>
  );
}

const insStyles = StyleSheet.create({
  card: {
    borderRadius: 26,
    borderWidth: 2,
    padding: 16,
    shadowColor: "rgba(60,40,20,0.1)",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 4,
  },
  cardTitle: { fontSize: 14, fontWeight: '800' },
  btn: {
    borderWidth: 2,
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  panel: {
    borderRadius: 26,
    borderWidth: 2,
    padding: 14,
    gap: 4,
    shadowColor: "rgba(60,40,20,0.1)",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 4,
  },
  panelTitle: { fontSize: 14, fontWeight: '800' },
  quickBtn: {
    flex: 1,
    borderWidth: 2,
    borderRadius: 18,
    paddingVertical: 11,
    alignItems: 'center',
    shadowColor: "rgba(60,40,20,0.1)",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 2,
  },
  tag: {
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    overflow: 'hidden',
  },
  editBtn: {
    marginTop: 10,
    borderWidth: 2,
    borderRadius: 16,
    paddingVertical: 9,
    paddingHorizontal: 16,
    alignSelf: 'flex-start',
    shadowColor: "rgba(60,40,20,0.1)",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 2,
  },
});
