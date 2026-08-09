/**
 * Progressive tips scheduler.
 *
 * Registers a "session count" per user, and lets each screen ask
 * "should I show tip X on this session?" Tips fire on the session where
 * their `showOnSession` matches, exactly once ever.
 *
 * Pairs with the existing tooltipSeen utility for one-shot state; adds a
 * session counter so tips can be paced across multiple app opens.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { hasSeenTooltip, markTooltipSeen } from "../utils/tooltipSeen";

const SESSION_KEY = "ripple_session_count";

let cachedSessions: number | null = null;

export async function bumpSessionCount(): Promise<number> {
  const raw = await AsyncStorage.getItem(SESSION_KEY).catch(() => null);
  const n = (parseInt(raw ?? "0", 10) || 0) + 1;
  cachedSessions = n;
  await AsyncStorage.setItem(SESSION_KEY, String(n)).catch(() => {});
  return n;
}

export async function currentSessionCount(): Promise<number> {
  if (cachedSessions != null) return cachedSessions;
  const raw = await AsyncStorage.getItem(SESSION_KEY).catch(() => null);
  cachedSessions = parseInt(raw ?? "0", 10) || 0;
  return cachedSessions;
}

export interface TipSchedule {
  key: string;                 // stable id for tooltipSeen
  showOnSession?: number;      // first session to show on
  showAfterSession?: number;   // first session where it MAY show
}

export async function shouldShowTip(schedule: TipSchedule): Promise<boolean> {
  const seen = await hasSeenTooltip(schedule.key as any);
  if (seen) return false;
  const n = await currentSessionCount();
  if (schedule.showOnSession != null) return n === schedule.showOnSession;
  if (schedule.showAfterSession != null) return n >= schedule.showAfterSession;
  return true;
}

export async function markTipSeen(key: string): Promise<void> {
  await markTooltipSeen(key as any);
}

/** Well-known tips — add here so the schedule is centralized. */
export const TIPS = {
  insightsIntro:       { key: "tip_insights_intro",   showOnSession: 1 },
  swipeToDismiss:      { key: "tip_swipe_dismiss",    showOnSession: 3 },
  pinAnInsight:        { key: "tip_pin",              showOnSession: 5 },
  customizeDashboard:  { key: "tip_customize",        showAfterSession: 4 },
  runAnExperiment:     { key: "tip_experiment",       showAfterSession: 7 },
  weeklyDigest:        { key: "tip_weekly_digest",    showAfterSession: 10 },
} as const;
