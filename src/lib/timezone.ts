import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "../api/client";

/**
 * Detects the device's IANA timezone (e.g. "America/New_York") and syncs it
 * to the backend so server-side date-boundary computations use the user's
 * local day rather than the server's.
 *
 * Called on app boot. Fire-and-forget; if the sync fails the app still works
 * — the backend just falls back to its historical EST default.
 */
const KEY = "ripple.savedTimezone";

export function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
  } catch {
    return "America/New_York";
  }
}

export async function syncTimezoneIfChanged(): Promise<void> {
  const tz = deviceTimezone();
  try {
    const last = await AsyncStorage.getItem(KEY);
    if (last === tz) return;
    await api.patchSettings({ timezone: tz });
    await AsyncStorage.setItem(KEY, tz);
  } catch {
    // Best effort — the server default (EST) still works.
  }
}
