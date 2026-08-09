import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  Animated,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { coloredShadow } from '../theme/styleUtils';
import { IconBadge } from '../components/IconBadge';
import { useTabPreferences } from '../hooks/useTabPreferences';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { api } from '../api/client';
import { LongPressActionMenu } from '../components/LongPressActionMenu';
import { SectionEditorModal, SectionDef } from '../components/SectionEditorModal';
import { FeatureTour, TourStep } from '../components/FeatureTour';
import { hasSeenTooltip, markTooltipSeen } from '../utils/tooltipSeen';
import { ShadowCard } from '../components/ShadowCard';
import { addDays, fmtDate, todayStr, getWeekStart } from '../utils/dateUtils';
import { FLOW_OPTIONS, FLOW_COLORS } from '../constants';
import { softenInsight } from '../lib/softenInsight';
import { ChipButton } from '../components/ChipButton';
import { ModalHeader } from '../components/ModalHeader';

const HEALTH_SECTIONS: SectionDef[] = [
  { id: 'cycle_tab',    label: 'Cycle tracking', description: 'Menstrual cycle calendar and logging' },
  { id: 'symptoms_tab', label: 'Symptoms log',   description: 'Daily symptom tracking' },
];

// ─── Sub-tab type ────────────────────────────────────────────────────────────

type SubTab = 'medication' | 'cycle' | 'symptoms';

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface MedSlot {
  id: string;
  time_of_day: string;
  specific_time: string | null;
  sort_order: number;
  dose_log: { id: string; status: string; taken_at: string } | null;
}

interface ColorCategory {
  id: string;
  label: string;
  color_hex: string;
}

interface MedPrescriber {
  id: string;
  name: string;
}

interface Medication {
  id: string;
  name: string;
  brand_name?: string | null;
  generic_name?: string | null;
  dosage: string | null;
  active: boolean;
  notes: string | null;
  purpose: string | null;
  refill_date: string | null;
  created_at: string;
  prescriber: MedPrescriber | null;
  color_category: ColorCategory | null;
  slots: MedSlot[];
  frequency?: "daily" | "weekly";
  day_of_week?: number | null;
  is_prn?: boolean;
}

type MedStatus = 'active' | 'new' | 'expiring' | 'refill_needed';

interface CycleLog {
  id: string;
  log_date: string;
  flow_intensity: string | null;
  symptoms: string[] | null;
  mood_label: string | null;
  notes: string | null;
  energy_level?: number | null;
}

interface Prediction {
  predictedNextStart: string | null;
  avgCycleLength: number | null;
  avgPeriodLength?: number | null;
  cycleLengthsUsed: number;
  confidence: string;
  lastPeriodStart?: string;
  currentCycleDay?: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function computeMedStatus(med: Medication): MedStatus {
  const daysSinceAdded = (Date.now() - new Date(med.created_at).getTime()) / 86400000;
  if (daysSinceAdded < 7) return 'new';
  if (med.refill_date) {
    const daysUntil = (new Date(med.refill_date).getTime() - Date.now()) / 86400000;
    if (daysUntil <= 0) return 'refill_needed';
    if (daysUntil <= 7) return 'expiring';
  }
  return 'active';
}

const STATUS_BADGE: Record<MedStatus, { label: string; bg: string; fg: string }> = {
  active:        { label: 'Active',        bg: 'transparent', fg: 'transparent' },
  new:           { label: 'New',           bg: '#DCFCE7',     fg: '#166534' },
  expiring:      { label: 'Refill soon',   bg: '#FEF9C3',     fg: '#854D0E' },
  refill_needed: { label: 'Refill needed', bg: '#FEE2E2',     fg: '#991B1B' },
};

const TOD_HOUR: Record<string, number> = { morning: 8, midday: 12, evening: 20 };

function nextDoseCallout(medications: Medication[]): string | null {
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  let earliest: { name: string; mins: number } | null = null;

  for (const med of medications) {
    for (const slot of med.slots) {
      if (slot.dose_log !== null) continue;
      let slotMins: number;
      if (slot.specific_time && slot.time_of_day === 'custom') {
        const [hh, mm] = slot.specific_time.split(':').map(Number);
        slotMins = (hh || 0) * 60 + (mm || 0);
      } else {
        slotMins = (TOD_HOUR[slot.time_of_day] ?? 8) * 60;
      }
      if (slotMins >= nowMins && (!earliest || slotMins < earliest.mins)) {
        earliest = { name: med.name, mins: slotMins };
      }
    }
  }

  if (!earliest) return null;
  const diffMins = earliest.mins - nowMins;
  if (diffMins < 60) return `${earliest.name} in ${diffMins} min`;
  const h = Math.floor(diffMins / 60);
  const m = diffMins % 60;
  return m > 0 ? `${earliest.name} in ${h}h ${m}m` : `${earliest.name} in ${h}h`;
}




function getPhaseLabel(cycleDay: number): string {
  if (cycleDay <= 5) return 'Menstrual';
  if (cycleDay <= 11) return 'Follicular';
  if (cycleDay <= 16) return 'Ovulatory';
  return 'Luteal';
}

// ─── OverviewBlocks ──────────────────────────────────────────────────────────

function OverviewBlocks({
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

  useEffect(() => {
    const weekStart = getWeekStart();
    const today = todayStr();
    Promise.all([
      api.getMedications().catch(() => [] as Medication[]),
      api.getCyclePrediction().catch(() => null),
      api.getCycleLogs(weekStart, today).catch(() => []),
      api.getHealthOverviewInsight().catch(() => null),
    ]).then(([meds, pred, weekLogs, ins]) => {
      setMedications((meds as Medication[]) ?? []);
      setPrediction(pred);
      // count unique symptoms across all logs this week
      const symptomSet = new Set<string>();
      for (const log of (weekLogs as CycleLog[])) {
        for (const s of (log.symptoms ?? [])) symptomSet.add(s);
      }
      setWeekSymptomCount(symptomSet.size);
      setInsight(ins);
    }).finally(() => setLoading(false));
  }, []);

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
                  try { await api.markSlotTaken('morning'); } catch {}
                },
              },
              { text: 'Cancel', style: 'cancel' },
            ]);
          }}
          accessibilityRole="button"
          accessibilityLabel={`Medication overview. ${medSummaryLine}.${nextDose ? ` Next dose: ${nextDose}.` : ""}${overdueRefillCount > 0 ? ` ${overdueRefillCount} ${overdueRefillCount === 1 ? "refill" : "refills"} overdue.` : ""}`}
        >
          <Text style={obStyles.icon}>💊</Text>
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
          <Text style={obStyles.icon}>🌸</Text>
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
          <Text style={obStyles.icon}>📝</Text>
          <Text style={[obStyles.blockLabel, { color: theme.textStrong }]}>Symptoms</Text>
          <Text style={[obStyles.blockValue, { color: theme.textSoft }]}>{symptomLine}</Text>
        </Pressable>
        )}
      </View>

      {insight && (
        <ShadowCard size="tile" bg={theme.purple?.tint ?? '#F3EEFF'} accent={theme.purple?.sub ?? '#9B6DFF'} rotate={0.5} padding={14}>
          <Text style={{ color: theme.purple?.fg ?? '#5B21B6', fontSize: 13, fontWeight: '700', lineHeight: 18 }}>
            {softenInsight(insight.text)}
          </Text>
          {insight.confidence === 'tentative' && (
            <Text style={{ color: theme.purple?.sub ?? '#9B6DFF', fontSize: 11, marginTop: 2 }}>
              Based on limited data — may change as more cycles are logged.
            </Text>
          )}
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
  insightBanner: {
    borderRadius: 22,
    borderWidth: 2,
    padding: 14,
    gap: 2,
  },
});

// ─── AddMedicationModal ───────────────────────────────────────────────────────

function AddMedicationModal({
  theme,
  onClose,
  onSaved,
  initialValues,
  editId,
}: {
  theme: any;
  onClose: () => void;
  onSaved: () => void;
  initialValues?: {
    name: string;
    dosage: string;
    purpose: string;
    notes: string;
    prescriberName: string;
    refillDate: string;
    selectedCatId: string | null;
    selectedTimes: string[];
    customTime: string;
    frequency?: "daily" | "weekly";
    dayOfWeek?: number | null;
    isPrn?: boolean;
  };
  editId?: string;
}) {
  const ink = theme.ink;
  const isEdit = !!editId;

  const [name, setName] = useState(initialValues?.name ?? '');
  const [dosage, setDosage] = useState(initialValues?.dosage ?? '');
  const [notes, setNotes] = useState(initialValues?.notes ?? '');
  const [purpose, setPurpose] = useState(initialValues?.purpose ?? '');
  const [refillDate, setRefillDate] = useState(initialValues?.refillDate ?? '');
  const [prescriberName, setPrescriberName] = useState(initialValues?.prescriberName ?? '');
  const [selectedCatId, setSelectedCatId] = useState<string | null>(initialValues?.selectedCatId ?? null);
  const [categories, setCategories] = useState<ColorCategory[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selectedTimes, setSelectedTimes] = useState<string[]>(initialValues?.selectedTimes ?? []);
  const [customTime, setCustomTime] = useState(initialValues?.customTime ?? '');
  const [saving, setSaving] = useState(false);
  const [brandName, setBrandName] = useState('');
  const [genericName, setGenericName] = useState('');
  const [frequency, setFrequency] = useState<"daily" | "weekly">(initialValues?.frequency ?? "daily");
  const [dayOfWeek, setDayOfWeek] = useState<number | null>(initialValues?.dayOfWeek ?? null);
  const [isPrn, setIsPrn] = useState(initialValues?.isPrn ?? false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    api.getMedicationCategories().then(setCategories).catch(() => {});
  }, []);

  function onNameChange(text: string) {
    setName(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (text.length >= 2) {
        try { setSuggestions((await api.searchMedicationNames(text)).slice(0, 5)); }
        catch { setSuggestions([]); }
      } else setSuggestions([]);
    }, 250);
  }

  function toggleTime(t: string) {
    setSelectedTimes((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]);
  }

  async function save() {
    if (!name.trim()) return Alert.alert('Name required');
    setSaving(true);
    try {
      const slots = selectedTimes.map((t) => ({
        time_of_day: t,
        specific_time: t === 'custom' ? customTime || null : null,
      }));
      let prescriber_id: string | null = null;
      if (prescriberName.trim()) {
        const existing = (await api.getMedicationPrescribers()) as MedPrescriber[];
        const found = existing.find((p) => p.name.toLowerCase() === prescriberName.trim().toLowerCase());
        if (found) { prescriber_id = found.id; }
        else { const p = await api.addMedicationPrescriber({ name: prescriberName.trim() }); prescriber_id = p?.id ?? null; }
      }

      const payload = {
        name: name.trim(),
        dosage: dosage.trim() || null,
        notes: notes.trim() || null,
        purpose: purpose.trim() || null,
        refill_date: refillDate.trim() || null,
        color_category_id: selectedCatId,
        prescriber_id,
        slots: isPrn ? [] : slots,
        brand_name: brandName.trim() || null,
        generic_name: genericName.trim() || null,
        frequency,
        day_of_week: frequency === 'weekly' ? dayOfWeek : null,
        is_prn: isPrn,
      };

      if (isEdit && editId) {
        await api.updateMedication(editId, payload);
      } else {
        await api.addMedication(payload);
      }
      onSaved();
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <View style={modalStyles.overlay}>
        <View style={[modalStyles.sheet, { backgroundColor: theme.card, borderColor: ink }]}>
          <View style={modalStyles.header}>
            <Text style={[modalStyles.title, { color: theme.textStrong }]}>
              {isEdit ? 'Edit Medication' : 'Add Medication'}
            </Text>
            <Pressable onPress={onClose}><Text style={{ color: theme.textSoft, fontSize: 22 }}>✕</Text></Pressable>
          </View>
          <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 20 }} keyboardShouldPersistTaps="handled">
            <View>
              <TextInput
                style={[modalStyles.input, { borderColor: ink, color: theme.textStrong, backgroundColor: theme.page }]}
                placeholder="Medication name"
                placeholderTextColor={theme.textSoft}
                value={name}
                onChangeText={onNameChange}
              />
              {suggestions.length > 0 && (
                <View style={[modalStyles.suggestions, { backgroundColor: theme.card, borderColor: ink }]}>
                  {suggestions.map((s) => (
                    <Pressable key={s} style={[modalStyles.suggRow, { borderBottomColor: theme.cardBorder }]}
                      onPress={async () => {
                        setName(s);
                        setSuggestions([]);
                        try {
                          const rxData = await api.getMedicationRxNormByName(s);
                          if (rxData?.brand_name) setBrandName(rxData.brand_name);
                          if (rxData?.generic_name) setGenericName(rxData.generic_name);
                        } catch { /* best-effort */ }
                      }}>
                      <Text style={{ color: theme.textStrong, fontSize: 14 }}>{s}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
            <TextInput style={[modalStyles.input, { borderColor: ink, color: theme.textStrong, backgroundColor: theme.page }]}
              placeholder="Brand name (optional)" placeholderTextColor={theme.textSoft} value={brandName} onChangeText={setBrandName} />
            <TextInput style={[modalStyles.input, { borderColor: ink, color: theme.textStrong, backgroundColor: theme.page }]}
              placeholder="Generic name (optional)" placeholderTextColor={theme.textSoft} value={genericName} onChangeText={setGenericName} />
            <TextInput style={[modalStyles.input, { borderColor: ink, color: theme.textStrong, backgroundColor: theme.page }]}
              placeholder="Dosage (e.g. 10mg)" placeholderTextColor={theme.textSoft} value={dosage} onChangeText={setDosage} />
            <TextInput style={[modalStyles.input, { borderColor: ink, color: theme.textStrong, backgroundColor: theme.page }]}
              placeholder="Purpose (optional)" placeholderTextColor={theme.textSoft} value={purpose} onChangeText={setPurpose} />
            <TextInput style={[modalStyles.input, { borderColor: ink, color: theme.textStrong, backgroundColor: theme.page }]}
              placeholder="Prescriber (optional)" placeholderTextColor={theme.textSoft} value={prescriberName} onChangeText={setPrescriberName} />
            <TextInput style={[modalStyles.input, { borderColor: ink, color: theme.textStrong, backgroundColor: theme.page }]}
              placeholder="Refill date (YYYY-MM-DD)" placeholderTextColor={theme.textSoft} value={refillDate} onChangeText={setRefillDate} keyboardType="numeric" />
            <TextInput style={[modalStyles.input, { borderColor: ink, color: theme.textStrong, backgroundColor: theme.page }]}
              placeholder="Notes (optional)" placeholderTextColor={theme.textSoft} value={notes} onChangeText={setNotes} />

            {categories.length > 0 && (
              <>
                <Text style={[modalStyles.label, { color: theme.textSoft }]}>Category</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {categories.map((cat) => (
                    <Pressable key={cat.id} onPress={() => setSelectedCatId(selectedCatId === cat.id ? null : cat.id)}
                      style={[modalStyles.catChip, {
                        borderColor: selectedCatId === cat.id ? cat.color_hex : theme.cardBorder,
                        backgroundColor: selectedCatId === cat.id ? cat.color_hex + '22' : theme.page,
                      }]}>
                      <View style={[modalStyles.catDot, { backgroundColor: cat.color_hex }]} />
                      <Text style={{ fontSize: 12, color: theme.textStrong, fontWeight: '600' }}>{cat.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}

            {/* PRN toggle */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={[modalStyles.label, { color: theme.textSoft }]}>PRN / As Needed</Text>
              <Pressable
                onPress={() => setIsPrn((v) => !v)}
                style={[modalStyles.timeChip, {
                  backgroundColor: isPrn ? '#F59E0B' : theme.page,
                  borderColor: isPrn ? '#F59E0B' : ink,
                  paddingVertical: 5,
                  paddingHorizontal: 12,
                }]}
              >
                <Text style={{ color: isPrn ? '#fff' : theme.textSoft, fontWeight: '700', fontSize: 13 }}>
                  {isPrn ? 'PRN ON' : 'Off'}
                </Text>
              </Pressable>
            </View>
            {isPrn && (
              <Text style={{ color: theme.textSoft, fontSize: 12, fontStyle: 'italic' }}>
                This med won't affect your adherence score.
              </Text>
            )}

            {!isPrn && (
              <>
                <Text style={[modalStyles.label, { color: theme.textSoft }]}>Schedule</Text>

                {/* Frequency toggle */}
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {(['daily', 'weekly'] as const).map((f) => (
                    <Pressable
                      key={f}
                      style={[modalStyles.timeChip, {
                        backgroundColor: frequency === f ? theme.teal.solid : theme.page,
                        borderColor: frequency === f ? theme.teal.solid : ink,
                      }]}
                      onPress={() => setFrequency(f)}
                    >
                      <Text style={{ color: frequency === f ? '#fff' : theme.textSoft, fontWeight: '600', fontSize: 13 }}>
                        {f.charAt(0).toUpperCase() + f.slice(1)}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                {frequency === 'weekly' ? (
                  <>
                    <Text style={{ color: theme.textSoft, fontSize: 12 }}>Pick a day of week:</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, idx) => (
                        <Pressable
                          key={day}
                          style={[modalStyles.timeChip, {
                            backgroundColor: dayOfWeek === idx ? theme.teal.solid : theme.page,
                            borderColor: dayOfWeek === idx ? theme.teal.solid : ink,
                          }]}
                          onPress={() => setDayOfWeek(dayOfWeek === idx ? null : idx)}
                        >
                          <Text style={{ color: dayOfWeek === idx ? '#fff' : theme.textSoft, fontWeight: '600', fontSize: 13 }}>
                            {day}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </>
                ) : (
                  <>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {['morning', 'midday', 'evening', 'custom'].map((t) => (
                        <Pressable key={t} style={[modalStyles.timeChip, {
                            backgroundColor: selectedTimes.includes(t) ? theme.teal.solid : theme.page, borderColor: ink }]}
                          onPress={() => toggleTime(t)}>
                          <Text style={{ color: selectedTimes.includes(t) ? '#fff' : theme.textSoft, fontWeight: '600', fontSize: 13 }}>
                            {t.charAt(0).toUpperCase() + t.slice(1)}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                    {selectedTimes.includes('custom') && (
                      <TextInput style={[modalStyles.input, { borderColor: ink, color: theme.textStrong, backgroundColor: theme.page }]}
                        placeholder="Custom time (HH:MM)" placeholderTextColor={theme.textSoft} value={customTime} onChangeText={setCustomTime} />
                    )}
                  </>
                )}
              </>
            )}

            <Pressable style={[modalStyles.saveBtn, { backgroundColor: theme.teal.solid, borderColor: ink }]} onPress={save} disabled={saving}>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>{saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Save Medication'}</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─── MedicationInfoModal ──────────────────────────────────────────────────────

function MedicationInfoModal({ med, theme, onClose }: { med: Medication; theme: any; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [labelData, setLabelData] = useState<any>(null);
  const [found, setFound] = useState<boolean | null>(null);

  useEffect(() => {
    api.getMedicationLabel(med.id)
      .then((res: any) => {
        setFound(res?.found ?? false);
        setLabelData(res?.label ?? null);
      })
      .catch(() => { setFound(false); setLabelData(null); })
      .finally(() => setLoading(false));
  }, [med.id]);

  const sections: Array<{ key: string; title: string }> = [
    { key: 'indications_and_usage', title: 'Indications' },
    { key: 'dosage_and_administration', title: 'Dosage' },
    { key: 'warnings', title: 'Warnings' },
    { key: 'adverse_reactions', title: 'Adverse Reactions' },
  ];

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <View style={modalStyles.overlay}>
        <View style={[modalStyles.sheet, { backgroundColor: theme.card, borderColor: theme.ink }]}>
          <View style={modalStyles.header}>
            <Text style={[modalStyles.title, { color: theme.textStrong }]} numberOfLines={1}>{med.name}</Text>
            <Pressable onPress={onClose}><Text style={{ color: theme.textSoft, fontSize: 22 }}>✕</Text></Pressable>
          </View>
          <ScrollView contentContainerStyle={{ gap: 14, paddingBottom: 24 }}>
            {loading && <ActivityIndicator color={theme.teal.solid} style={{ marginTop: 24 }} />}
            {!loading && found === false && (
              <Text style={{ color: theme.textSoft, fontSize: 14, textAlign: 'center', marginTop: 16 }}>
                No FDA label information available for this medication.
              </Text>
            )}
            {!loading && found === true && labelData && (
              <>
                {sections.map(({ key, title }) => {
                  const val = labelData[key];
                  if (!val) return null;
                  const text = Array.isArray(val) ? val.join('\n') : String(val);
                  return (
                    <View key={key}>
                      <Text style={{ color: theme.textStrong, fontWeight: '800', fontSize: 13, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                        {title}
                      </Text>
                      <Text style={{ color: theme.textSoft, fontSize: 13, lineHeight: 19 }}>{text.slice(0, 800)}</Text>
                    </View>
                  );
                })}
                <Text style={{ color: theme.textSoft, fontSize: 11, marginTop: 8, fontStyle: 'italic' }}>
                  Per the FDA-approved drug label. Talk to your prescriber about any questions.
                </Text>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const modalStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 2,
    borderBottomWidth: 0,
    padding: 20,
    maxHeight: '90%',
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 18, fontWeight: '800', flex: 1, marginRight: 12 },
  input: {
    borderWidth: 2,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
  },
  label: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  timeChip: {
    borderWidth: 2,
    borderRadius: 20,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderRadius: 20,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  catDot: { width: 10, height: 10, borderRadius: 5 },
  saveBtn: {
    borderWidth: 2,
    borderRadius: 22,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: "rgba(60,40,20,0.1)",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 4,
  },
  suggestions: {
    borderWidth: 2,
    borderTopWidth: 0,
    borderRadius: 0,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    zIndex: 10,
  },
  suggRow: { paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1 },
});

// ─── MedicationList (shared by MedicationView and MedicationViewInline) ──────

function MedicationList({ theme, scrollEnabled = true }: { theme: any; scrollEnabled?: boolean }) {
  const navigation = useNavigation<any>();
  const [medications, setMedications] = useState<Medication[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedSlotIds, setSelectedSlotIds] = useState<string[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editMed, setEditMed] = useState<Medication | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [infoMed, setInfoMed] = useState<Medication | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [celebSlotId, setCelebSlotId] = useState<string | null>(null);
  const celebAnim = useRef(new Animated.Value(0)).current;

  const load = useCallback(async () => {
    try {
      const meds = await api.getMedications();
      setMedications(meds ?? []);
    } catch {
      setMedications([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load, refresh]);

  const todayDowList = new Date().getDay(); // 0=Sun,...,6=Sat
  const buckets: Record<string, Medication[]> = { morning: [], midday: [], evening: [], custom: [] };
  for (const med of medications) {
    // PRN meds appear in the "My Medications" list but not the schedule buckets
    if (med.is_prn) continue;
    // Weekly meds only appear in schedule on their designated day
    if (med.frequency === 'weekly' && med.day_of_week !== todayDowList) continue;
    for (const slot of med.slots) {
      const bucket = ['morning', 'midday', 'evening'].includes(slot.time_of_day) ? slot.time_of_day : 'custom';
      if (!buckets[bucket].find((m) => m.id === med.id)) {
        buckets[bucket].push(med);
      }
    }
  }

  async function markAllTaken(time_of_day: string) {
    try {
      await api.markSlotTaken(time_of_day);
      setRefresh((r) => r + 1);
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed');
    }
  }

  function runCelebration(slotId: string) {
    setCelebSlotId(slotId);
    celebAnim.setValue(0);
    Animated.sequence([
      Animated.timing(celebAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(celebAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setCelebSlotId(null));
  }

  async function toggleSlot(slot: MedSlot) {
    try {
      if (slot.dose_log) {
        await api.deleteDoseLog(slot.dose_log.id);
      } else {
        await api.markSelectedTaken([slot.id]);
        runCelebration(slot.id);
      }
      setRefresh((r) => r + 1);
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed');
    }
  }

  async function markSelectedDone() {
    try {
      await api.markSelectedTaken(selectedSlotIds);
      setSelectedSlotIds([]);
      setSelectMode(false);
      setRefresh((r) => r + 1);
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed');
    }
  }

  function deleteMed(id: string) {
    Alert.alert('Remove medication?', 'This will hide the medication from your schedule.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteMedication(id);
            setRefresh((r) => r + 1);
          } catch {}
        },
      },
    ]);
  }

  const BUCKET_LABELS: Record<string, string> = { morning: 'Morning', midday: 'Midday', evening: 'Evening', custom: 'Custom' };

  const content = loading ? (
    <ActivityIndicator color={theme.teal.solid} style={{ marginTop: 40 }} />
  ) : (
    <>
          {/* Next dose callout */}
          {(() => { const msg = nextDoseCallout(medications); return msg ? (
            <View style={[medStyles.nextDoseBar, { backgroundColor: theme.teal.tint, borderColor: theme.teal.solid }]}>
              <Text style={{ fontSize: 14 }}>⏰</Text>
              <Text style={[medStyles.nextDoseText, { color: theme.teal.sub }]}>Next: {msg}</Text>
            </View>
          ) : null; })()}

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={[medStyles.sectionHead, { color: theme.textStrong }]}>Today's Schedule</Text>
            <Pressable onPress={() => { setSelectMode((s) => !s); setSelectedSlotIds([]); }}>
              <Text style={{ color: theme.teal.solid, fontWeight: '700', fontSize: 13 }}>{selectMode ? 'Done' : 'Select'}</Text>
            </Pressable>
          </View>

          {/* Empty schedule but has PRN meds → point to them instead of leaving a bare gap */}
          {(() => {
            const anyScheduledToday = Object.values(buckets).some((b) => b.length > 0);
            const anyPrn = medications.some((m) => m.active && m.is_prn);
            if (!anyScheduledToday && anyPrn) {
              return (
                <View style={{ padding: 12, borderRadius: 14, borderWidth: 1.5, borderColor: theme.cardBorder, backgroundColor: theme.card }}>
                  <Text style={{ color: theme.textStrong, fontSize: 13, fontWeight: '700' }} allowFontScaling maxFontSizeMultiplier={1.3}>
                    No scheduled doses today
                  </Text>
                  <Text style={{ color: theme.textSoft, fontSize: 11, marginTop: 2 }} allowFontScaling maxFontSizeMultiplier={1.3}>
                    PRN medications are in "My Medications" below.
                  </Text>
                </View>
              );
            }
            return null;
          })()}
          {Object.entries(buckets).map(([bucket, meds]) => {
            if (meds.length === 0) return null;
            return (
              <View key={bucket} style={[medStyles.bucket, { backgroundColor: theme.card, borderColor: theme.cardBorder, ...coloredShadow(theme.teal.solid) }]}>
                <View style={medStyles.bucketHeader}>
                  <Text style={[medStyles.bucketLabel, { color: theme.textStrong }]}>{BUCKET_LABELS[bucket]}</Text>
                  <Pressable onPress={() => markAllTaken(bucket)}>
                    <Text style={{ color: theme.teal.solid, fontWeight: '700', fontSize: 12 }}>Mark all</Text>
                  </Pressable>
                </View>
                {meds.map((med) => {
                  const slot = med.slots.find((s) => {
                    const b = ['morning', 'midday', 'evening'].includes(s.time_of_day) ? s.time_of_day : 'custom';
                    return b === bucket;
                  });
                  if (!slot) return null;
                  const taken = slot.dose_log !== null;
                  const isSelected = selectedSlotIds.includes(slot.id);
                  const isCelebrating = celebSlotId === slot.id;
                  const DOW_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                  return (
                    <Pressable
                      key={med.id + slot.id}
                      style={[medStyles.medRow, { borderTopColor: theme.cardBorder }]}
                      onPress={() => {
                        if (selectMode) {
                          setSelectedSlotIds((prev) => prev.includes(slot.id) ? prev.filter((x) => x !== slot.id) : [...prev, slot.id]);
                        } else {
                          toggleSlot(slot);
                        }
                      }}
                    >
                      <View style={{ position: 'relative' }}>
                        <View style={[medStyles.circle, { borderColor: taken ? theme.teal.solid : theme.cardBorder, backgroundColor: taken ? theme.teal.solid : 'transparent' }]}>
                          {taken && <Text style={{ color: '#fff', fontSize: 11 }}>✓</Text>}
                          {selectMode && !taken && (
                            <View style={[medStyles.selectBox, { borderColor: theme.ink, backgroundColor: isSelected ? theme.teal.solid : 'transparent' }]}>
                              {isSelected && <Text style={{ color: '#fff', fontSize: 10 }}>✓</Text>}
                            </View>
                          )}
                        </View>
                        {isCelebrating && (
                          <>
                            {[
                              { top: -10, left: -10 },
                              { top: -12, left: 8 },
                              { top: -6, left: 22 },
                              { top: 8, left: 24 },
                            ].map((pos, i) => (
                              <Animated.View
                                key={i}
                                style={{
                                  position: 'absolute',
                                  width: 8,
                                  height: 8,
                                  borderRadius: 4,
                                  backgroundColor: theme.teal.solid,
                                  top: pos.top,
                                  left: pos.left,
                                  opacity: celebAnim,
                                  transform: [{ scale: celebAnim }],
                                }}
                              />
                            ))}
                          </>
                        )}
                      </View>
                      {med.color_category && (
                        <View style={[medStyles.colorDot, { backgroundColor: med.color_category.color_hex }]} />
                      )}
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={[medStyles.medName, { color: taken ? theme.textSoft : theme.textStrong }]}>{med.name}</Text>
                          {med.is_prn && (
                            <View style={{ backgroundColor: '#F59E0B', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 }}>
                              <Text style={{ color: '#78350F', fontSize: 10, fontWeight: '700' }}>PRN</Text>
                            </View>
                          )}
                        </View>
                        {med.dosage ? <Text style={{ color: theme.textSoft, fontSize: 12 }}>{med.dosage}</Text> : null}
                        {med.frequency === 'weekly' && med.day_of_week != null && (
                          <Text style={{ color: theme.textSoft, fontSize: 11 }}>Weekly — {DOW_NAMES[med.day_of_week]}</Text>
                        )}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            );
          })}

          <Text style={[medStyles.sectionHead, { color: theme.textStrong, marginTop: 8 }]}>My Medications</Text>
          <Pressable
            style={[medStyles.addBtn, { borderColor: theme.ink, backgroundColor: theme.teal.tint, shadowColor: "rgba(60,40,20,0.1)" }]}
            onPress={() => setShowAddModal(true)}
          >
            <Text style={{ color: theme.teal.fg, fontWeight: '700', fontSize: 14 }}>+ Add medication</Text>
          </Pressable>

          {/* Group meds by refill urgency: overdue → soon (<7d) → daily/weekly → PRN */}
          {(() => {
            type Group = 'overdue' | 'soon' | 'active' | 'prn';
            const groupOrder: Group[] = ['overdue', 'soon', 'active', 'prn'];
            const groupLabels: Record<Group, string> = {
              overdue: 'Refill overdue',
              soon: 'Refill soon',
              active: 'Active',
              prn: 'As needed (PRN)',
            };
            const groupColor: Record<Group, string> = {
              overdue: (theme as any).berry?.solid ?? '#C0392B',
              soon: theme.amber?.solid ?? '#D97706',
              active: theme.teal.solid,
              prn: theme.textSoft,
            };
            const grouped: Record<Group, Medication[]> = { overdue: [], soon: [], active: [], prn: [] };
            for (const m of medications) {
              const days = m.refill_date ? (new Date(m.refill_date).getTime() - Date.now()) / 86400000 : null;
              if (m.is_prn) grouped.prn.push(m);
              else if (days !== null && days <= 0) grouped.overdue.push(m);
              else if (days !== null && days <= 7) grouped.soon.push(m);
              else grouped.active.push(m);
            }
            return groupOrder.filter((g) => grouped[g].length > 0).map((g) => (
              <View key={g} style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: groupColor[g] }} />
                  <Text
                    style={{ color: theme.textSoft, fontSize: 10, fontWeight: '900', letterSpacing: 0.6 }}
                    allowFontScaling
                    maxFontSizeMultiplier={1.3}
                    accessibilityRole="header"
                  >
                    {groupLabels[g].toUpperCase()} · {grouped[g].length}
                  </Text>
                </View>
                {grouped[g].map((med) => {
            const status = computeMedStatus(med);
            const badge = STATUS_BADGE[status];
            const refillDays = med.refill_date
              ? Math.ceil((new Date(med.refill_date).getTime() - Date.now()) / 86400000)
              : null;

            // Brand/generic subtitle logic
            let brandGenericLine: string | null = null;
            if (med.brand_name != null && med.generic_name != null) {
              if (med.name === med.brand_name) {
                brandGenericLine = `Generic: ${med.generic_name}`;
              } else {
                brandGenericLine = `Brand: ${med.brand_name}`;
              }
            }

            return (
              <LongPressActionMenu
                key={med.id}
                title={med.name}
                onPress={() => navigation.navigate('MedicationHistory', { medicationId: med.id, medicationName: med.name })}
                actions={[
                  { label: 'Edit', onPress: () => { setEditMed(med); setShowEditModal(true); } },
                  { label: 'Remove', destructive: true, onPress: () => deleteMed(med.id) },
                ]}
              >
              <View
                style={[medStyles.medCard, { backgroundColor: theme.card, borderColor: theme.cardBorder, ...coloredShadow(theme.teal.solid) }]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                  <IconBadge name="medical-outline" color={med.color_category?.color_hex ?? '#3FA0A6'} bgColor={(med.color_category?.color_hex ?? '#3FA0A6') + '22'} size={16} containerSize={32} borderRadius={8} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={[medStyles.medName, { color: theme.textStrong, flex: 1 }]}>{med.name}</Text>
                      {med.is_prn && (
                        <View style={{ backgroundColor: '#F59E0B', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 }}>
                          <Text style={{ color: '#78350F', fontSize: 10, fontWeight: '700' }}>PRN</Text>
                        </View>
                      )}
                      {/* Info button */}
                      <Pressable
                        onPress={() => setInfoMed(med)}
                        hitSlop={8}
                        accessibilityLabel={`${med.name} drug label info`}
                      >
                        <Text style={{ color: theme.textSoft, fontSize: 16 }}>ⓘ</Text>
                      </Pressable>
                      {status !== 'active' && (
                        <View style={[medStyles.statusBadge, { backgroundColor: badge.bg }]}>
                          <Text style={[medStyles.statusBadgeText, { color: badge.fg }]}>{badge.label}</Text>
                        </View>
                      )}
                    </View>
                    {med.dosage && <Text style={{ color: theme.textSoft, fontSize: 12 }}>{med.dosage}</Text>}
                    {brandGenericLine && <Text style={{ color: theme.textSoft, fontSize: 12 }}>{brandGenericLine}</Text>}
                    {med.purpose && <Text style={{ color: theme.textSoft, fontSize: 12 }}>Purpose: {med.purpose}</Text>}
                    {med.prescriber && <Text style={{ color: theme.textSoft, fontSize: 12 }}>Dr. {med.prescriber.name}</Text>}
                    {med.is_prn ? (
                      <Text style={{ color: theme.textSoft, fontSize: 12 }}>As needed (PRN)</Text>
                    ) : med.frequency === 'weekly' ? (
                      <Text style={{ color: theme.textSoft, fontSize: 12 }}>
                        Weekly — {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][med.day_of_week ?? 0] ?? 'No day set'}
                      </Text>
                    ) : (
                      <Text style={{ color: theme.textSoft, fontSize: 12 }}>
                        {med.slots.map((s) => s.time_of_day).join(', ') || 'No schedule'}
                      </Text>
                    )}
                    {refillDays !== null && (
                      <Text style={{ color: refillDays <= 0 ? theme.coral.solid : theme.textSoft, fontSize: 12 }}>
                        {refillDays <= 0 ? 'Refill overdue' : `Refill in ${refillDays} day${refillDays !== 1 ? 's' : ''}`}
                      </Text>
                    )}
                  </View>
                  <Text style={{ color: theme.textSoft, fontSize: 16 }}>›</Text>
                </View>
              </View>
              </LongPressActionMenu>
            );
                })}
              </View>
            ));
          })()}

          <Pressable onPress={() => navigation.navigate('MedicationImport')}>
            <Text style={{ color: theme.teal.solid, fontSize: 13, fontWeight: '600', textDecorationLine: 'underline', textAlign: 'center', marginTop: 4 }}>
              Import from CSV / Excel
            </Text>
          </Pressable>

          {selectMode && selectedSlotIds.length > 0 && (
            <View style={[medStyles.fab, { backgroundColor: theme.teal.solid, borderColor: theme.ink, shadowColor: "rgba(60,40,20,0.1)" }]}>
              <Pressable onPress={markSelectedDone}>
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>
                  Mark {selectedSlotIds.length} selected as taken
                </Text>
              </Pressable>
            </View>
          )}
    </>
  );

  return (
    <View style={scrollEnabled ? { flex: 1 } : {}}>
      {scrollEnabled ? (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 100 }}>
          {content}
        </ScrollView>
      ) : (
        <View style={{ padding: 16, gap: 16, paddingBottom: 24 }}>
          {content}
        </View>
      )}

      {showAddModal && (
        <AddMedicationModal
          theme={theme}
          onClose={() => setShowAddModal(false)}
          onSaved={() => { setShowAddModal(false); setRefresh((r) => r + 1); }}
        />
      )}

      {showEditModal && editMed && (
        <AddMedicationModal
          theme={theme}
          editId={editMed.id}
          initialValues={{
            name: editMed.name,
            dosage: editMed.dosage ?? '',
            purpose: editMed.purpose ?? '',
            notes: editMed.notes ?? '',
            prescriberName: editMed.prescriber?.name ?? '',
            refillDate: editMed.refill_date ?? '',
            selectedCatId: editMed.color_category?.id ?? null,
            selectedTimes: editMed.slots.map((s) => s.time_of_day),
            customTime: editMed.slots.find((s) => s.time_of_day === 'custom')?.specific_time ?? '',
            frequency: editMed.frequency ?? 'daily',
            dayOfWeek: editMed.day_of_week ?? null,
            isPrn: editMed.is_prn ?? false,
          }}
          onClose={() => { setShowEditModal(false); setEditMed(null); }}
          onSaved={() => { setShowEditModal(false); setEditMed(null); setRefresh((r) => r + 1); }}
        />
      )}

      {infoMed && (
        <MedicationInfoModal
          med={infoMed}
          theme={theme}
          onClose={() => setInfoMed(null)}
        />
      )}
    </View>
  );
}

const medStyles = StyleSheet.create({
  sectionHead: { fontSize: 16, fontWeight: '800' },
  bucket: {
    borderRadius: 26,
    borderWidth: 2,
    overflow: 'hidden',
    // colored shadow applied inline via coloredShadow()
    elevation: 4,
  },
  bucketHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, paddingBottom: 10 },
  bucketLabel: { fontSize: 14, fontWeight: '700' },
  medRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: 1, gap: 12 },
  medName: { fontSize: 15, fontWeight: '600' },
  circle: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  selectBox: { width: 18, height: 18, borderRadius: 4, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  addBtn: {
    borderWidth: 2,
    borderRadius: 16,
    paddingVertical: 11,
    paddingHorizontal: 16,
    alignItems: 'center',
    shadowColor: "#3FA0A6",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 6,
  },
  medCard: {
    borderRadius: 22,
    borderWidth: 2,
    padding: 14,
    gap: 4,
    // colored shadow applied inline via coloredShadow()
    elevation: 3,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    borderRadius: 26,
    borderWidth: 2,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: "rgba(60,40,20,0.1)",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 8,
  },
  colorDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  statusBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  statusBadgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
  nextDoseBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 22,
    borderWidth: 1,
  },
  nextDoseText: { fontSize: 13, fontWeight: '700', flex: 1 },
});

// ─── CycleDayLogModal ─────────────────────────────────────────────────────────

function CycleDayLogModal({
  date,
  existingLog,
  theme,
  onClose,
  onSaved,
}: {
  date: string;
  existingLog: CycleLog | null;
  theme: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [flow, setFlow] = useState<string>(existingLog?.flow_intensity ?? '');
  const [symptoms, setSymptoms] = useState<string[]>(existingLog?.symptoms ?? []);
  const [energy, setEnergy] = useState<number | null>(existingLog?.energy_level ?? null);
  const [moodSearch, setMoodSearch] = useState('');
  const [moodLabels, setMoodLabels] = useState<string[]>(
    existingLog?.mood_label ? existingLog.mood_label.split(',').map((s) => s.trim()).filter(Boolean) : []
  );
  const [notes, setNotes] = useState(existingLog?.notes ?? '');
  const [commonSymptoms, setCommonSymptoms] = useState<string[]>([]);
  const [moreSymptoms, setMoreSymptoms] = useState<string[]>([]);
  const [showMore, setShowMore] = useState(false);
  const [moods, setMoods] = useState<Array<{ label: string; uses: number }>>([]);
  const [customSymptom, setCustomSymptom] = useState('');
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    api.getRankedSymptoms().then((res: any) => {
      setCommonSymptoms(res?.common ?? []);
      setMoreSymptoms(res?.more ?? []);
    }).catch(() => {});
    api.getRankedMoods('').then((res: any) => setMoods(res ?? [])).catch(() => {});
  }, []);

  function onMoodSearchChange(text: string) {
    setMoodSearch(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      api.getRankedMoods(text).then((res: any) => setMoods(res ?? [])).catch(() => {});
    }, 250);
  }

  function toggleSymptom(s: string) {
    setSymptoms((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);
  }

  async function addCustomSymptom() {
    if (!customSymptom.trim()) return;
    const label = customSymptom.trim();
    try {
      await api.addCustomSymptom(label);
      toggleSymptom(label);
      setCustomSymptom('');
      const res: any = await api.getRankedSymptoms();
      setCommonSymptoms(res?.common ?? []);
      setMoreSymptoms(res?.more ?? []);
    } catch {}
  }

  async function save() {
    setSaving(true);
    try {
      await api.upsertCycleLog({
        log_date: date,
        flow_intensity: flow || null,
        symptoms: symptoms.length > 0 ? symptoms : null,
        mood_label: moodLabels.length > 0 ? moodLabels.join(', ') : null,
        notes: notes || null,
        energy_level: energy ?? null,
      });
      onSaved();
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function deleteLog() {
    Alert.alert('Delete log?', "Remove this day's log?", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteCycleLog(date);
            onSaved();
          } catch (err: any) {
            Alert.alert('Error', err?.message ?? 'Failed');
          }
        },
      },
    ]);
  }

  const allSymptoms = [...commonSymptoms, ...moreSymptoms];
  const visibleSymptoms = showMore ? allSymptoms : allSymptoms.slice(0, 8);

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <View style={modalStyles.overlay}>
        <View style={[modalStyles.sheet, { backgroundColor: theme.card, borderColor: theme.ink }]}>
          <ModalHeader title={fmtDate(date)} onClose={onClose} />
          <ScrollView contentContainerStyle={{ gap: 16, paddingBottom: 20 }}>
            {/* Flow intensity */}
            <View>
              <Text style={[cycleStyles.label, { color: theme.textSoft }]}>Flow intensity</Text>
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                {FLOW_OPTIONS.map((f) => (
                  <Pressable
                    key={f}
                    style={[
                      cycleStyles.flowBtn,
                      {
                        backgroundColor: f === 'none' ? (flow === f ? theme.ink : theme.page) : FLOW_COLORS[f],
                        borderColor: flow === f ? theme.ink : theme.cardBorder,
                        borderWidth: flow === f ? 3 : 1.5,
                      },
                    ]}
                    onPress={() => setFlow(f === flow ? '' : f)}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '600', color: f === 'heavy' ? '#fff' : theme.textStrong }}>
                      {f.charAt(0).toUpperCase() + f.slice(1)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Symptoms */}
            <View>
              <Text style={[cycleStyles.label, { color: theme.textSoft }]}>Symptoms</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                {visibleSymptoms.map((s) => (
                  <ChipButton
                    key={s}
                    label={s}
                    selected={symptoms.includes(s)}
                    onPress={() => toggleSymptom(s)}
                    color={theme.teal.solid}
                    size="sm"
                  />
                ))}
              </View>
              {allSymptoms.length > 8 && (
                <Pressable onPress={() => setShowMore((s) => !s)} style={{ marginTop: 8 }}>
                  <Text style={{ color: theme.teal.solid, fontSize: 12, fontWeight: '600' }}>
                    {showMore ? 'Show less' : `View ${allSymptoms.length - 8} more`}
                  </Text>
                </Pressable>
              )}
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <TextInput
                  style={[cycleStyles.input, { flex: 1, borderColor: theme.ink, color: theme.textStrong, backgroundColor: theme.page }]}
                  placeholder="Add custom symptom"
                  placeholderTextColor={theme.textSoft}
                  value={customSymptom}
                  onChangeText={setCustomSymptom}
                />
                <Pressable
                  style={[cycleStyles.addBtn, { borderColor: theme.ink, backgroundColor: theme.teal.tint }]}
                  onPress={addCustomSymptom}
                >
                  <Text style={{ color: theme.teal.fg, fontWeight: '700' }}>Add</Text>
                </Pressable>
              </View>
            </View>

            {/* Energy level */}
            <View>
              <Text style={[cycleStyles.label, { color: theme.textSoft }]}>Energy level</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                  <ChipButton
                    key={n}
                    label={String(n)}
                    accessibilityHint={`Energy level ${n} of 10`}
                    selected={energy === n}
                    onPress={() => setEnergy(energy === n ? null : n)}
                    color={theme.teal.solid}
                    size="sm"
                  />
                ))}
              </View>
            </View>

            {/* Mood */}
            <View>
              <Text style={[cycleStyles.label, { color: theme.textSoft }]}>Mood</Text>
              <TextInput
                style={[cycleStyles.input, { borderColor: theme.ink, color: theme.textStrong, backgroundColor: theme.page, marginTop: 8 }]}
                placeholder="Search moods…"
                placeholderTextColor={theme.textSoft}
                value={moodSearch}
                onChangeText={onMoodSearchChange}
              />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                {moods.slice(0, 12).map((m) => {
                  const selected = moodLabels.includes(m.label);
                  return (
                    <ChipButton
                      key={m.label}
                      label={m.label}
                      selected={selected}
                      onPress={() => setMoodLabels((prev) =>
                        prev.includes(m.label) ? prev.filter((x) => x !== m.label) : [...prev, m.label]
                      )}
                      color={theme.violet?.solid ?? theme.purple?.solid ?? theme.teal.solid}
                      size="sm"
                    />
                  );
                })}
              </View>
            </View>

            {/* Notes */}
            <View>
              <Text style={[cycleStyles.label, { color: theme.textSoft }]}>Notes</Text>
              <TextInput
                style={[cycleStyles.input, { borderColor: theme.ink, color: theme.textStrong, backgroundColor: theme.page, marginTop: 8, minHeight: 80, textAlignVertical: 'top' }]}
                placeholder="How are you feeling today?"
                placeholderTextColor={theme.textSoft}
                value={notes}
                onChangeText={setNotes}
                multiline
              />
            </View>

            <Pressable
              style={[modalStyles.saveBtn, { backgroundColor: theme.teal.solid, borderColor: theme.ink }]}
              onPress={save}
              disabled={saving}
            >
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>{saving ? 'Saving…' : 'Save'}</Text>
            </Pressable>

            {existingLog && (
              <Pressable onPress={deleteLog} style={{ alignItems: 'center', marginTop: 4 }}>
                <Text style={{ color: theme.danger ?? '#CC3333', fontSize: 13, fontWeight: '600' }}>Delete this log</Text>
              </Pressable>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const cycleStyles = StyleSheet.create({
  label: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  flowBtn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 20 },
  chip: { borderWidth: 2, borderRadius: 20, paddingVertical: 6, paddingHorizontal: 12 },
  input: { borderWidth: 2, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  addBtn: { borderWidth: 2, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  energyBtn: { width: 38, height: 38, borderRadius: 16, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});

// ─── MonthCalendar ────────────────────────────────────────────────────────────

function MonthCalendar({
  theme,
  onDayPress,
  refreshKey,
}: {
  theme: any;
  onDayPress: (date: string) => void;
  refreshKey?: number;
}) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [logs, setLogs] = useState<CycleLog[]>([]);
  const [prediction, setPrediction] = useState<Prediction | null>(null);

  const { year, month } = currentMonth;
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = firstDay.getDay();
  const daysInMonth = lastDay.getDate();
  const today = todayStr();

  useEffect(() => {
    const from = firstDay.toISOString().slice(0, 10);
    const to = lastDay.toISOString().slice(0, 10);
    api.getCycleLogs(from, to).then((res: any) => setLogs(res ?? [])).catch(() => setLogs([]));
    api.getCyclePrediction().then((res: any) => setPrediction(res)).catch(() => setPrediction(null));
  }, [year, month, refreshKey]);

  function prevMonth() {
    setCurrentMonth(({ year: y, month: m }) => m === 0 ? { year: y - 1, month: 11 } : { year: y, month: m - 1 });
  }
  function nextMonth() {
    setCurrentMonth(({ year: y, month: m }) => m === 11 ? { year: y + 1, month: 0 } : { year: y, month: m + 1 });
  }

  // Build log map
  const logMap: Record<string, CycleLog> = {};
  for (const log of logs) {
    logMap[log.log_date] = log;
  }

  // Build predicted period dates set
  const predictedDays = new Set<string>();
  const predictedStartDay = prediction?.predictedNextStart ?? null;
  if (predictedStartDay) {
    const periodLen = prediction!.avgPeriodLength ?? 5;
    for (let i = 0; i < periodLen; i++) {
      predictedDays.add(addDays(predictedStartDay, i));
    }
  }

  const monthLabel = firstDay.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const cells: Array<number | null> = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <View style={[calStyles.container, { backgroundColor: theme.card, borderColor: theme.cardBorder, shadowColor: "rgba(60,40,20,0.1)" }]}>
      <View style={calStyles.header}>
        <Pressable onPress={prevMonth} hitSlop={8}><Text style={{ color: theme.textStrong, fontSize: 20 }}>‹</Text></Pressable>
        <Text style={[calStyles.monthLabel, { color: theme.textStrong }]}>{monthLabel}</Text>
        <Pressable onPress={nextMonth} hitSlop={8}><Text style={{ color: theme.textStrong, fontSize: 20 }}>›</Text></Pressable>
      </View>
      <View style={calStyles.dowRow}>
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
          <Text key={d} style={[calStyles.dowLabel, { color: theme.textSoft }]}>{d}</Text>
        ))}
      </View>
      <View style={calStyles.grid}>
        {cells.map((day, idx) => {
          if (day === null) return <View key={'empty-' + idx} style={calStyles.cell} />;
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const log = logMap[dateStr];
          const isToday = dateStr === today;
          const isPredicted = predictedDays.has(dateStr);

          const isPeriodDay = !!(log?.flow_intensity && log.flow_intensity !== 'none');
          const flowBg = isPeriodDay ? (FLOW_COLORS[log!.flow_intensity!] ?? theme.cycle.period) : undefined;
          const hasSymptomLog = (log?.symptoms ?? []).length > 0;
          const hasMoodLog = log?.mood_label != null && log.mood_label !== '';

          const isPredictedStart = dateStr === predictedStartDay;
          const isOtherPredicted = isPredicted && !isPredictedStart;

          return (
            <Pressable
              key={dateStr}
              style={calStyles.cell}
              onPress={() => onDayPress(dateStr)}
            >
              {/* Predicted start day — solid saturated lavender fill */}
              {!isPeriodDay && isPredictedStart && (
                <View style={[calStyles.cellInner, { backgroundColor: theme.cycle.predicted, borderRadius: 8 }]} />
              )}
              {/* Other predicted days — light fill + dashed border */}
              {!isPeriodDay && isOtherPredicted && (
                <View style={[calStyles.cellInner, { backgroundColor: theme.cycle.fertile, borderRadius: 8 }]} />
              )}
              {!isPeriodDay && isOtherPredicted && (
                <View style={[calStyles.cellInner, { borderColor: theme.cycle.ovulation, borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 8 }]} />
              )}
              {/* Period fill — flow intensity gradient color */}
              {isPeriodDay && (
                <View style={[calStyles.cellInner, { backgroundColor: flowBg, borderRadius: 8 }]} />
              )}
              {/* Today purple ring */}
              {isToday && (
                <View style={[calStyles.cellInner, { borderWidth: 2, borderColor: theme.cycle.predicted, borderRadius: 8 }]} />
              )}

              <Text style={[calStyles.dayText, { color: theme.textStrong }]}>{day}</Text>

              {/* Bottom-right: symptom dot (teal) */}
              {hasSymptomLog && (
                <View style={[calStyles.dotBR, { backgroundColor: theme.cycle.symptom }]} />
              )}
              {/* Bottom-left: mood dot (pink) */}
              {hasMoodLog && (
                <View style={[calStyles.dotBL, { backgroundColor: theme.cycle.mood }]} />
              )}
            </Pressable>
          );
        })}
      </View>

      {/* Legend */}
      <View style={calStyles.legend}>
        <View style={calStyles.legendItem}>
          <View style={{ flexDirection: 'row', gap: 2 }}>
            {(['spotting', 'light', 'medium', 'heavy'] as const).map((f) => (
              <View key={f} style={[calStyles.legendSwatch, { backgroundColor: FLOW_COLORS[f] }]} />
            ))}
          </View>
          <Text style={[calStyles.legendText, { color: theme.textSoft }]}>Period</Text>
        </View>
        <View style={calStyles.legendItem}>
          <View style={[calStyles.legendDot, { backgroundColor: theme.cycle.predicted }]} />
          <Text style={[calStyles.legendText, { color: theme.textSoft }]}>Next period</Text>
        </View>
        <View style={calStyles.legendItem}>
          <View style={[calStyles.legendDot, { backgroundColor: theme.cycle.fertile, borderWidth: 1.5, borderColor: theme.cycle.ovulation }]} />
          <Text style={[calStyles.legendText, { color: theme.textSoft }]}>Predicted days</Text>
        </View>
        <View style={calStyles.legendItem}>
          <View style={[calStyles.legendDot, { backgroundColor: theme.cycle.symptom }]} />
          <Text style={[calStyles.legendText, { color: theme.textSoft }]}>Symptoms</Text>
        </View>
        <View style={calStyles.legendItem}>
          <View style={[calStyles.legendDot, { backgroundColor: theme.cycle.mood }]} />
          <Text style={[calStyles.legendText, { color: theme.textSoft }]}>Mood</Text>
        </View>
      </View>
    </View>
  );
}

const calStyles = StyleSheet.create({
  container: {
    borderRadius: 26,
    borderWidth: 2,
    padding: 14,
    shadowColor: "rgba(60,40,20,0.1)",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 4,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  monthLabel: { fontSize: 15, fontWeight: '800' },
  dowRow: { flexDirection: 'row', marginBottom: 4 },
  dowLabel: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    width: '14.28%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  cellInner: {
    position: 'absolute',
    top: 1,
    left: 1,
    right: 1,
    bottom: 1,
  },
  dayText: { fontSize: 12, fontWeight: '500', zIndex: 1 },
  dotBR: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 6,
    height: 6,
    borderRadius: 3,
    zIndex: 2,
  },
  dotBL: {
    position: 'absolute',
    bottom: 2,
    left: 2,
    width: 6,
    height: 6,
    borderRadius: 3,
    zIndex: 2,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.07)',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendSwatch: { width: 8, height: 10, borderRadius: 2 },
  legendText: { fontSize: 11 },
});

// ─── CycleView ────────────────────────────────────────────────────────────────

function CycleView({ theme }: { theme: any }) {
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [history, setHistory] = useState<Array<{ start: string; end: string; length_days: number }>>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedLog, setSelectedLog] = useState<CycleLog | null>(null);
  const [logModalDate, setLogModalDate] = useState<string | null>(null);
  const [logModalLog, setLogModalLog] = useState<CycleLog | null>(null);
  const [calRefresh, setCalRefresh] = useState(0);
  const [instructionDismissed, setInstructionDismissed] = useState<boolean | null>(null);
  const [topSymptoms, setTopSymptoms] = useState<string[]>([]);

  useEffect(() => {
    api.getCyclePrediction().then((res: any) => setPrediction(res)).catch(() => {});
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

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>
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

// ─── SymptomsView ─────────────────────────────────────────────────────────────

function SymptomsView({ theme }: { theme: any }) {
  const [symptomCounts, setSymptomCounts] = useState<{ label: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const end = new Date().toISOString().slice(0, 10);
    const startDate = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
    api.getCycleLogs(startDate, end).then((logs: any[]) => {
      const counts: Record<string, number> = {};
      for (const log of (logs ?? [])) {
        for (const s of (log.symptoms ?? [])) {
          counts[s] = (counts[s] ?? 0) + 1;
        }
      }
      const sorted = Object.entries(counts)
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count);
      setSymptomCounts(sorted);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <View style={{ padding: 24, alignItems: 'center' }}>
        <ActivityIndicator color={theme.teal.solid} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 14, gap: 12, paddingBottom: 100 }} scrollEnabled={false}>
      {symptomCounts.length === 0 ? (
        <View style={[{ borderRadius: 22, borderWidth: 2, padding: 20, alignItems: 'center', backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <Text style={{ fontSize: 28, marginBottom: 8 }}>📝</Text>
          <Text style={{ color: theme.textSoft, fontSize: 14, textAlign: 'center' }}>
            No symptoms logged yet. Log cycle days to track symptoms over time.
          </Text>
        </View>
      ) : (
        <>
          <Text style={{ color: theme.textSoft, fontSize: 11, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase' }}>
            Last 90 days
          </Text>
          <View style={[{ borderRadius: 22, borderWidth: 2, backgroundColor: theme.card, borderColor: theme.cardBorder, overflow: 'hidden', shadowColor: "rgba(60,40,20,0.1)", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 3 }]}>
            {symptomCounts.map(({ label, count }, i) => (
              <View key={label} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 11, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: theme.cardBorder }}>
                <Text style={{ color: theme.textStrong, fontSize: 14, fontWeight: '500', textTransform: 'capitalize' }}>{label}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ height: 6, width: Math.max(20, Math.min(80, count * 8)), borderRadius: 3, backgroundColor: theme.berry?.solid ?? '#A62A50', opacity: 0.6 }} />
                  <Text style={{ color: theme.textSoft, fontSize: 12, fontWeight: '700', minWidth: 28, textAlign: 'right' }}>{count}×</Text>
                </View>
              </View>
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

// ─── HealthTabScreen (root) ───────────────────────────────────────────────────

export function HealthTabScreen() {
  const { theme } = useTheme();
  const { preferences } = useTabPreferences();
  const { medication, cycle } = preferences.health;
  const bothEnabled = medication && cycle;
  const [activeSubTab, setActiveSubTab] = useState<SubTab>(medication ? 'medication' : 'cycle');
  const [hiddenSections, setHiddenSections] = useState<string[]>([]);
  const [showSectionEditor, setShowSectionEditor] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const [tourPadding, setTourPadding] = useState(0);
  const tourOverviewRef = useRef<View>(null);
  const tourContentRef = useRef<View>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const scrollOffsetRef = useRef(0);

  const HEALTH_TOUR_STEPS: TourStep[] = [
    { ref: tourOverviewRef, title: "Health Hub", body: "Switch between Medications, Cycle tracking, and Symptoms using the tiles at the top." },
    { ref: tourContentRef,  title: "Medication Schedule", body: "See today's scheduled doses and your full medication list. Tap any med for details, dosage, and history." },
  ];

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    api.getSettings().then((s: any) => {
      if (!cancelled) setHiddenSections(s?.health_hidden_sections ?? []);
    }).catch(() => {});
    hasSeenTooltip("health-tour").then(seen => {
      if (!cancelled && !seen) { markTooltipSeen("health-tour"); setTimeout(() => setShowTour(true), 600); }
    });
    return () => { cancelled = true; };
  }, []));

  async function handleSaveSections(newHidden: string[]) {
    setHiddenSections(newHidden);
    setShowSectionEditor(false);
    try { await api.patchSettings({ health_hidden_sections: newHidden }); } catch (_) {}
  }

  if (!medication && !cycle) {
    return (
      <View style={[rootStyles.center, { backgroundColor: theme.page }]}>
        <Text style={[rootStyles.placeholder, { color: theme.textSoft }]}>
          No health modules enabled. Go to Settings → Customize Tabs to turn them on.
        </Text>
      </View>
    );
  }

  const effectiveTab: SubTab = bothEnabled ? activeSubTab : medication ? 'medication' : 'cycle';

  return (
    <View style={{ flex: 1, backgroundColor: theme.page }}>
      {bothEnabled && (
        <ScrollView
          ref={scrollViewRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ flexGrow: 1, paddingBottom: tourPadding }}
          keyboardShouldPersistTaps="handled"
          stickyHeaderIndices={[0]}
          scrollEventThrottle={16}
          onScroll={(e) => { scrollOffsetRef.current = e.nativeEvent.contentOffset.y; }}
        >
          {/* Sticky overview blocks */}
          <View style={{ backgroundColor: theme.page, padding: 12, paddingBottom: 4 }}>
            <View style={{ flexDirection: "row", justifyContent: "flex-end", marginBottom: 4 }}>
              <Pressable onPress={() => setShowSectionEditor(true)} hitSlop={10} accessibilityLabel="Customize Health screen">
                <Ionicons name="pencil-outline" size={17} color={theme.textSoft} />
              </Pressable>
            </View>
            <View ref={tourOverviewRef}>
              <OverviewBlocks onNavigate={setActiveSubTab} activeSubTab={effectiveTab} theme={theme} hiddenSections={hiddenSections} />
            </View>
          </View>

          {/* Active sub-tab content — not full-screen scrollable, rendered inline */}
          <View ref={tourContentRef}>
            {effectiveTab === 'medication' && <MedicationList theme={theme} scrollEnabled={false} />}
            {effectiveTab === 'cycle' && !hiddenSections.includes('cycle_tab') && <CycleView theme={theme} />}
            {effectiveTab === 'symptoms' && !hiddenSections.includes('symptoms_tab') && <SymptomsView theme={theme} />}
          </View>
        </ScrollView>
      )}

      {!bothEnabled && (
        <>
          {medication && <MedicationList theme={theme} scrollEnabled={true} />}
          {cycle && !medication && !hiddenSections.includes('cycle_tab') && <CycleView theme={theme} />}
        </>
      )}

      <SectionEditorModal
        visible={showSectionEditor}
        title="Customize Health"
        sections={HEALTH_SECTIONS}
        hidden={hiddenSections}
        onSave={handleSaveSections}
        onCancel={() => setShowSectionEditor(false)}
      />
      <FeatureTour steps={HEALTH_TOUR_STEPS} visible={showTour} onDone={() => setShowTour(false)} scrollRef={scrollViewRef} scrollY={scrollOffsetRef.current} onExtraPadding={setTourPadding} />
    </View>
  );
}



const rootStyles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  placeholder: { fontSize: 14, textAlign: 'center', lineHeight: 22 },
});
