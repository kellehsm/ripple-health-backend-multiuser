import notifee, { AndroidImportance } from "./notifeeSafe";
import { initialize, aggregateRecord, readRecords } from "react-native-health-connect";
import { api } from "../api/client";
import {
  initSmartChannels,
  checkMealReminders,
  checkGlucoseSpike,
  checkGlucoseThreshold,
  checkGlucoseTrendAlert,
  checkEveningCheckin,
  checkWaterReminder,
  checkStreakProtection,
  checkMoodReminder,
  checkBookReminder,
  checkHobbyReminder,
  checkMedicationReminders,
  checkCycleReminders,
  checkSpendingAlerts,
  checkMindfulnessReminder,
  checkSleepReminder,
  checkWorkoutReminder,
  maybeFireSundayWeekAheadPrompt,
  checkStepGoal,
  checkLowStreakDanger,
} from "./smartNotifications";

const CHANNEL_ID = "ripple-wellness-live";

// Throttle sleep+HR background sync to at most once per hour
let lastSleepHrSyncAt = 0;
const SLEEP_HR_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const NOTIF_ID = "ripple-wellness-live";

// Settings cache — re-fetch every 10 minutes to pick up changes without hammering the API
let cachedSettings: any = null;
let settingsFetchedAt = 0;
async function getSettings(): Promise<any> {
  if (cachedSettings && Date.now() - settingsFetchedAt < 10 * 60 * 1000) return cachedSettings;
  try {
    cachedSettings = await api.getSettings();
    settingsFetchedAt = Date.now();
  } catch (_) {}
  return cachedSettings;
}

async function ensureChannel() {
  await notifee.createChannel({
    id: CHANNEL_ID,
    name: "Live Health Tracking",
    importance: AndroidImportance.LOW,
  });
  await initSmartChannels();
}

// Returns hex color for the notification accent based on glucose trend arrow.
// Rising arrows → red (↑ ↑↑), falling → blue (↓ ↓↓), steady/unknown → green.
function trendColor(arrow: string | null): string {
  if (!arrow) return "#1D9E75";
  if (arrow.includes("↑")) return "#D85A30";
  if (arrow.includes("↓")) return "#378ADD";
  return "#1D9E75";
}

async function syncAndUpdateNotification(notificationId: string) {
  let stepsText = "-- steps";
  let glucoseText = "--";
  let arrow: string | null = null;

  try {
    await initialize();
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    // Use aggregateRecord so HC deduplicates overlapping records from all sources
    const agg = await aggregateRecord({
      recordType: "Steps",
      timeRangeFilter: {
        operator: "between",
        startTime: startOfDay.toISOString(),
        endTime: now.toISOString(),
      },
    });
    const total = (agg as any).COUNT_TOTAL ?? 0;
    if (total > 0) {
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      await api.syncSteps(today, total);
      stepsText = total.toLocaleString() + " steps today";
    }
  } catch (e) {
    console.error("FG service steps error", e);
  }

  // Sleep + heart rate: throttled to once per hour so the 5-min loop stays cheap
  if (Date.now() - lastSleepHrSyncAt >= SLEEP_HR_INTERVAL_MS) {
    try {
      const now2 = new Date();
      const sleepStart = new Date(now2.getTime() - 72 * 60 * 60 * 1000);
      const sleepResult: any = await readRecords("SleepSession", {
        timeRangeFilter: { operator: "between", startTime: sleepStart.toISOString(), endTime: now2.toISOString() },
      });
      if ((sleepResult.records as any[]).length > 0) {
        const sessions = (sleepResult.records as any[]).map((s: any) => {
          let deep_ms = 0, rem_ms = 0, light_ms = 0, awake_ms = 0;
          for (const stg of (s.stages ?? [])) {
            const dur = new Date(stg.endTime).getTime() - new Date(stg.startTime).getTime();
            switch (stg.stage) {
              case 5: deep_ms  += dur; break;
              case 6: rem_ms   += dur; break;
              case 4: light_ms += dur; break;
              case 1: awake_ms += dur; break;
            }
          }
          return {
            start_time: s.startTime,
            end_time: s.endTime,
            quality_score: null,
            deep_ms:  deep_ms  > 0 ? deep_ms  : null,
            rem_ms:   rem_ms   > 0 ? rem_ms   : null,
            light_ms: light_ms > 0 ? light_ms : null,
            awake_ms: awake_ms > 0 ? awake_ms : null,
          };
        });
        await api.syncSleep(sessions);
      }
    } catch (e) {
      console.error("FG service sleep error", e);
    }

    try {
      const now2 = new Date();
      const hrStart = new Date(now2.getTime() - 7 * 24 * 60 * 60 * 1000);
      const readings: Array<{ recorded_at: string; bpm: number }> = [];
      let pageToken: string | undefined;
      do {
        const hrResult: any = await readRecords("HeartRate", {
          timeRangeFilter: { operator: "between", startTime: hrStart.toISOString(), endTime: now2.toISOString() },
          pageToken,
        } as any);
        for (const r of hrResult.records as any[]) {
          for (const s of r.samples ?? []) {
            readings.push({ recorded_at: s.time, bpm: s.beatsPerMinute });
          }
        }
        pageToken = hrResult.pageToken;
      } while (pageToken);
      if (readings.length > 0) await api.syncHeartRate(readings);
    } catch (e) {
      console.error("FG service heart rate error", e);
    }

    lastSleepHrSyncAt = Date.now();
  }

  try {
    const status = await api.glucoseStatus();
    if (status?.hasData && status?.mg_dl != null) {
      arrow = status.arrow ?? null;
      glucoseText =
        status.mg_dl + " mg/dL" + (arrow ? " " + arrow : "");
    }
  } catch (e) {
    console.error("FG service glucose error", e);
  }

  await notifee.displayNotification({
    id: notificationId,
    title: "Ripple Wellness",
    body: glucoseText + " · " + stepsText,
    android: {
      channelId: CHANNEL_ID,
      asForegroundService: true,
      ongoing: true,
      importance: AndroidImportance.LOW,
      pressAction: { id: "default" },
      color: trendColor(arrow),
    },
  });

  // Smart notifications — run after the main notification update
  try {
    const settings = await getSettings();
    const now = new Date();
    await checkMealReminders(settings, now);
    await checkGlucoseSpike(settings, now);
    await checkGlucoseThreshold(settings, now);
    await checkGlucoseTrendAlert(settings, now);
    await checkEveningCheckin(settings, now);
    await checkWaterReminder(settings, now);
    await checkStreakProtection(settings, now);
    await checkMoodReminder(settings, now);
    await checkBookReminder(settings, now);
    await checkHobbyReminder(settings, now);
    await checkMedicationReminders(settings, now);
    await checkCycleReminders(settings, now);
    await checkSpendingAlerts(settings, now);
    await checkMindfulnessReminder(settings, now);
    await checkSleepReminder(settings, now);
    await checkWorkoutReminder(settings, now);
    await maybeFireSundayWeekAheadPrompt();
    await checkStepGoal(settings, now);
    await checkLowStreakDanger(now);
  } catch (err) {
    // Smart-notification failures should not kill the foreground sync loop,
    // but we still want to see them in dev — a fully silent catch hid a token
    // expiry that stopped smart reminders for days without any signal.
    if (__DEV__) console.warn("[foregroundService] smart notifications failed", err);
  }
}

// Called from index.js — registers the headless handler before the React tree mounts.
export function registerForegroundServiceHandler() {
  notifee.registerForegroundService((notification: any) => {
    const sleep = (ms: number) =>
      new Promise<void>((r) => setTimeout(r, ms));
    const INTERVAL = 5 * 60 * 1000;
    const MAX_RUNTIME_MS = 5.5 * 60 * 60 * 1000; // stop before Android's 6-hour kill
    const serviceStartTime = Date.now();

    return new Promise(async () => {
      await syncAndUpdateNotification(notification.id!);
      while (true) {
        await sleep(INTERVAL);
        if (Date.now() - serviceStartTime >= MAX_RUNTIME_MS) {
          // Gracefully restart before Android 15 force-kills it
          await notifee.stopForegroundService();
          await startForegroundService(); // triggers a fresh handler call
          break;
        }
        await syncAndUpdateNotification(notification.id!);
      }
    });
  });
}

export async function startForegroundService() {
  await ensureChannel();
  await notifee.displayNotification({
    id: NOTIF_ID,
    title: "Ripple Wellness",
    body: "Starting live tracking…",
    android: {
      channelId: CHANNEL_ID,
      asForegroundService: true,
      ongoing: true,
      importance: AndroidImportance.LOW,
      pressAction: { id: "default" },
    },
  });
}

export async function stopForegroundService() {
  await notifee.stopForegroundService();
}

export async function isForegroundServiceRunning(): Promise<boolean> {
  const displayed = await notifee.getDisplayedNotifications();
  return displayed.some((n: any) => n.id === NOTIF_ID);
}
