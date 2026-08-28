import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, TextInput, Alert, ActivityIndicator, Animated, LayoutAnimation, Platform, UIManager, Modal, KeyboardAvoidingView } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { api } from '../../api/client';
import { addDays, todayStr } from '../../utils/dateUtils';
import { coloredShadow } from '../../theme/styleUtils';
import { IconBadge } from '../../components/IconBadge';
import { LongPressActionMenu } from '../../components/LongPressActionMenu';
import { Medication, MedSlot, computeMedStatus, statusBadge, nextDoseCallout, TOD_HOUR } from './shared';
import { AddMedicationModal, MedicationInfoModal } from './AddMedicationModal';
import { AdherenceHero } from './AdherenceHero';
import { ThemedIcon } from '../../theme/iconRegistry';

function formatTime(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours() % 12 || 12;
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m} ${d.getHours() >= 12 ? 'PM' : 'AM'}`;
}

function slotDisplayTime(slot: MedSlot): string {
  if (slot.specific_time) {
    const [hh, mm] = slot.specific_time.split(':').map(Number);
    const h = hh % 12 || 12;
    const ampm = hh >= 12 ? 'PM' : 'AM';
    return `${h}:${String(mm).padStart(2, '0')} ${ampm}`;
  }
  const hour = TOD_HOUR[slot.time_of_day] ?? 8;
  const h = hour % 12 || 12;
  return `${h}:00 ${hour >= 12 ? 'PM' : 'AM'}`;
}

function computeMedStreak(dates: string[]): number {
  if (!dates.length) return 0;
  const set = new Set(dates);
  let streak = 0;
  const today = new Date();
  for (let i = 1; i <= 30; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    if (set.has(d.toISOString().slice(0, 10))) streak++;
    else break;
  }
  return streak;
}

/** Map time-of-day bucket to an icon slot. */
function bucketSlotId(bucket: string): string {
  const map: Record<string, string> = {
    morning: 'greeting.morning',
    midday:  'greeting.afternoon',
    evening: 'greeting.evening',
    custom:  'ui.clock_alarm',
  };
  return map[bucket] ?? 'ui.clock_alarm';
}

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function toggleWithAnimation(setter: React.Dispatch<React.SetStateAction<Record<string, boolean>>>, bucket: string, value: boolean) {
  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  setter((prev) => ({ ...prev, [bucket]: value }));
}

export function MedicationList({ theme, scrollEnabled = true }: { theme: any; scrollEnabled?: boolean }) {
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
  // Buckets with every dose taken collapse to a compact row; user can re-expand
  const [expandedBuckets, setExpandedBuckets] = useState<Record<string, boolean>>({});
  const [showPerfectDay, setShowPerfectDay] = useState(false);
  const perfectAnim = useRef(new Animated.Value(0)).current;
  const prevTakenRef = useRef<number | null>(null);
  const [prnSummary, setPrnSummary] = useState<Record<string, { today_count: number; last_taken: string | null; last_log_id: string | null }>>({});
  const [medSearch, setMedSearch] = useState('');
  const [medHistory, setMedHistory] = useState<Record<string, string[]>>({});
  const [calView, setCalView] = useState(false);
  const [noteModal, setNoteModal] = useState<{ medId: string; medName: string; current: string } | null>(null);
  const [noteText, setNoteText] = useState('');

  const load = useCallback(async () => {
    try {
      const meds = await api.getMedications();
      setMedications(meds ?? []);
    } catch {
      setMedications([]);
    } finally {
      setLoading(false);
    }
    try {
      const rows = await api.getPrnSummary();
      const map: Record<string, { today_count: number; last_taken: string | null; last_log_id: string | null }> = {};
      for (const r of (rows ?? [])) map[r.medication_id] = { today_count: r.today_count, last_taken: r.last_taken, last_log_id: r.last_log_id };
      setPrnSummary(map);
    } catch {
      setPrnSummary({});
    }
  }, []);

  useEffect(() => { load(); }, [load, refresh]);

  // Fetch 7-day history for all meds after medications load
  useEffect(() => {
    if (medications.length === 0) return;
    const map: Record<string, string[]> = {};
    Promise.allSettled(
      medications.map(med =>
        api.getMedicationHistory(med.id).then((hist: any[]) => {
          map[med.id] = (hist ?? []).map((h: any) => h.date ?? h.taken_at?.slice(0, 10)).filter(Boolean);
        })
      )
    ).then(() => setMedHistory({ ...map }));
  }, [medications.map(m => m.id).join(',')]);

  // Refresh on focus so meds added elsewhere (e.g. CSV import screen) show up
  const firstFocusRef = useRef(true);
  useFocusEffect(useCallback(() => {
    if (firstFocusRef.current) { firstFocusRef.current = false; return; }
    load();
  }, [load]));

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

  async function takePrn(med: Medication) {
    try {
      await api.logPrnDose(med.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setRefresh((r) => r + 1);
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed');
    }
  }

  async function undoPrn(medicationId: string) {
    const logId = prnSummary[medicationId]?.last_log_id;
    if (!logId) return;
    try {
      await api.deleteDoseLog(logId);
      setRefresh((r) => r + 1);
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed');
    }
  }

  function markRefilled(med: Medication) {
    const options = [30, 60, 90].map((days) => ({
      text: `${days}-day supply`,
      onPress: async () => {
        try {
          await api.updateMedication(med.id, { refill_date: addDays(todayStr(), days) });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          setRefresh((r) => r + 1);
        } catch (err: any) {
          Alert.alert('Error', err?.message ?? 'Failed');
        }
      },
    }));
    Alert.alert('Mark refilled', `When will ${med.name} need refilling next?`, [
      ...options,
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  function agoLabel(ts: string): string {
    const mins = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const h = Math.floor(mins / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return `${d}d ago`;
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

  // Today's scheduled slot counts (mirrors OverviewBlocks logic)
  const scheduledToday = medications.filter((m) => {
    if (m.is_prn) return false;
    if (m.frequency === 'weekly') return m.day_of_week === todayDowList;
    return true;
  });
  const totalToday = scheduledToday.reduce((acc, m) => acc + m.slots.length, 0);
  const takenToday = scheduledToday.reduce((acc, m) => acc + m.slots.filter((s) => s.dose_log !== null).length, 0);

  // Perfect-day celebration: fires only on the transition from incomplete → all taken
  useEffect(() => {
    if (loading) return;
    const prev = prevTakenRef.current;
    prevTakenRef.current = takenToday;
    if (prev != null && totalToday > 0 && takenToday >= totalToday && prev < totalToday) {
      setShowPerfectDay(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      perfectAnim.setValue(0);
      Animated.sequence([
        Animated.spring(perfectAnim, { toValue: 1, friction: 5, useNativeDriver: true }),
        Animated.delay(1600),
        Animated.timing(perfectAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start(() => setShowPerfectDay(false));
    }
  }, [takenToday, totalToday, loading]);

  const content = loading ? (
    <ActivityIndicator color={theme.teal.solid} style={{ marginTop: 40 }} />
  ) : (
    <>
          {/* Adherence hero + missed-dose banner */}
          <AdherenceHero
            theme={theme}
            takenToday={takenToday}
            totalToday={totalToday}
            refresh={refresh}
            onChanged={() => setRefresh((r) => r + 1)}
          />

          {/* Next dose callout */}
          {(() => { const msg = nextDoseCallout(medications); return msg ? (
            <View style={[medStyles.nextDoseBar, { backgroundColor: theme.teal.tint, borderColor: theme.teal.solid }]}>
              <Text style={{ fontSize: 14 }}>⏰</Text>
              <Text style={[medStyles.nextDoseText, { color: theme.teal.sub }]}>Next: {msg}</Text>
            </View>
          ) : null; })()}

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={[medStyles.sectionHead, { color: theme.textStrong }]}>Today's Schedule</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Pressable onPress={() => setCalView(v => !v)} style={{ padding: 4 }}>
                <Ionicons name={calView ? 'list-outline' : 'grid-outline'} size={18} color={theme.teal.solid} />
              </Pressable>
              <Pressable onPress={() => { setSelectMode((s) => !s); setSelectedSlotIds([]); }}>
                <Text style={{ color: theme.teal.solid, fontWeight: '700', fontSize: 13 }}>{selectMode ? 'Done' : 'Select'}</Text>
              </Pressable>
            </View>
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
          {calView ? (() => {
            const DOW = ['M','T','W','T','F','S','S'];
            const todayD = new Date();
            const weekDates = Array.from({ length: 7 }, (_, i) => {
              const d = new Date(todayD);
              const offset = todayD.getDay() === 0 ? -6 : 1 - todayD.getDay();
              d.setDate(todayD.getDate() + offset + i);
              return d.toISOString().slice(0, 10);
            });
            const scheduledMeds = medications.filter(m => !m.is_prn);
            const todayStr2 = todayD.toISOString().slice(0, 10);
            return (
              <View style={{ borderRadius: 16, borderWidth: 1.5, borderColor: theme.cardBorder, backgroundColor: theme.card, overflow: 'hidden' }}>
                <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: theme.cardBorder }}>
                  <View style={{ width: 100, padding: 8 }} />
                  {DOW.map((d, i) => (
                    <View key={i} style={{ flex: 1, alignItems: 'center', paddingVertical: 6 }}>
                      <Text style={{ fontSize: 10, fontWeight: '800', color: theme.textSoft }}>{d}</Text>
                    </View>
                  ))}
                </View>
                {scheduledMeds.map((med, mi) => (
                  <View key={med.id} style={{ flexDirection: 'row', borderTopWidth: mi === 0 ? 0 : 1, borderTopColor: theme.cardBorder, alignItems: 'center' }}>
                    <View style={{ width: 100, padding: 8 }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: theme.textStrong }} numberOfLines={1}>{med.name}</Text>
                    </View>
                    {weekDates.map((date, di) => {
                      const history = medHistory[med.id] ?? [];
                      const taken = history.includes(date);
                      const isToday = date === todayStr2;
                      const takenToday = isToday && med.slots.some(s => s.dose_log !== null);
                      const show = isToday ? takenToday : taken;
                      return (
                        <View key={di} style={{ flex: 1, alignItems: 'center', paddingVertical: 10 }}>
                          <View style={{ width: 14, height: 14, borderRadius: 3, backgroundColor: show ? theme.teal.solid : theme.cardBorder, opacity: show ? 1 : 0.5 }} />
                        </View>
                      );
                    })}
                  </View>
                ))}
              </View>
            );
          })() : null}

          {!calView && Object.entries(buckets).map(([bucket, meds]) => {
            if (meds.length === 0) return null;
            const bucketSlots = meds
              .map((med) => med.slots.find((s) => {
                const b = ['morning', 'midday', 'evening'].includes(s.time_of_day) ? s.time_of_day : 'custom';
                return b === bucket;
              }))
              .filter((s): s is MedSlot => !!s);
            const takenCount = bucketSlots.filter((s) => s.dose_log !== null).length;
            const allTaken = bucketSlots.length > 0 && takenCount === bucketSlots.length;
            const collapsed = allTaken && !expandedBuckets[bucket];

            if (collapsed) {
              return (
                <Pressable
                  key={bucket}
                  style={[medStyles.collapsedBucket, { backgroundColor: theme.teal.tint, borderColor: theme.teal.solid }]}
                  onPress={() => toggleWithAnimation(setExpandedBuckets, bucket, true)}
                  accessibilityRole="button"
                  accessibilityLabel={`${BUCKET_LABELS[bucket]} complete, ${takenCount} of ${bucketSlots.length} taken. Double tap to expand.`}
                >
                  <ThemedIcon slot={bucketSlotId(bucket)} size={15} />
                  <Text style={[medStyles.bucketLabel, { color: theme.teal.fg, flex: 1 }]} allowFontScaling maxFontSizeMultiplier={1.3}>
                    {BUCKET_LABELS[bucket]}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ color: theme.teal.fg, fontWeight: '800', fontSize: 12 }} allowFontScaling maxFontSizeMultiplier={1.3}>
                      ✓ {takenCount}/{bucketSlots.length} taken
                    </Text>
                    <Text style={{ color: theme.teal.fg, fontSize: 12 }}>⌄</Text>
                  </View>
                </Pressable>
              );
            }

            return (
              <View key={bucket} style={[medStyles.bucket, { backgroundColor: theme.card, borderColor: theme.cardBorder, ...coloredShadow(theme.teal.solid) }]}>
                <View style={medStyles.bucketHeader}>
                  <Pressable
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}
                    disabled={!allTaken}
                    onPress={() => toggleWithAnimation(setExpandedBuckets, bucket, false)}
                    accessibilityRole={allTaken ? 'button' : undefined}
                    accessibilityLabel={allTaken ? `${BUCKET_LABELS[bucket]}, all taken. Double tap to collapse.` : undefined}
                  >
                    <ThemedIcon slot={bucketSlotId(bucket)} size={14} />
                    <Text style={[medStyles.bucketLabel, { color: theme.textStrong }]} allowFontScaling maxFontSizeMultiplier={1.3} accessibilityRole="header">{BUCKET_LABELS[bucket]}</Text>
                    <Text style={{ color: theme.textSoft, fontSize: 11, fontWeight: '700' }} allowFontScaling maxFontSizeMultiplier={1.3}>
                      {takenCount}/{bucketSlots.length}
                    </Text>
                    {allTaken && <Text style={{ color: theme.textSoft, fontSize: 12 }}>⌃</Text>}
                  </Pressable>
                  {!allTaken && (
                    <Pressable
                      onPress={() => markAllTaken(bucket)}
                      accessibilityRole="button"
                      accessibilityLabel={`Mark all ${BUCKET_LABELS[bucket]} doses as taken`}
                      hitSlop={6}
                    >
                      <Text style={{ color: theme.teal.solid, fontWeight: '700', fontSize: 12 }} allowFontScaling maxFontSizeMultiplier={1.3}>Mark all</Text>
                    </Pressable>
                  )}
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
                      accessibilityRole={selectMode ? "checkbox" : "button"}
                      accessibilityState={{ checked: taken, selected: isSelected }}
                      accessibilityLabel={`${med.name}${med.dosage ? " " + med.dosage : ""}, ${taken ? "taken" : "not taken"}`}
                      accessibilityHint={selectMode ? "Double tap to add to selection" : (taken ? "Double tap to unmark" : "Double tap to mark taken")}
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
                            <View style={{ backgroundColor: theme.amber.solid, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 }}>
                              <Text style={{ color: theme.amber.fg, fontSize: 10, fontWeight: '700' }}>PRN</Text>
                            </View>
                          )}
                        </View>
                        {med.dosage ? <Text style={{ color: theme.textSoft, fontSize: 12 }}>{med.dosage}</Text> : null}
                        {med.frequency === 'weekly' && med.day_of_week != null && (
                          <Text style={{ color: theme.textSoft, fontSize: 11 }}>Weekly — {DOW_NAMES[med.day_of_week]}</Text>
                        )}
                        <Text style={{ color: theme.textSoft, fontSize: 11 }}>⏰ {slotDisplayTime(slot)}</Text>
                        {slot.dose_log !== null && (
                          <Text style={{ color: theme.teal.sub, fontSize: 11 }}>✓ Taken {formatTime(slot.dose_log.taken_at)}</Text>
                        )}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            );
          })}

          {/* Missed dose recovery prompts */}
          {!calView && (() => {
            const now = new Date();
            const nowH = now.getHours();
            const BUCKET_CUTOFF: Record<string, number> = { morning: 12, midday: 18, evening: 24 };
            const missedBuckets: { bucket: string; slots: MedSlot[]; meds: Medication[] }[] = [];
            for (const [bucket, bMeds] of Object.entries(buckets)) {
              if (bMeds.length === 0) continue;
              const cutoff = BUCKET_CUTOFF[bucket];
              if (cutoff === undefined || nowH < cutoff) continue;
              const bucketSlots = bMeds.map(med => med.slots.find(s => {
                const b = ['morning','midday','evening'].includes(s.time_of_day) ? s.time_of_day : 'custom';
                return b === bucket;
              })).filter((s): s is MedSlot => !!s);
              const unTaken = bucketSlots.filter(s => s.dose_log === null);
              if (unTaken.length === 0) continue;
              missedBuckets.push({ bucket, slots: unTaken, meds: bMeds.filter((_, i) => bucketSlots[i]?.dose_log === null) });
            }
            if (missedBuckets.length === 0) return null;
            return missedBuckets.map(({ bucket, slots, meds: missedMeds }) => (
              <View key={bucket} style={{ backgroundColor: theme.coral?.tint ?? '#FFF0F0', borderRadius: 14, borderWidth: 1.5, borderColor: theme.coral?.solid ?? '#C0392B', padding: 12, gap: 8 }}>
                <Text style={{ color: theme.coral?.solid ?? '#C0392B', fontWeight: '800', fontSize: 13 }}>
                  Missed {BUCKET_LABELS[bucket]} dose{slots.length > 1 ? 's' : ''}
                </Text>
                <Text style={{ color: theme.textSoft, fontSize: 12 }}>
                  {missedMeds.map(m => m.name).join(', ')} — log it anyway?
                </Text>
                <Pressable
                  onPress={async () => {
                    try {
                      await api.markSelectedTaken(slots.map(s => s.id));
                      setRefresh(r => r + 1);
                    } catch {}
                  }}
                  style={{ alignSelf: 'flex-start', borderRadius: 10, borderWidth: 1.5, borderColor: theme.coral?.solid ?? '#C0392B', paddingHorizontal: 12, paddingVertical: 5 }}
                >
                  <Text style={{ color: theme.coral?.solid ?? '#C0392B', fontWeight: '700', fontSize: 12 }}>Log as taken</Text>
                </Pressable>
              </View>
            ));
          })()}

          {/* PRN quick-take */}
          {(() => {
            const prnMeds = medications.filter((m) => m.active && m.is_prn);
            if (prnMeds.length === 0) return null;
            return (
              <View style={[medStyles.bucket, { backgroundColor: theme.card, borderColor: theme.cardBorder, ...coloredShadow(theme.amber?.solid ?? '#D97706') }]}>
                <View style={medStyles.bucketHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <ThemedIcon slot="ui.hand" size={14} />
                    <Text style={[medStyles.bucketLabel, { color: theme.textStrong }]} allowFontScaling maxFontSizeMultiplier={1.3} accessibilityRole="header">As needed</Text>
                  </View>
                </View>
                {prnMeds.map((med) => {
                  const sum = prnSummary[med.id];
                  const subParts: string[] = [];
                  if (sum?.today_count) subParts.push(`${sum.today_count} today`);
                  if (sum?.last_taken) subParts.push(`last ${agoLabel(sum.last_taken)}`);
                  return (
                    <View key={med.id} style={[medStyles.medRow, { borderTopColor: theme.cardBorder }]}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={[medStyles.medName, { color: theme.textStrong }]}>{med.name}</Text>
                          {med.dosage ? <Text style={{ color: theme.textSoft, fontSize: 12 }}>{med.dosage}</Text> : null}
                        </View>
                        {subParts.length > 0 ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={{ color: theme.textSoft, fontSize: 12 }}>{subParts.join(' · ')}</Text>
                            {sum?.last_log_id ? (
                              <Pressable onPress={() => undoPrn(med.id)} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Undo last ${med.name} dose`}>
                                <Text style={{ color: theme.teal.solid, fontSize: 12, fontWeight: '700', textDecorationLine: 'underline' }}>Undo</Text>
                              </Pressable>
                            ) : null}
                          </View>
                        ) : (
                          <Text style={{ color: theme.textSoft, fontSize: 12 }}>None today</Text>
                        )}
                      </View>
                      <Pressable
                        style={[medStyles.prnTakeBtn, { backgroundColor: theme.amber?.solid ?? '#D97706', borderColor: theme.ink }]}
                        onPress={() => takePrn(med)}
                        accessibilityRole="button"
                        accessibilityLabel={`Log a dose of ${med.name} now`}
                      >
                        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>Take now</Text>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            );
          })()}

          <Text style={[medStyles.sectionHead, { color: theme.textStrong, marginTop: 8 }]}>My Medications</Text>
          <Pressable
            style={[medStyles.addBtn, { borderColor: theme.ink, backgroundColor: theme.teal.tint, shadowColor: "rgba(60,40,20,0.1)" }]}
            onPress={() => setShowAddModal(true)}
          >
            <Text style={{ color: theme.teal.fg, fontWeight: '700', fontSize: 14 }}>+ Add medication</Text>
          </Pressable>

          {/* Search — only shown once the list is long enough to need it */}
          {medications.length > 8 && (
            <TextInput
              style={[medStyles.searchInput, { borderColor: theme.cardBorder, color: theme.textStrong, backgroundColor: theme.card }]}
              placeholder="Search medications…"
              placeholderTextColor={theme.textSoft}
              value={medSearch}
              onChangeText={setMedSearch}
              accessibilityLabel="Search medications"
            />
          )}

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
            const q = medSearch.trim().toLowerCase();
            const searched = q
              ? medications.filter((m) =>
                  [m.name, m.brand_name, m.generic_name, m.purpose, m.prescriber?.name]
                    .some((v) => v && v.toLowerCase().includes(q)))
              : medications;
            if (medications.length === 0) {
              return (
                <View style={{ padding: 24, borderRadius: 22, borderWidth: 2, borderColor: theme.cardBorder, backgroundColor: theme.card, alignItems: 'center', gap: 8 }}>
                  <ThemedIcon slot="health.meds_block" size={30} />
                  <Text style={{ color: theme.textStrong, fontSize: 14, fontWeight: '700', textAlign: 'center' }}>No medications yet</Text>
                  <Text style={{ color: theme.textSoft, fontSize: 12, textAlign: 'center', lineHeight: 18 }}>
                    Add your first medication above to start tracking doses, refills, and adherence.
                  </Text>
                </View>
              );
            }
            if (q && searched.length === 0) {
              return (
                <Text style={{ color: theme.textSoft, fontSize: 13, textAlign: 'center', paddingVertical: 16 }}>
                  No medications match "{medSearch.trim()}"
                </Text>
              );
            }
            const grouped: Record<Group, Medication[]> = { overdue: [], soon: [], active: [], prn: [] };
            for (const m of searched) {
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
            const badge = statusBadge(status, theme);
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

            // 7-day heatmap
            const cardToday = new Date();
            const weekDaysCard = Array.from({ length: 7 }, (_, i) => {
              const d = new Date(cardToday);
              const dayOfWeek = cardToday.getDay();
              const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
              d.setDate(cardToday.getDate() + mondayOffset + i);
              return d.toISOString().slice(0, 10);
            });
            const cardTodayStr = cardToday.toISOString().slice(0, 10);
            const history = medHistory[med.id] ?? [];
            const takenTodayCard = med.slots.some(s => s.dose_log !== null);

            // Streak badge
            const streak = computeMedStreak(history);

            // Supply level bar
            let supplyPct = 0;
            let supplyColor = theme.teal.solid;
            if (refillDays !== null && med.created_at) {
              const createdAt = new Date(med.created_at).getTime();
              const totalDays = Math.min(90, (new Date(med.refill_date!).getTime() - createdAt) / 86400000);
              const daysUsed = (Date.now() - createdAt) / 86400000;
              supplyPct = Math.max(0, Math.min(1, 1 - daysUsed / Math.max(1, totalDays)));
              supplyColor = supplyPct > 0.4 ? theme.teal.solid : supplyPct > 0.15 ? (theme.amber?.solid ?? '#D97706') : (theme.coral?.solid ?? '#C0392B');
            }

            return (
              <LongPressActionMenu
                key={med.id}
                title={med.name}
                onPress={() => navigation.navigate('MedicationHistory', { medicationId: med.id, medicationName: med.name })}
                actions={[
                  { label: 'Edit', onPress: () => { setEditMed(med); setShowEditModal(true); } },
                  { label: med.notes ? 'Edit note' : 'Add note', onPress: () => { setNoteModal({ medId: med.id, medName: med.name, current: med.notes ?? '' }); setNoteText(med.notes ?? ''); } },
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
                      {streak >= 3 && (
                        <View style={{ backgroundColor: theme.amber?.solid ?? '#D97706', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
                          <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>🔥 {streak}d</Text>
                        </View>
                      )}
                      {med.is_prn && (
                        <View style={{ backgroundColor: theme.amber.solid, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 }}>
                          <Text style={{ color: theme.amber.fg, fontSize: 10, fontWeight: '700' }}>PRN</Text>
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
                    {med.notes ? (
                      <Text style={{ color: theme.textSoft, fontSize: 12, fontStyle: 'italic' }} numberOfLines={2}>{med.notes}</Text>
                    ) : null}
                    {med.is_prn ? (
                      <Text style={{ color: theme.textSoft, fontSize: 12 }}>As needed (PRN)</Text>
                    ) : med.frequency === 'weekly' ? (
                      <Text style={{ color: theme.textSoft, fontSize: 12 }}>
                        Weekly — {med.day_of_week != null ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][med.day_of_week] : 'No day set'}
                      </Text>
                    ) : (
                      <Text style={{ color: theme.textSoft, fontSize: 12 }}>
                        {med.slots.map((s) => s.time_of_day).join(', ') || 'No schedule'}
                      </Text>
                    )}
                    {/* 7-day adherence heatmap */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                      <Text style={{ color: theme.textSoft, fontSize: 10, fontWeight: '700' }}>7d</Text>
                      {weekDaysCard.map((date, di) => {
                        const isToday = date === cardTodayStr;
                        const taken = isToday ? takenTodayCard : history.includes(date);
                        const isFuture = date > cardTodayStr;
                        const color = taken ? theme.teal.solid : (isFuture ? theme.cardBorder : (theme.coral?.solid ?? '#C0392B') + '55');
                        return (
                          <View key={di} style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: color, opacity: isFuture ? 0.4 : 1 }} />
                        );
                      })}
                    </View>
                    {refillDays !== null && (
                      <View style={{ marginTop: 2 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={{ color: refillDays <= 0 ? theme.coral.solid : theme.textSoft, fontSize: 12 }}>
                            {refillDays <= 0 ? 'Refill overdue' : `Refill in ${refillDays} day${refillDays !== 1 ? 's' : ''}`}
                          </Text>
                          {refillDays <= 7 && (
                            <Pressable
                              style={[medStyles.refilledBtn, { borderColor: theme.teal.solid, backgroundColor: theme.teal.tint }]}
                              onPress={() => markRefilled(med)}
                              hitSlop={4}
                              accessibilityRole="button"
                              accessibilityLabel={`Mark ${med.name} as refilled`}
                            >
                              <Text style={{ color: theme.teal.fg, fontWeight: '800', fontSize: 11 }}>↻ Refilled</Text>
                            </Pressable>
                          )}
                        </View>
                        {/* Supply level bar */}
                        <View style={{ height: 4, borderRadius: 2, backgroundColor: theme.cardBorder, marginTop: 4, overflow: 'hidden' }}>
                          <View style={{ height: 4, borderRadius: 2, width: `${supplyPct * 100}%` as any, backgroundColor: supplyColor }} />
                        </View>
                      </View>
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
            brandName: editMed.brand_name ?? '',
            genericName: editMed.generic_name ?? '',
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

      {noteModal && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setNoteModal(null)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 }}>
              <View style={{ backgroundColor: theme.card, borderRadius: 20, borderWidth: 2, borderColor: theme.cardBorder, padding: 20, gap: 12 }}>
                <Text style={{ color: theme.textStrong, fontSize: 16, fontWeight: '800' }}>{noteModal.medName}</Text>
                <TextInput
                  style={{ borderWidth: 1.5, borderColor: theme.cardBorder, borderRadius: 12, padding: 10, color: theme.textStrong, fontSize: 14, minHeight: 80, textAlignVertical: 'top', backgroundColor: theme.bg }}
                  placeholder="Add a note…"
                  placeholderTextColor={theme.textSoft}
                  value={noteText}
                  onChangeText={setNoteText}
                  multiline
                  autoFocus
                />
                <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'flex-end' }}>
                  <Pressable onPress={() => setNoteModal(null)} style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
                    <Text style={{ color: theme.textSoft, fontWeight: '700' }}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    style={{ backgroundColor: theme.teal.solid, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 8 }}
                    onPress={async () => {
                      try {
                        await api.updateMedication(noteModal.medId, { notes: noteText });
                        setNoteModal(null);
                        setRefresh(r => r + 1);
                      } catch (err: any) {
                        Alert.alert('Error', err?.message ?? 'Failed to save note');
                      }
                    }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '800' }}>Save</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      )}

      {showPerfectDay && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: '28%',
            left: 24,
            right: 24,
            alignItems: 'center',
            opacity: perfectAnim,
            transform: [{ scale: perfectAnim.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }],
          }}
        >
          <View style={[medStyles.perfectCard, { backgroundColor: theme.teal.solid, borderColor: theme.ink }]}>
            <ThemedIcon slot="ui.celebrate" size={34} />
            <Text style={{ color: '#fff', fontWeight: '900', fontSize: 16 }}>Perfect day!</Text>
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>All {totalToday} doses taken</Text>
          </View>
        </Animated.View>
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
  collapsedBucket: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 22,
    borderWidth: 2,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  perfectCard: {
    borderRadius: 26,
    borderWidth: 2.5,
    paddingVertical: 18,
    paddingHorizontal: 28,
    alignItems: 'center',
    gap: 2,
    shadowColor: "rgba(60,40,20,0.25)",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10,
  },
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
    shadowColor: "rgba(60,40,20,0.1)",
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
  prnTakeBtn: {
    borderWidth: 2,
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  refilledBtn: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  searchInput: {
    borderWidth: 2,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
  },
});
