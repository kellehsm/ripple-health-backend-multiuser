import * as FileSystem from "expo-file-system/legacy";
import { api } from "../api/client";

const FLAG = FileSystem.documentDirectory + "onboarding_done";

export async function hasCompletedOnboarding(): Promise<boolean> {
  // Fast path: check local FileSystem flag first
  try {
    const info = await FileSystem.getInfoAsync(FLAG);
    if (info.exists) return true;
  } catch {}

  // Fallback: check backend settings
  try {
    const settings = await api.getSettings();
    if (settings?.onboarding_completed === true) {
      // Write local flag as cache so next check is fast
      try { await FileSystem.writeAsStringAsync(FLAG, "1"); } catch {}
      return true;
    }
  } catch {}

  return false;
}

export async function markOnboardingComplete(): Promise<void> {
  // Call backend first
  try {
    await api.markOnboardingComplete();
  } catch {
    // best-effort; continue to write local flag
  }

  // Also write local FileSystem flag as cache
  try {
    await FileSystem.writeAsStringAsync(FLAG, "1");
  } catch {
    // best-effort; if it fails the user sees onboarding once more on next launch
  }
}
