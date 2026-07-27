import * as SecureStore from "expo-secure-store";

const ENABLED_KEY = "ripple_biometric_lock_enabled";

// -- Settings persistence --

export async function isBiometricLockEnabled(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(ENABLED_KEY)) === "1";
  } catch {
    return false;
  }
}

export async function setBiometricLockEnabled(enabled: boolean): Promise<void> {
  if (enabled) {
    await SecureStore.setItemAsync(ENABLED_KEY, "1");
  } else {
    await SecureStore.deleteItemAsync(ENABLED_KEY);
  }
}

// -- Runtime lock state (in-memory only, resets on process restart) --

let _unlocked = false;
let _unlockedAt = 0;
const GRACE_MS = 5 * 60 * 1000; // 5 min background grace period

export function markUnlocked(): void {
  _unlocked = true;
  _unlockedAt = Date.now();
}

export function markLocked(): void {
  _unlocked = false;
}

export function isCurrentlyUnlocked(): boolean {
  if (!_unlocked) return false;
  // Re-lock if it's been more than grace period since unlock
  if (Date.now() - _unlockedAt > GRACE_MS) {
    _unlocked = false;
    return false;
  }
  return true;
}

// -- Biometric auth (calls expo-local-authentication dynamically) --

export async function authenticateWithBiometrics(): Promise<"success" | "failed" | "unavailable"> {
  try {
    // Dynamic import so the app doesn't crash if the native module isn't present
    const LA = await import("expo-local-authentication");
    const hardware = await LA.hasHardwareAsync();
    if (!hardware) return "unavailable";
    const enrolled = await LA.isEnrolledAsync();
    if (!enrolled) return "unavailable";

    const result = await LA.authenticateAsync({
      promptMessage: "Unlock Ripple",
      fallbackLabel: "Use PIN",
      disableDeviceFallback: false,
    });

    if (result.success) {
      markUnlocked();
      return "success";
    }
    return "failed";
  } catch {
    return "unavailable";
  }
}
