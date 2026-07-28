import * as SecureStore from "expo-secure-store";

const PREFIX = "stale_sync_notified_";

export async function shouldNotifyStale(key: string): Promise<boolean> {
  try {
    const raw = await SecureStore.getItemAsync(PREFIX + key);
    if (!raw) return true;
    const last = parseInt(raw, 10);
    return Date.now() - last > 24 * 60 * 60 * 1000;
  } catch {
    return true;
  }
}

export async function markStaleNotified(key: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(PREFIX + key, String(Date.now()));
  } catch {}
}
