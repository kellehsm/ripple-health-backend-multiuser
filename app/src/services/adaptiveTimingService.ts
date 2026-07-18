import AsyncStorage from "@react-native-async-storage/async-storage";

export type TimeWindow = { hour: number; minute: number };
export type NotificationWindows = {
  morning: TimeWindow;
  afternoon: TimeWindow;
  evening: TimeWindow;
  night: TimeWindow;
};

export const FIXED_WINDOWS: NotificationWindows = {
  morning:   { hour: 8,  minute: 0 },
  afternoon: { hour: 13, minute: 0 },
  evening:   { hour: 18, minute: 0 },
  night:     { hour: 22, minute: 0 },
};

const APP_OPEN_KEY = "ripple:app_open_times";
const MIN_DATA_POINTS = 14;
const MAX_STORED = 90;

export async function logAppOpen(): Promise<void> {
  const raw = await AsyncStorage.getItem(APP_OPEN_KEY);
  const times: string[] = raw ? JSON.parse(raw) : [];
  times.push(new Date().toISOString());
  await AsyncStorage.setItem(APP_OPEN_KEY, JSON.stringify(times.slice(-MAX_STORED)));
}

export async function getAppOpenCount(): Promise<number> {
  const raw = await AsyncStorage.getItem(APP_OPEN_KEY);
  if (!raw) return 0;
  return (JSON.parse(raw) as string[]).length;
}

export async function computeAdaptiveWindows(): Promise<NotificationWindows | null> {
  const raw = await AsyncStorage.getItem(APP_OPEN_KEY);
  if (!raw) return null;

  const times: string[] = JSON.parse(raw);
  if (times.length < MIN_DATA_POINTS) return null;

  const uniqueDays = new Set(times.map((t) => new Date(t).toDateString())).size;
  if (uniqueDays < 14) return null;

  // Fractional hours in local time; wrap 0-4am to 24-28 for night window clustering
  const rawHours = times.map((t) => {
    const d = new Date(t);
    return d.getHours() + d.getMinutes() / 60;
  });
  const normalised = rawHours.map((h) => (h < 5 ? h + 24 : h));

  type WindowKey = keyof NotificationWindows;
  const ranges: Record<WindowKey, [number, number]> = {
    morning:   [5,  12],
    afternoon: [12, 17],
    evening:   [17, 21],
    night:     [21, 29], // 29 = 5am next day
  };

  const result = {} as NotificationWindows;
  for (const [key, [start, end]] of Object.entries(ranges) as [WindowKey, [number, number]][]) {
    const bucket = normalised.filter((h) => h >= start && h < end);
    if (bucket.length < 2) {
      result[key] = FIXED_WINDOWS[key];
      continue;
    }
    const sorted = [...bucket].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const adjusted = median >= 24 ? median - 24 : median;
    result[key] = {
      hour: Math.floor(adjusted),
      minute: Math.round((adjusted % 1) * 60),
    };
  }
  return result;
}

export function formatTime(w: TimeWindow): string {
  const h = w.hour % 12 || 12;
  const ampm = w.hour < 12 ? "am" : "pm";
  const m = w.minute.toString().padStart(2, "0");
  return m === "00" ? `${h}${ampm}` : `${h}:${m}${ampm}`;
}
