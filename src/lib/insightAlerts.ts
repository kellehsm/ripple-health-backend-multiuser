import notifee, { AndroidImportance } from "@notifee/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "../api/client";

/**
 * Local-notification alerting for new insights.
 *
 * Why local (notifee) and not remote push: the backend has no expo-server-sdk
 * / FCM setup yet, and setting that up requires a fresh native APK build with
 * push-token registration. This client-side path works today with zero extra
 * infra — every time the user launches the app (or a foreground service tick
 * fires), we check for insights first_detected since we last checked, and if
 * any have confidence ≥ moderate, we display a single grouped notification.
 *
 * Rate-limited to one notification per calendar day so the user never gets
 * spammed even if the engine fires 6 new insights at 3am.
 */

const CHANNEL_ID = "insights";
const KEY_LAST_ALERT_DATE  = "ripple_insight_last_alert_date";      // YYYY-MM-DD
const KEY_LAST_CHECKED_AT  = "ripple_insight_last_checked_at";      // ISO timestamp

async function ensureChannel(): Promise<void> {
  try {
    await notifee.createChannel({
      id: CHANNEL_ID,
      name: "Insights",
      importance: AndroidImportance.DEFAULT,
      description: "New patterns Ripple has surfaced from your data.",
    });
  } catch {
    // channel may already exist — harmless
  }
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Fetch active insights, pick the ones that are new since last check AND
 * confidence ≥ moderate. If any exist AND we haven't alerted yet today,
 * display a grouped notification.
 *
 * Safe to call on every app open / focus — cheap check, no-op on repeat.
 */
export async function checkForNewInsightAlerts(): Promise<void> {
  try {
    const insights = await api.getInsights();
    if (!Array.isArray(insights) || insights.length === 0) return;

    const [lastAlertDate, lastCheckedRaw] = await Promise.all([
      AsyncStorage.getItem(KEY_LAST_ALERT_DATE),
      AsyncStorage.getItem(KEY_LAST_CHECKED_AT),
    ]);
    // Bump the checked timestamp regardless of whether we alert — this
    // effectively becomes the "already seen" mark next time.
    const nowIso = new Date().toISOString();
    await AsyncStorage.setItem(KEY_LAST_CHECKED_AT, nowIso);

    // Only fresh AND meaningful insights qualify.
    const cutoff = lastCheckedRaw ? new Date(lastCheckedRaw).getTime() : 0;
    const fresh = insights.filter((i: any) => {
      const detected = new Date(i.first_detected).getTime();
      const strong = i.confidence === "moderate" || i.confidence === "high" || i.confidence === "very_high";
      return detected > cutoff && strong;
    });
    if (fresh.length === 0) return;

    // One-per-day rate limit.
    if (lastAlertDate === todayKey()) return;

    await ensureChannel();
    const title = fresh.length === 1
      ? "New insight: " + fresh[0].title
      : `${fresh.length} new insights ready`;
    const body = fresh.length === 1
      ? fresh[0].description.slice(0, 140)
      : fresh.slice(0, 3).map((i: any) => "• " + i.title).join("\n");

    await notifee.displayNotification({
      title,
      body,
      android: {
        channelId: CHANNEL_ID,
        smallIcon: "ic_launcher",
        pressAction: { id: "open_insights", launchActivity: "default" },
      },
      data: { deeplink: "ripple://insights" },
    });

    await AsyncStorage.setItem(KEY_LAST_ALERT_DATE, todayKey());
  } catch {
    // Silent — alerting is nice-to-have; never break the caller.
  }
}
