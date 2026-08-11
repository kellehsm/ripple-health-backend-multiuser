import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { toast } from "./toast";
import { api } from "../api/client";

const KEY = "mindfulness_stats";

interface MindfulnessStats {
  total: number;
  byType: Record<string, number>;
}

async function loadStats(): Promise<MindfulnessStats> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { total: 0, byType: {} };
}

async function recordCompletion(type: string): Promise<number> {
  const stats = await loadStats();
  stats.total += 1;
  stats.byType[type] = (stats.byType[type] ?? 0) + 1;
  try {
    await SecureStore.setItemAsync(KEY, JSON.stringify(stats));
  } catch {}
  return stats.total;
}

const MILESTONE_MESSAGES: Record<number, string> = {
  1:   "First mindfulness session complete — great start!",
  3:   "3 sessions done. You're building a habit.",
  5:   "5 sessions in — consistency is the real win.",
  10:  "10 sessions! Your mind is thanking you.",
  20:  "20 sessions. You've made this a practice.",
  50:  "50 sessions — that's real dedication.",
  100: "100 sessions. You're a mindfulness pro.",
};

const TODAY_KEY = "ripple_mindfulness_today";

export async function getTodayCompletedSections(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(TODAY_KEY);
    if (!raw) return [];
    const parsed: { date: string; sections: string[] } = JSON.parse(raw);
    if (parsed.date !== new Date().toDateString()) return [];
    return parsed.sections ?? [];
  } catch { return []; }
}

async function recordTodaySection(type: string): Promise<void> {
  try {
    const existing = await getTodayCompletedSections();
    if (!existing.includes(type)) {
      await AsyncStorage.setItem(TODAY_KEY, JSON.stringify({
        date: new Date().toDateString(),
        sections: [...existing, type],
      }));
    }
  } catch {}
}

export interface MindfulnessExtras {
  duration_seconds?: number;
  mood_before?: number;
  mood_after?: number;
}

export async function trackMindfulnessCompletion(type: string, extras?: MindfulnessExtras): Promise<void> {
  const total = await recordCompletion(type);
  const msg = MILESTONE_MESSAGES[total];
  if (msg) toast(msg, "success", 4500);

  await recordTodaySection(type);

  // Sync to backend (best-effort — SecureStore already written above)
  try {
    await api.logMindfulness({ type, ...extras });
  } catch { /* offline or error — local SecureStore is source of truth */ }
}
