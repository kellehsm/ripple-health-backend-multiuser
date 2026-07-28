import AsyncStorage from "@react-native-async-storage/async-storage";
import notifee, { TriggerType, RepeatFrequency } from "@notifee/react-native";
import { CH_STREAK } from "./smartNotifications";

const KEY = "fasting_start_ms";
const MILESTONE_IDS = ["fast-12h", "fast-16h", "fast-24h"];
const MILESTONES_MS = [12 * 3600000, 16 * 3600000, 24 * 3600000];
const MILESTONE_LABELS = ["12-hour fast", "16-hour fast", "24-hour fast"];
const MILESTONE_BODIES = [
  "You've hit 12 hours — great start!",
  "16 hours in — you're in fat-burning territory.",
  "24 hours — an incredible achievement. Listen to your body.",
];

export interface FastStatus {
  active: boolean;
  startMs: number | null;
  elapsedMs: number;
}

export async function getFastStatus(): Promise<FastStatus> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return { active: false, startMs: null, elapsedMs: 0 };
  const startMs = Number(raw);
  return { active: true, startMs, elapsedMs: Date.now() - startMs };
}

export async function startFast(): Promise<void> {
  const now = Date.now();
  await AsyncStorage.setItem(KEY, String(now));
  for (let i = 0; i < MILESTONES_MS.length; i++) {
    await notifee.createTriggerNotification(
      {
        id: MILESTONE_IDS[i],
        title: MILESTONE_LABELS[i],
        body: MILESTONE_BODIES[i],
        android: { channelId: CH_STREAK, smallIcon: "ic_launcher", pressAction: { id: "default" } },
        data: { type: "fasting_milestone" },
      },
      { type: TriggerType.TIMESTAMP, timestamp: now + MILESTONES_MS[i] }
    );
  }
}

export async function stopFast(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
  for (const id of MILESTONE_IDS) {
    await notifee.cancelTriggerNotification(id).catch(() => {});
  }
}

export function formatElapsed(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return m + "m";
  return h + "h " + m + "m";
}
