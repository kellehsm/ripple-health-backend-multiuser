import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Pressable, ScrollView, Modal, TextInput, Alert, ActivityIndicator } from 'react-native';
import { api } from '../../api/client';
import { ColorCategory, MedPrescriber, Medication, modalStyles } from './shared';

export function AddMedicationModal({
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

export function MedicationInfoModal({ med, theme, onClose }: { med: Medication; theme: any; onClose: () => void }) {
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
