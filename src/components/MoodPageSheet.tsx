import React, { useState } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  StyleSheet
} from "react-native";
import { LoadingIndicator } from "./LoadingIndicator";
import * as Haptics from "expo-haptics";
import { useTheme } from "../theme/ThemeContext";
import { api } from "../api/client";
import { toast } from "../lib/toast";

// ─── Types ────────────────────────────────────────────────────────────────────

type MoodPeriod = "morning" | "afternoon" | "evening" | "night";

type JournalEntry = {
  id: string;
  logged_at: string;
  mood_score: number;
  mood_label: string | null;
  entry_text: string | null;
  period: string | null;
  entry_type: string;
};

// ─── Data ─────────────────────────────────────────────────────────────────────

const PERIOD_META: Record<MoodPeriod, { label: string; emoji: string }> = {
  morning:   { label: "Morning",   emoji: "🌅" },
  afternoon: { label: "Afternoon", emoji: "☀️" },
  evening:   { label: "Evening",   emoji: "🌆" },
  night:     { label: "Night",     emoji: "🌙" },
};

const BUCKET_ORDER: MoodPeriod[] = MOOD_BUCKET_ORDER as MoodPeriod[];

const SCORE_EMOJI: Record<number, string> = { 5: "😃", 4: "🙂", 3: "😐", 2: "😕", 1: "😣" };

import { MOOD_CATEGORIES } from "../constants/moodCategories";
import { BUCKET_ORDER as MOOD_BUCKET_ORDER } from "../constants";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeOfDayBucket(date: Date): MoodPeriod {
  const h = date.getHours();
  if (h >= 5 && h < 11) return "morning";
  if (h >= 11 && h < 16) return "afternoon";
  if (h >= 16 && h < 21) return "evening";
  return "night";
}

function findMoodByLabel(label: string): { label: string; score: number; colorKey: string } | null {
  for (const cat of MOOD_CATEGORIES) {
    const found = cat.moods.find((m) => m.label === label);
    if (found) return { label: found.label, score: cat.score, colorKey: cat.colorKey };
  }
  return null;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  todayEntries: JournalEntry[];
  currentBucket: MoodPeriod;
  onDismiss: () => void;
  onSubmitted: () => void;
}

export function MoodPageSheet({ visible, todayEntries, currentBucket, onDismiss, onSubmitted }: Props) {
  const { theme } = useTheme();
  const ink = theme.ink;

  const [activePeriod, setActivePeriod] = useState<MoodPeriod | null>(null);
  const [selected, setSelected] = useState<{ label: string; score: number; colorKey: string } | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Build entry map from today's period entries
  const entryPerPeriod: Partial<Record<MoodPeriod, JournalEntry>> = {};
  for (const e of todayEntries) {
    if (e.entry_type === "moment") continue;
    const p = (e.period ?? timeOfDayBucket(new Date(e.logged_at))) as MoodPeriod;
    entryPerPeriod[p] = e;
  }

  function handlePeriodPress(period: MoodPeriod) {
    Haptics.selectionAsync();
    const existing = entryPerPeriod[period];
    if (existing) {
      setNote(existing.entry_text ?? "");
      setSelected(existing.mood_label ? findMoodByLabel(existing.mood_label) : null);
    } else {
      setNote("");
      setSelected(null);
    }
    setActivePeriod(period);
  }

  function handleBack() {
    setActivePeriod(null);
    setSelected(null);
    setNote("");
  }

  async function handleLog() {
    if (!selected || !activePeriod) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSubmitting(true);
    try {
      await api.upsertPeriodMood(selected.score, activePeriod, selected.label, note.trim() || undefined);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast("Check-in saved.");
      setSelected(null);
      setNote("");
      setActivePeriod(null);
      onSubmitted();
    } catch {
      toast("Couldn't save — try again.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  function handleDismiss() {
    setActivePeriod(null);
    setSelected(null);
    setNote("");
    onDismiss();
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleDismiss}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={handleDismiss} />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.sheetWrapper}
        pointerEvents="box-none"
      >
        <View style={[styles.sheet, { backgroundColor: theme.page, borderColor: ink }]}>

          {activePeriod === null ? (
            // ── Period overview ──────────────────────────────────────────────
            <>
              <View style={[styles.header, { borderBottomColor: ink }]}>
                <Text style={[styles.headerTitle, { color: theme.textStrong }]}>Mood check-ins</Text>
                <Pressable onPress={handleDismiss} style={[styles.closeBtn, { borderColor: ink }]} accessibilityLabel="Close">
                  <Text style={[styles.closeBtnText, { color: ink }]}>✕</Text>
                </Pressable>
              </View>

              <ScrollView style={styles.scroll} contentContainerStyle={{ padding: 16, gap: 10 }} showsVerticalScrollIndicator={false}>
                <Text style={{ color: theme.textSoft, fontSize: 12, marginBottom: 4 }}>
                  Tap a period to log or edit. Each entry is filed under the period matching when you save it.
                </Text>

                {BUCKET_ORDER.map((period) => {
                  const meta = PERIOD_META[period];
                  const entry = entryPerPeriod[period];
                  const isCurrent = period === currentBucket;
                  const catColor = entry ? (theme as any)[findMoodByLabel(entry.mood_label ?? "")?.colorKey ?? "violet"] : null;

                  return (
                    <Pressable
                      key={period}
                      onPress={() => handlePeriodPress(period)}
                      style={[
                        styles.periodRow,
                        {
                          borderColor: ink,
                          backgroundColor: isCurrent ? (theme as any).violet?.tint ?? theme.card : theme.card,
                          shadowColor: "rgba(60,40,20,0.1)",
                        },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={meta.label + (entry ? ": " + (entry.mood_label ?? SCORE_EMOJI[entry.mood_score]) : ": not logged")}
                    >
                      <Text style={styles.periodEmoji}>{meta.emoji}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.periodName, { color: theme.textStrong }]}>{meta.label}</Text>
                        {entry ? (
                          <Text style={{ color: catColor?.fg ?? theme.textSoft, fontSize: 12 }}>
                            {entry.mood_label ?? ""}
                          </Text>
                        ) : (
                          <Text style={{ color: theme.textSoft, fontSize: 12 }}>
                            {isCurrent ? "Tap to log" : "Not logged"}
                          </Text>
                        )}
                      </View>
                      {entry ? (
                        <Text style={styles.periodEmoji}>{SCORE_EMOJI[entry.mood_score] ?? "—"}</Text>
                      ) : isCurrent ? (
                        <View style={[styles.nowBadge, { backgroundColor: (theme as any).violet?.solid ?? ink }]}>
                          <Text style={styles.nowBadgeText}>NOW</Text>
                        </View>
                      ) : null}
                      <Text style={{ color: theme.textSoft, fontSize: 16, marginLeft: 6 }}>›</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </>
          ) : (
            // ── Mood picker for activePeriod ─────────────────────────────────
            <>
              <View style={[styles.header, { borderBottomColor: ink }]}>
                <Pressable onPress={handleBack} style={{ padding: 4, marginRight: 8 }} accessibilityLabel="Back">
                  <Text style={{ color: ink, fontSize: 20, fontWeight: "800" }}>←</Text>
                </Pressable>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.periodLabel, { color: theme.textSoft }]}>
                    {PERIOD_META[activePeriod].emoji}  {PERIOD_META[activePeriod].label.toUpperCase()}
                  </Text>
                  <Text style={[styles.headerTitle, { color: theme.textStrong }]}>How are you feeling?</Text>
                </View>
                <Pressable onPress={handleDismiss} style={[styles.closeBtn, { borderColor: ink }]} accessibilityLabel="Close">
                  <Text style={[styles.closeBtnText, { color: ink }]}>✕</Text>
                </Pressable>
              </View>

              <ScrollView
                style={styles.scroll}
                contentContainerStyle={{ padding: 16, gap: 16 }}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {MOOD_CATEGORIES.map((cat) => {
                  const catColor = (theme as any)[cat.colorKey];
                  return (
                    <View key={cat.label} style={{ gap: 8 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: catColor?.solid ?? ink }} />
                        <Text style={{ color: theme.textSoft, fontSize: 10, fontWeight: "800", letterSpacing: 0.8 }}>
                          {cat.label.toUpperCase()}
                        </Text>
                      </View>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: "row", gap: 6, paddingRight: 4 }}>
                        {cat.moods.map((mood) => {
                          const isSelected = selected?.label === mood.label;
                          return (
                            <Pressable
                              key={mood.label}
                              onPress={() => {
                                Haptics.selectionAsync();
                                setSelected({ label: mood.label, score: cat.score, colorKey: cat.colorKey });
                              }}
                              style={{
                                width: 62,
                                alignItems: "center",
                                paddingVertical: 8,
                                paddingHorizontal: 4,
                                borderRadius: 16,
                                backgroundColor: isSelected ? (catColor?.tint ?? theme.card) : theme.card,
                                borderColor: isSelected ? (catColor?.solid ?? ink) : ink,
                                borderWidth: isSelected ? 2.5 : 2,
                                shadowColor: "rgba(60,40,20,0.1)",
                                shadowOffset: { width: 0, height: isSelected ? 8 : 6 },
                                shadowOpacity: isSelected ? 0.1 : 0.08,
                                shadowRadius: isSelected ? 12 : 10,
                                elevation: isSelected ? 4 : 2,
                              }}
                              accessibilityRole="radio"
                              accessibilityState={{ checked: isSelected }}
                              accessibilityLabel={mood.label}
                            >
                              <Text style={{ fontSize: 20, marginBottom: 4 }}>{mood.emoji}</Text>
                              <Text style={{ fontSize: 9, fontWeight: "800", letterSpacing: 0.3, color: isSelected ? (catColor?.fg ?? ink) : theme.textSoft, textAlign: "center" }}>
                                {mood.label.toUpperCase()}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </ScrollView>
                    </View>
                  );
                })}

                <TextInput
                  value={note}
                  onChangeText={setNote}
                  placeholder="Anything on your mind? (optional)"
                  placeholderTextColor={theme.textSoft}
                  style={[styles.noteInput, { color: theme.textStrong, borderColor: ink, backgroundColor: theme.card }]}
                  multiline
                  accessibilityLabel="Mood note"
                />
              </ScrollView>

              <View style={[styles.actions, { borderTopColor: ink }]}>
                <Pressable onPress={handleBack} style={[styles.skipBtn, { borderColor: ink }]} accessibilityRole="button">
                  <Text style={[styles.skipText, { color: theme.textSoft }]}>BACK</Text>
                </Pressable>
                <Pressable
                  onPress={handleLog}
                  disabled={!selected || submitting}
                  style={[
                    styles.logBtn,
                    {
                      backgroundColor: selected ? (theme as any).coral?.solid ?? ink : theme.cardBorder ?? ink,
                      opacity: selected ? 1 : 0.4,
                      borderColor: ink,
                      shadowColor: "rgba(60,40,20,0.1)",
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Log mood"
                >
                  {submitting
                    ? <LoadingIndicator size="small" color="#fff" />
                    : <Text style={styles.logText}>LOG</Text>}
                </Pressable>
              </View>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheetWrapper: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 2,
    borderBottomWidth: 0,
    maxHeight: "82%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 18,
    borderBottomWidth: 2,
  },
  periodLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    marginBottom: 2,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "900",
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  closeBtnText: {
    fontSize: 14,
    fontWeight: "800",
  },
  scroll: {
    flexGrow: 0,
  },
  periodRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 2,
    borderRadius: 22,
    padding: 14,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
  },
  periodEmoji: {
    fontSize: 22,
  },
  periodName: {
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 2,
  },
  nowBadge: {
    borderRadius: 22,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  nowBadgeText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  noteInput: {
    borderWidth: 2,
    borderRadius: 16,
    padding: 12,
    fontSize: 14,
    minHeight: 56,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    padding: 16,
    borderTopWidth: 2,
  },
  skipBtn: {
    flex: 1,
    borderWidth: 2,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  skipText: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 1,
  },
  logBtn: {
    flex: 2,
    borderWidth: 2,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  logText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 1,
  },
});
