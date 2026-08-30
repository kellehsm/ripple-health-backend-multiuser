import AsyncStorage from "@react-native-async-storage/async-storage";
import notifee, { TriggerType, RepeatFrequency, AuthorizationStatus } from "./notifeeSafe";
import { CH_STREAK } from "./smartNotifications";

const KEY = "fasting_start_ms";
const MILESTONE_IDS = ["fast-12h", "fast-16h", "fast-24h"];
const MILESTONES_MS = [12 * 3600000, 16 * 3600000, 24 * 3600000];
const MILESTONE_LABELS = ["12-hour milestone reached!", "16-hour milestone!", "24-hour fast complete!"];
const MILESTONE_BODIES = [
  "12-hour milestone reached! You're halfway to your 24-hour goal.",
  "16-hour milestone! Your body is in full ketosis mode.",
  "24-hour fast complete! Amazing dedication.",
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

/** Request notification permission if not already granted. Returns true if granted. */
async function ensureNotificationPermission(): Promise<boolean> {
  try {
    const settings = await notifee.requestPermission();
    const status = settings?.authorizationStatus ?? -1;
    return status === AuthorizationStatus.AUTHORIZED || status === 1;
  } catch {
    return false;
  }
}

/** Schedule future milestone notifications from the given start time, skipping any already past. */
async function scheduleMilestones(startMs: number): Promise<void> {
  const now = Date.now();
  for (let i = 0; i < MILESTONES_MS.length; i++) {
    const fireAt = startMs + MILESTONES_MS[i];
    if (fireAt <= now) continue; // milestone already passed — don't schedule in the past
    await notifee.createTriggerNotification(
      {
        id: MILESTONE_IDS[i],
        title: MILESTONE_LABELS[i],
        body: MILESTONE_BODIES[i],
        android: { channelId: CH_STREAK, smallIcon: "ic_launcher", pressAction: { id: "default" } },
        data: { type: "fasting_milestone" },
      },
      { type: TriggerType.TIMESTAMP, timestamp: fireAt }
    );
  }
}

export async function startFast(): Promise<void> {
  await ensureNotificationPermission();
  const now = Date.now();
  await AsyncStorage.setItem(KEY, String(now));
  await scheduleMilestones(now);
}

/**
 * Called on app launch. If a fast is already in progress, re-schedules any
 * milestones that are still in the future (e.g. after a device reboot that
 * cleared pending notifications).
 */
export async function ensureFastingNotifications(): Promise<void> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return; // no active fast
  const startMs = Number(raw);
  if (!startMs || isNaN(startMs)) return;

  // Check which milestone IDs are already pending so we don't duplicate them.
  let pendingIds: string[] = [];
  try {
    pendingIds = (await notifee.getTriggerNotificationIds()) ?? [];
  } catch {
    pendingIds = [];
  }

  const now = Date.now();
  for (let i = 0; i < MILESTONES_MS.length; i++) {
    const fireAt = startMs + MILESTONES_MS[i];
    if (fireAt <= now) continue; // already past
    if (pendingIds.includes(MILESTONE_IDS[i])) continue; // already scheduled
    await notifee.createTriggerNotification(
      {
        id: MILESTONE_IDS[i],
        title: MILESTONE_LABELS[i],
        body: MILESTONE_BODIES[i],
        android: { channelId: CH_STREAK, smallIcon: "ic_launcher", pressAction: { id: "default" } },
        data: { type: "fasting_milestone" },
      },
      { type: TriggerType.TIMESTAMP, timestamp: fireAt }
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
