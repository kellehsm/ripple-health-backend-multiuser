import { initialize, requestPermission, readRecords, aggregateGroupByPeriod } from "react-native-health-connect";
import { api } from "../api/client";

export async function requestHealthPermissions(): Promise<boolean> {
  try {
    const ready = await initialize();
    if (!ready) return false;
    const granted = await requestPermission([
      { accessType: "read", recordType: "Steps" },
      { accessType: "read", recordType: "SleepSession" },
      { accessType: "read", recordType: "HeartRate" },
    ]);
    return granted.length > 0;
  } catch (e) {
    console.error("Health Connect permission request failed", e);
    return false;
  }
}

export type SleepStages = {
  deepMs: number;
  remMs: number;
  lightMs: number;
  awakeMs: number;
};

export type SyncResult = {
  steps: number | null;
  sleepHours: number | null;
  sleepStages: SleepStages | null;
  heartRate: number | null;
  errors: string[];
};

export async function syncHealthData(): Promise<SyncResult> {
  await initialize();

  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);

  // Sleep window: 8pm yesterday → now
  const sleepWindowStart = new Date(now);
  sleepWindowStart.setDate(sleepWindowStart.getDate() - 1);
  sleepWindowStart.setHours(20, 0, 0, 0);

  const errors: string[] = [];
  let steps: number | null = null;
  let sleepHours: number | null = null;
  let sleepStages: SleepStages | null = null;
  let heartRate: number | null = null;

  // Steps — use HC aggregation (deduplicates overlapping records across sources)
  try {
    const historyStart = new Date(now);
    historyStart.setDate(historyStart.getDate() - 30);
    historyStart.setHours(0, 0, 0, 0);

    const buckets = await aggregateGroupByPeriod({
      recordType: "Steps",
      timeRangeFilter: {
        operator: "between",
        startTime: historyStart.toISOString(),
        endTime: now.toISOString(),
      },
      timeRangeSlicer: { period: "DAYS", length: 1 },
    });

    const todayLocal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    for (const bucket of buckets) {
      const count = (bucket.result as any).COUNT_TOTAL ?? 0;
      if (count <= 0) continue;
      const d = new Date(bucket.startTime);
      const localDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      await api.syncSteps(localDate, count);
      if (localDate === todayLocal) steps = count;
    }
  } catch (e: any) {
    errors.push("Steps: " + (e?.message ?? "unknown error"));
  }

  // Sleep
  try {
    const result = await readRecords("SleepSession", {
      timeRangeFilter: {
        operator: "between",
        startTime: sleepWindowStart.toISOString(),
        endTime: now.toISOString(),
      },
    });
    if ((result.records as any[]).length > 0) {
      // Compute per-session stage sums so we can persist them on the row itself
      // (previously stages were aggregated across all sessions in the window and
      // cached to AsyncStorage — losing data on reinstall and preventing
      // historical trend charts).
      let totalDeepMs = 0, totalRemMs = 0, totalLightMs = 0, totalAwakeMs = 0;
      const sessions = (result.records as any[]).map((s: any) => {
        let deep_ms = 0, rem_ms = 0, light_ms = 0, awake_ms = 0;
        for (const stg of (s.stages ?? [])) {
          const dur = new Date(stg.endTime).getTime() - new Date(stg.startTime).getTime();
          switch (stg.stage) {
            case 5: deep_ms  += dur; break; // DEEP
            case 6: rem_ms   += dur; break; // REM
            case 4: light_ms += dur; break; // LIGHT
            case 1: awake_ms += dur; break; // AWAKE
          }
        }
        totalDeepMs  += deep_ms;
        totalRemMs   += rem_ms;
        totalLightMs += light_ms;
        totalAwakeMs += awake_ms;
        return {
          start_time: s.startTime,
          end_time: s.endTime,
          quality_score: null,
          // Send null (not 0) when this session has no stage data so backend
          // COALESCE doesn't wipe good existing data on a re-sync.
          deep_ms:  deep_ms  > 0 ? deep_ms  : null,
          rem_ms:   rem_ms   > 0 ? rem_ms   : null,
          light_ms: light_ms > 0 ? light_ms : null,
          awake_ms: awake_ms > 0 ? awake_ms : null,
        };
      });
      await api.syncSleep(sessions);
      const totalMs = (result.records as any[]).reduce(
        (sum, s) => sum + (new Date(s.endTime).getTime() - new Date(s.startTime).getTime()),
        0
      );
      sleepHours = Math.round((totalMs / 3600000) * 10) / 10;
      if (totalDeepMs + totalRemMs + totalLightMs + totalAwakeMs > 0) {
        sleepStages = { deepMs: totalDeepMs, remMs: totalRemMs, lightMs: totalLightMs, awakeMs: totalAwakeMs };
      }
    }
  } catch (e: any) {
    errors.push("Sleep: " + (e?.message ?? "unknown error"));
  }

  // Heart rate — read a rolling 7-day window so Samsung Health's delayed
  // backfill (records tagged with older timestamps) still gets picked up.
  // Backend dedupes via ON CONFLICT (user_id, recorded_at).
  try {
    const hrWindowStart = new Date(now);
    hrWindowStart.setDate(hrWindowStart.getDate() - 7);
    const readings: Array<{ recorded_at: string; bpm: number }> = [];
    let recordCount = 0;
    let pageToken: string | undefined;
    do {
      const result: any = await readRecords("HeartRate", {
        timeRangeFilter: {
          operator: "between",
          startTime: hrWindowStart.toISOString(),
          endTime: now.toISOString(),
        },
        pageToken,
      } as any);
      recordCount += (result.records as any[]).length;
      for (const r of result.records as any[]) {
        for (const s of r.samples ?? []) {
          readings.push({ recorded_at: s.time, bpm: s.beatsPerMinute });
        }
      }
      pageToken = result.pageToken;
    } while (pageToken);

    if (readings.length > 0) {
      await api.syncHeartRate(readings);
      heartRate = readings[readings.length - 1].bpm;
    } else {
      errors.push(`Heart rate: 0 samples in last 7d (${recordCount} records)`);
    }
  } catch (e: any) {
    errors.push("Heart rate: " + (e?.message ?? "unknown error"));
  }

  return { steps, sleepHours, sleepStages, heartRate, errors };
}
