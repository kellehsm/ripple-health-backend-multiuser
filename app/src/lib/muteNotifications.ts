import * as SecureStore from "expo-secure-store";

const KEY = "ripple_mute_until";
const MODE_KEY = "ripple_mute_mode";

export type MuteMode = 'silent' | 'vibrate';

// Returns the mute-until epoch ms, or null if not muted.
export async function getMuteUntil(): Promise<number | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    if (!raw) return null;
    const ts = parseInt(raw, 10);
    if (isNaN(ts) || ts <= Date.now()) {
      await SecureStore.deleteItemAsync(KEY);
      return null;
    }
    return ts;
  } catch {
    return null;
  }
}

export async function isMuted(): Promise<boolean> {
  return (await getMuteUntil()) !== null;
}

export async function setMuteUntil(untilMs: number): Promise<void> {
  await SecureStore.setItemAsync(KEY, String(untilMs));
}

export async function clearMute(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY);
  await SecureStore.deleteItemAsync(MODE_KEY);
}

export async function getMuteMode(): Promise<MuteMode> {
  try {
    const raw = await SecureStore.getItemAsync(MODE_KEY);
    if (raw === 'vibrate') return 'vibrate';
    return 'silent';
  } catch {
    return 'silent';
  }
}

export async function setMuteMode(mode: MuteMode): Promise<void> {
  await SecureStore.setItemAsync(MODE_KEY, mode);
}

// Convenience: mute for N milliseconds from now.
export async function muteFor(ms: number, mode?: MuteMode): Promise<void> {
  await setMuteUntil(Date.now() + ms);
  await setMuteMode(mode ?? 'silent');
}

export const MUTE_PRESETS = [
  { label: "1 hour",              ms: 60 * 60 * 1000 },
  { label: "Until tomorrow",      ms: -1 },   // special: until 7am next day
  { label: "4 hours",             ms: 4 * 60 * 60 * 1000 },
] as const;

export const QUIET_PRESETS = [
  { id: 'meeting',  label: 'Meeting',  emoji: '📋', durationMs: 60 * 60 * 1000,       mode: 'silent'  as MuteMode },
  { id: 'cinema',   label: 'Cinema',   emoji: '🎬', durationMs: 2.5 * 60 * 60 * 1000, mode: 'silent'  as MuteMode },
  { id: 'focus',    label: 'Focus',    emoji: '🎯', durationMs: null,                  mode: 'vibrate' as MuteMode },
] as const;

export function untilTomorrow7am(): number {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(7, 0, 0, 0);
  return d.getTime();
}
