/**
 * Haptic vocabulary — all haptic calls in the app should go through here.
 *
 * WHY: `Haptics.selectionAsync/impactAsync/notificationAsync` was called
 * ad-hoc across 42+ files with inconsistent intensity. This wrapper makes
 * the intent explicit ("this is a tap", "this is a success") and lets us
 * globally tune or A/B test intensity without touching every call site.
 *
 * All functions are fire-and-forget — swallow errors from the native side.
 */

import * as Haptics from "expo-haptics";
import { AccessibilityInfo } from "react-native";

let _enabled = true;
// Read once at startup; user may toggle later via toggle().
AccessibilityInfo.isReduceMotionEnabled?.().then((rm) => {
  // Reduce Motion isn't strictly Reduce Haptics, but on iOS the two often
  // travel together. Keep haptics enabled — respect the OS system-level
  // haptic toggle instead of muting ourselves.
  void rm;
});

export function setHapticsEnabled(on: boolean): void {
  _enabled = on;
}

async function safe(fn: () => Promise<unknown>): Promise<void> {
  if (!_enabled) return;
  try { await fn(); } catch { /* swallow */ }
}

/** Light selection tick — chip tap, tab select, small toggle. */
export const tap = () => safe(() => Haptics.selectionAsync());

/** Medium pop — button press, card expand. */
export const pop = () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));

/** Firm press — long-press start, sheet snap. */
export const press = () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));

/** Successful action — log saved, streak extended, experiment started. */
export const success = () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));

/** Warning — value out of range, permission denied. */
export const warning = () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));

/** Error — failed action, invalid input. */
export const error = () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));

/** Streak broken — softer than error, still felt. */
export const streakBroken = () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));

/** Celebration — for milestones. Double-pop pattern. */
export const celebrate = async () => {
  if (!_enabled) return;
  await safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
  await new Promise((r) => setTimeout(r, 90));
  await safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));
};

export const haptics = {
  tap, pop, press, success, warning, error, streakBroken, celebrate,
  setEnabled: setHapticsEnabled,
};

export default haptics;
