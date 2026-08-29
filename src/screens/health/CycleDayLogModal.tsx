import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Modal, TextInput, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { api } from '../../api/client';
import { fmtDate } from '../../utils/dateUtils';
import { FLOW_OPTIONS, FLOW_COLORS } from '../../constants';
import { ChipButton } from '../../components/ChipButton';
import { ModalHeader } from '../../components/ModalHeader';
import { CycleLog, modalStyles } from './shared';

export function CycleDayLogModal({
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
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={modalStyles.overlay}>
        <View style={[modalStyles.sheet, { backgroundColor: theme.card, borderColor: theme.ink }]}>
          <ModalHeader title={fmtDate(date)} onClose={onClose} />
          <ScrollView contentContainerStyle={{ gap: 16, paddingBottom: 20 }} keyboardShouldPersistTaps="handled">
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
      </KeyboardAvoidingView>
    </Modal>
  );
}

const cycleStyles = StyleSheet.create({
  label: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  flowBtn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 20 },
  input: { borderWidth: 2, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  addBtn: { borderWidth: 2, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
});
