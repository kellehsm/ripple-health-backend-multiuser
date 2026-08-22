import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemedIcon } from '../../theme/iconRegistry';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { api } from '../../api/client';
import { ShadowCard } from '../../components/ShadowCard';
import { getWeekStart, todayStr } from '../../utils/dateUtils';
import { softenInsight } from '../../lib/softenInsight';
import { SubTab, Medication, CycleLog, Prediction, nextDoseCallout, getPhaseLabel } from './shared';

// Locally dismissed cycle/adherence insight IDs — persisted per-device so a
// dismissed observation doesn't come back on every screen focus. The
// backend-side /cycle/overview-insight is computed dynamically, so there's
// no server-side dismissed flag to lean on.
const DISMISSED_KEY = 'ripple.cycleInsight.dismissed';
async function loadDismissedIds(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(DISMISSED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch { return new Set(); }
}
async function saveDismissedId(id: string): Promise<void> {
  try {
    const cur = Array.from(await loadDismissedIds());
    if (!cur.includes(id)) {
      cur.push(id);
      // Cap so this can't grow unbounded — 200 ids covers years of variety
      await AsyncStorage.setItem(DISMISSED_KEY, JSON.stringify(cur.slice(-200)));
    }
  } catch {}
}

export function OverviewBlocks({
  onNavigate,
  activeSubTab,
  theme,
  hiddenSections,
}: {
  onNavigate: (t: SubTab) => void;
  activeSubTab: SubTab;
  theme: any;
  hiddenSections: string[];
}) {
  const [medications, setMedications] = useState<Medication[]>([]);
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [weekSymptomCount, setWeekSymptomCount] = useState(0);
  const [insight, setInsight] = useState<{ id: string; text: string; confidence: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(() => {
    const weekStart = getWeekStart();
    const today = todayStr();
    return Promise.all([
      api.getMedications().catch(() => [] as Medication[]),
      api.getCyclePrediction().catch(() => null),
      api.getCycleLogs(weekStart, today).catch(() => []),
      api.getHealthOverviewInsight().catch(() => null),
    ]).then(async ([meds, pred, weekLogs, ins]) => {
      setMedications((meds as Medication[]) ?? []);
      setPrediction(pred);
      // count unique symptoms across all logs this week
      const symptomSet = new Set<string>();
      for (const log of (weekLogs as CycleLog[])) {
        for (const s of (log.symptoms ?? [])) symptomSet.add(s);
      }
      setWeekSymptomCount(symptomSet.size);
      // Filter out anything the user has already swiped away locally.
      const dismissed = await loadDismissedIds();
      const insCand = ins as { id: string; text: string; confidence: string } | null;
      setInsight(insCand && !dismissed.has(insCand.id) ? insCand : null);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const todayDow = new Date().getDay(); // 0=Sun,1=Mon,...,6=Sat
  const scheduledMeds = medications.filter((m) => {
    if (m.is_prn) return false;
    if (m.frequency === 'weekly') return m.day_of_week === todayDow;
    return true;
  });
  const totalSlots = scheduledMeds.reduce((acc, m) => acc + m.slots.length, 0);
  const takenSlots = scheduledMeds.reduce((acc, m) => acc + m.slots.filter((s) => s.dose_log !== null).length, 0);

  const hasPrn = medications.some((m) => m.is_prn && m.active);
  const medSummaryLine = totalSlots === 0
    ? (hasPrn ? 'No scheduled doses' : 'No schedule')
    : `${takenSlots} of ${totalSlots} taken`;
  const nextDose = nextDoseCallout(scheduledMeds);
  const overdueRefillCount = medications.filter((m) => m.active && m.refill_date && (new Date(m.refill_date).getTime() - Date.now()) / 86400000 <= 0).length;

  const cycleDayLine = prediction?.currentCycleDay
    ? `Day ${prediction.currentCycleDay}`
    : 'Log to start';
  const cyclePhase = prediction?.currentCycleDay
    ? getPhaseLabel(prediction.currentCycleDay)
    : '';
  const cycleProgressLine = (() => {
    if (!prediction || prediction.confidence !== 'none') return null;
    const logged = (prediction as any).cyclesLogged ?? 0;
    const needed = (prediction as any).cyclesNeeded ?? 2;
    if (logged === 0) return `Log ${needed} cycles to unlock predictions`;
    if (logged < needed) return `${needed - logged} more cycle${needed - logged > 1 ? 's' : ''} needed for predictions`;
    return null;
  })();

  const symptomLine = weekSymptomCount > 0
    ? `${weekSymptomCount} this wk`
    : 'None logged';

  if (loading) {
    return (
      <View style={[obStyles.row, { backgroundColor: theme.card, borderColor: theme.cardBorder, shadowColor: "rgba(60,40,20,0.1)" }]}>
        <ActivityIndicator color={theme.teal.solid} style={{ flex: 1, paddingVertical: 24 }} />
      </View>
    );
  }

  return (
    <View style={{ gap: 10 }}>
      <View style={[obStyles.row, { backgroundColor: theme.card, borderColor: theme.cardBorder, shadowColor: "rgba(60,40,20,0.1)" }]}>
        {/* Medication block */}
        <Pressable
          style={({ pressed }) => [obStyles.block, { backgroundColor: activeSubTab === 'medication' ? theme.teal.tint : 'transparent', opacity: pressed ? 0.75 : 1 }]}
          onPress={() => onNavigate('medication')}
          onLongPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            Alert.alert('Medications', 'What would you like to do?', [
              {
                text: 'Mark all morning taken',
                onPress: async () => {
                  try {
                    await api.markSlotTaken('morning');
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                    // Refresh so the "x of y taken" summary reflects the change
                    loadData();
                  } catch {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
                    Alert.alert('Something went wrong', "Couldn't mark morning doses as taken. Try again.");
                  }
                },
              },
              { text: 'Cancel', style: 'cancel' },
            ]);
          }}
          accessibilityRole="button"
          accessibilityLabel={`Medication overview. ${medSummaryLine}.${nextDose ? ` Next dose: ${nextDose}.` : ""}${overdueRefillCount > 0 ? ` ${overdueRefillCount} ${overdueRefillCount === 1 ? "refill" : "refills"} overdue.` : ""}`}
        >
          <ThemedIcon slot="health.meds_block" size={28} style={obStyles.icon as any} />
          <Text style={[obStyles.blockLabel, { color: theme.textStrong }]} allowFontScaling maxFontSizeMultiplier={1.3}>Meds</Text>
          <Text style={[obStyles.blockValue, { color: theme.teal.fg }]} allowFontScaling maxFontSizeMultiplier={1.3}>{medSummaryLine}</Text>
          {nextDose ? (
            <Text style={[obStyles.blockSub, { color: theme.teal.fg, fontWeight: '800' }]} numberOfLines={1} allowFontScaling maxFontSizeMultiplier={1.3}>
              → {nextDose}
            </Text>
          ) : null}
          {overdueRefillCount > 0 ? (
            <View style={{ marginTop: 4, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10, backgroundColor: (theme as any).berry?.bg ?? '#FDEDEC', borderWidth: 1, borderColor: (theme as any).berry?.solid ?? '#C0392B' }}>
              <Text style={{ fontSize: 10, fontWeight: '900', color: (theme as any).berry?.fg ?? '#7A1F3C' }}>
                Refill ×{overdueRefillCount}
              </Text>
            </View>
          ) : null}
        </Pressable>

        {!hiddenSections.includes('cycle_tab') && (
          <View style={[obStyles.divider, { backgroundColor: theme.ink }]} />
        )}

        {/* Cycle block */}
        {!hiddenSections.includes('cycle_tab') && (
        <Pressable
          style={({ pressed }) => [obStyles.block, { backgroundColor: activeSubTab === 'cycle' ? (theme.purple?.tint ?? '#F3EEFF') : 'transparent', opacity: pressed ? 0.75 : 1 }]}
          onPress={() => onNavigate('cycle')}
          accessibilityRole="button"
          accessibilityLabel="Cycle overview"
        >
          <ThemedIcon slot="health.cycle_block" size={28} style={obStyles.icon as any} />
          <Text style={[obStyles.blockLabel, { color: theme.textStrong }]}>Cycle</Text>
          <Text style={[obStyles.blockValue, { color: theme.purple?.fg ?? '#5B21B6' }]}>{cycleDayLine}</Text>
          {cyclePhase ? <Text style={[obStyles.blockSub, { color: theme.textSoft }]}>{cyclePhase}</Text> : null}
          {cycleProgressLine ? <Text style={[obStyles.blockSub, { color: theme.textSoft, fontSize: 9 }]}>{cycleProgressLine}</Text> : null}
        </Pressable>
        )}

        {!hiddenSections.includes('symptoms_tab') && (
          <View style={[obStyles.divider, { backgroundColor: theme.ink }]} />
        )}

        {/* Symptoms block */}
        {!hiddenSections.includes('symptoms_tab') && (
        <Pressable
          style={({ pressed }) => [obStyles.block, { backgroundColor: activeSubTab === 'symptoms' ? (theme.berry?.tint ?? '#FEF0F3') : 'transparent', opacity: pressed ? 0.75 : 1 }]}
          onPress={() => onNavigate('symptoms')}
          accessibilityRole="button"
          accessibilityLabel="Symptoms overview"
        >
          <ThemedIcon slot="health.symptoms_block" size={28} style={obStyles.icon as any} />
          <Text style={[obStyles.blockLabel, { color: theme.textStrong }]}>Symptoms</Text>
          <Text style={[obStyles.blockValue, { color: theme.textSoft }]}>{symptomLine}</Text>
        </Pressable>
        )}
      </View>

      {insight && (
        <ShadowCard size="tile" bg={theme.purple?.tint ?? '#F3EEFF'} accent={theme.purple?.sub ?? '#9B6DFF'} padding={14}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.purple?.fg ?? '#5B21B6', fontSize: 13, fontWeight: '700', lineHeight: 18 }}>
                {softenInsight(insight.text)}
              </Text>
              {insight.confidence === 'tentative' && (
                <Text style={{ color: theme.purple?.sub ?? '#9B6DFF', fontSize: 11, marginTop: 2 }}>
                  Based on limited data — may change as more cycles are logged.
                </Text>
              )}
            </View>
            <Pressable
              onPress={async () => {
                Haptics.selectionAsync().catch(() => {});
                await saveDismissedId(insight.id);
                setInsight(null);
              }}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Dismiss this observation"
            >
              <Ionicons name="close" size={16} color={theme.purple?.sub ?? '#9B6DFF'} />
            </Pressable>
          </View>
        </ShadowCard>
      )}
    </View>
  );
}

const obStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    borderRadius: 26,
    borderWidth: 2.5,
    overflow: 'hidden',
    shadowColor: "rgba(60,40,20,0.1)",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 6,
  },
  block: {
    flex: 1,
    minHeight: 64,
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  divider: { width: 2 },
  icon: { fontSize: 16 },
  blockLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 0.6, textTransform: 'uppercase' },
  blockValue: { fontSize: 11, fontWeight: '700', textAlign: 'center' },
  blockSub: { fontSize: 10, textAlign: 'center' },
});
