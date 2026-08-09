/**
 * Feature flags — client-side, AsyncStorage-backed.
 *
 * Simple boolean toggle store. Read via `useFeatureFlag("newInsightCard")`,
 * toggle via the Debug Drawer or programmatically for A/B testing.
 *
 * Not a full experimentation harness (that's §15.4, needs GrowthBook/Statsig).
 * This is the minimum-viable version to gate new features safely.
 */

import { useEffect, useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const PREFIX = "ripple_ff_";

export const DEFAULT_FLAGS: Record<string, boolean> = {
  newInsightCard:        true,
  sparklineTiles:         true,
  timeOfDayThemeShift:    false,
  progressiveTips:        true,
  weeklyDigestPush:       false,
  experimentalCharts:     false,
};

const listeners = new Set<() => void>();

async function readFlag(key: string): Promise<boolean> {
  const v = await AsyncStorage.getItem(PREFIX + key).catch(() => null);
  if (v === null) return DEFAULT_FLAGS[key] ?? false;
  return v === "true";
}

export async function setFlag(key: string, value: boolean): Promise<void> {
  await AsyncStorage.setItem(PREFIX + key, String(value)).catch(() => {});
  listeners.forEach((l) => l());
}

export function useFeatureFlag(key: string): boolean {
  const [v, setV] = useState<boolean>(DEFAULT_FLAGS[key] ?? false);
  const load = useCallback(() => readFlag(key).then(setV), [key]);
  useEffect(() => {
    load();
    listeners.add(load);
    return () => { listeners.delete(load); };
  }, [load]);
  return v;
}

export async function getAllFlags(): Promise<Record<string, boolean>> {
  const out: Record<string, boolean> = {};
  for (const k of Object.keys(DEFAULT_FLAGS)) {
    out[k] = await readFlag(k);
  }
  return out;
}
