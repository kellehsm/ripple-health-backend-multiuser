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
      { accessType: "read", recordType: "ExerciseSession" },
      { accessType: "read", recordType: "Weight" },
      { accessType: "read", recordType: "OxygenSaturation" },
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
  activeMinutes: number | null;
  weightKg: number | null;
  spo2Pct: number | null;
  errors: string[];
};

export async function syncHealthData(opts?: {
  syncExercise?: boolean;
  syncWeight?: boolean;
  syncSpo2?: boolean;
}): Promise<SyncResult> {
  await initialize();

  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);

  // Sleep window: rolling 72h → now (catches sessions outside the old 8 PM cutoff)
  const sleepWindowStart = new Date(now.getTime() - 72 * 60 * 60 * 1000);

  const errors: string[] = [];
  let steps: number | null = null;
  let sleepHours: number | null = null;
  let sleepStages: SleepStages | null = null;
  let heartRate: number | null = null;
  let activeMinutes: number | null = null;
  let weightKg: number | null = null;
  let spo2Pct: number | null = null;

  const syncExercise = opts?.syncExercise !== false;
  const syncWeight = opts?.syncWeight !== false;
  const syncSpo2 = opts?.syncSpo2 !== false;

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
    hrWindowStart.setDate(hrWindowStart.getDate() - 30);
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

  // ExerciseSession → active_minutes generic metric
  // The backend exercise system is manual sets/reps only (no cardio session table),
  // so we store total daily active minutes in the generic metrics engine.
  if (syncExercise) {
    try {
      const exWindowStart = new Date(now);
      exWindowStart.setDate(exWindowStart.getDate() - 30);
      exWindowStart.setHours(0, 0, 0, 0);
      const exResult = await readRecords("ExerciseSession", {
        timeRangeFilter: {
          operator: "between",
          startTime: exWindowStart.toISOString(),
          endTime: now.toISOString(),
        },
      });
      if ((exResult.records as any[]).length > 0) {
        const metric = await api.getOrCreateActiveMinutesMetric();
        // Bucket by local date, sum duration per day
        const byDate: Record<string, number> = {};
        for (const r of exResult.records as any[]) {
          const d = new Date(r.startTime);
          const localDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          const durMin = Math.round((new Date(r.endTime).getTime() - new Date(r.startTime).getTime()) / 60000);
          byDate[localDate] = (byDate[localDate] ?? 0) + durMin;
        }
        for (const [date, minutes] of Object.entries(byDate)) {
          if (minutes <= 0) continue;
          await api.logMetricValue(metric.id, minutes, date + "T23:59:00.000Z");
        }
        const todayLocal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
        activeMinutes = byDate[todayLocal] ?? null;
      }
    } catch (e: any) {
      errors.push("Exercise: " + (e?.message ?? "unknown error"));
    }
  }

  // Weight → weight_kg generic metric (latest reading per day over 30d)
  if (syncWeight) {
    try {
      const wWindowStart = new Date(now);
      wWindowStart.setDate(wWindowStart.getDate() - 30);
      wWindowStart.setHours(0, 0, 0, 0);
      const wResult = await readRecords("Weight", {
        timeRangeFilter: {
          operator: "between",
          startTime: wWindowStart.toISOString(),
          endTime: now.toISOString(),
        },
      });
      if ((wResult.records as any[]).length > 0) {
        const metric = await api.getOrCreateWeightMetric();
        for (const r of wResult.records as any[]) {
          const kg = (r as any).weight?.inKilograms ?? null;
          if (kg == null) continue;
          await api.logMetricValue(metric.id, Math.round(kg * 10) / 10, (r as any).time ?? new Date().toISOString());
        }
        const last = wResult.records[wResult.records.length - 1] as any;
        weightKg = last?.weight?.inKilograms ?? null;
      }
    } catch (e: any) {
      errors.push("Weight: " + (e?.message ?? "unknown error"));
    }
  }

  // OxygenSaturation → spo2_pct generic metric
  if (syncSpo2) {
    try {
      const spo2WindowStart = new Date(now);
      spo2WindowStart.setDate(spo2WindowStart.getDate() - 7);
      const spo2Result = await readRecords("OxygenSaturation", {
        timeRangeFilter: {
          operator: "between",
          startTime: spo2WindowStart.toISOString(),
          endTime: now.toISOString(),
        },
      });
      if ((spo2Result.records as any[]).length > 0) {
        const metric = await api.getOrCreateSpo2Metric();
        for (const r of spo2Result.records as any[]) {
          const pct = (r as any).percentage?.value ?? null;
          if (pct == null) continue;
          await api.logMetricValue(metric.id, Math.round(pct * 10) / 10, (r as any).time ?? new Date().toISOString());
        }
        const last = spo2Result.records[spo2Result.records.length - 1] as any;
        spo2Pct = last?.percentage?.value ?? null;
      }
    } catch (e: any) {
      errors.push("SpO2: " + (e?.message ?? "unknown error"));
    }
  }

  return { steps, sleepHours, sleepStages, heartRate, activeMinutes, weightKg, spo2Pct, errors };
}
