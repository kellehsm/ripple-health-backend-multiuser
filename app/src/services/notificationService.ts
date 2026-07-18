import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import {
  NotificationWindows,
  FIXED_WINDOWS,
  TimeWindow,
  formatTime,
} from "./adaptiveTimingService";

const IDS_KEY = "ripple:notification_ids";

export { NotificationWindows, FIXED_WINDOWS, TimeWindow, formatTime };

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("checkins", {
      name: "Check-in reminders",
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250],
    });
  }
  const { status } = await Notifications.getPermissionsAsync();
  if (status === "granted") return true;
  const { status: requested } = await Notifications.requestPermissionsAsync();
  return requested === "granted";
}

export async function getNotificationPermissionStatus(): Promise<string> {
  const { status } = await Notifications.getPermissionsAsync();
  return status;
}

export async function scheduleCheckInNotifications(
  windows: NotificationWindows
): Promise<void> {
  await cancelCheckInNotifications();

  const labels: Record<keyof NotificationWindows, string> = {
    morning:   "Morning",
    afternoon: "Afternoon",
    evening:   "Evening",
    night:     "Night",
  };

  const ids: string[] = [];
  for (const [key, w] of Object.entries(windows) as [
    keyof NotificationWindows,
    TimeWindow,
  ][]) {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: `${labels[key]} check-in`,
        body: "How are you feeling right now?",
      },
      trigger: {
        hour: w.hour,
        minute: w.minute,
        repeats: true,
      } as any,
    });
    ids.push(id);
  }

  await AsyncStorage.setItem(IDS_KEY, JSON.stringify(ids));
}

export async function cancelCheckInNotifications(): Promise<void> {
  const raw = await AsyncStorage.getItem(IDS_KEY);
  if (!raw) return;
  const ids: string[] = JSON.parse(raw);
  await Promise.all(
    ids.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => {}))
  );
  await AsyncStorage.removeItem(IDS_KEY);
}
