import React, { useCallback, useState } from "react";
import { ScrollView, View, Text, Switch, Pressable, StyleSheet, Alert, Platform } from "react-native";
import { LoadingIndicator } from "../../components/LoadingIndicator";
import { useFocusEffect } from "@react-navigation/core";
import * as IntentLauncher from "expo-intent-launcher";
// Lazy-load notifee: native module is absent in Expo Go and throws at import time.
let notifee: any = null;
let AuthorizationStatus: any = {};
try {
  const n = require("@notifee/react-native");
  notifee = n.default;
  AuthorizationStatus = n.AuthorizationStatus;
} catch {}
import * as Notifications from "expo-notifications";
import { getGrantedPermissions } from "react-native-health-connect";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme } from "../../theme/ThemeContext";
import { useCardBg } from "../../theme/AppSettingsContext";
import { requestHealthPermissions } from "../../lib/healthConnect";
import { startForegroundService, stopForegroundService, isForegroundServiceRunning } from "../../lib/foregroundService";

const STEP_GOAL_OPTIONS = [5000, 7500, 8000, 10000, 12000, 15000];
const STEP_GOAL_KEY = "ripple_step_goal";
const STEP_GOAL_NUDGE_KEY = "ripple_step_goal_nudge_dismissed";

function StatusRow({ label, status, theme }: { label: string; status: "granted" | "denied" | "unknown"; theme: any }) {
  const dot = status === "granted" ? "●" : status === "denied" ? "●" : "○";
  const color = status === "granted" ? theme.teal.fg : status === "denied" ? theme.coral.fg : theme.textSoft;
  const note = status === "granted" ? "Granted" : status === "denied" ? "Denied" : "Tap toggle to request";
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 3 }}>
      <Text style={{ color, fontSize: 10 }}>{dot}</Text>
      <Text style={{ color: theme.textStrong, flex: 1, fontSize: 13 }}>{label}</Text>
      <Text style={{ color, fontSize: 12 }}>{note}</Text>
    </View>
  );
}

export function TrackingSettingsScreen() {
  const { theme } = useTheme();
  const cardBg = useCardBg();
  const [trackingEnabled, setTrackingEnabled] = useState(false);
  const [trackingBusy, setTrackingBusy] = useState(false);
  const [notifGranted, setNotifGranted] = useState<boolean | null>(null);
  const [batteryGranted, setBatteryGranted] = useState<boolean | null>(null);
  const [hcGranted, setHcGranted] = useState<boolean | null>(null);
  const [stepGoal, setStepGoal] = useState<number | null>(null);

  async function handleStepGoalSelect(goal: number) {
    setStepGoal(goal);
    await AsyncStorage.setItem(STEP_GOAL_KEY, String(goal));
    // Clear the nudge dismissal so it doesn't re-appear (goal is now set)
    await AsyncStorage.removeItem(STEP_GOAL_NUDGE_KEY);
  }

  const checkPermissions = useCallback(async () => {
    if (Platform.OS !== "android") return;
    try { setTrackingEnabled(await isForegroundServiceRunning()); } catch (_) {}
    try {
      const s = await Notifications.getPermissionsAsync();
      setNotifGranted(s.granted);
    } catch (_) {}
    try {
      setBatteryGranted(!(await notifee.isBatteryOptimizationEnabled()));
    } catch (_) {}
    try {
      const g = await getGrantedPermissions();
      setHcGranted(
        g.some((p: any) => p.recordType === "Steps" && p.accessType === "read") &&
        g.some((p: any) => p.recordType === "SleepSession" && p.accessType === "read") &&
        g.some((p: any) => p.recordType === "HeartRate" && p.accessType === "read")
      );
    } catch (_) { setHcGranted(false); }
  }, []);

  useFocusEffect(useCallback(() => {
    checkPermissions();
    AsyncStorage.getItem(STEP_GOAL_KEY).then((v) => {
      if (v) setStepGoal(Number(v));
    }).catch(() => {});
  }, [checkPermissions]));

  async function handleToggle(value: boolean) {
    if (!value) {
      await stopForegroundService().catch(() => {});
      setTrackingEnabled(false);
      return;
    }
    setTrackingBusy(true);
    try {
      let notifOk = notifGranted;
      if (!notifOk) {
        const result = await notifee.requestPermission();
        notifOk = result.authorizationStatus === AuthorizationStatus.AUTHORIZED;
        setNotifGranted(notifOk);
      }
      if (!notifOk) {
        Alert.alert("Notification permission required", "Enable it in notification settings.", [
          { text: "Cancel", style: "cancel" },
          { text: "Open settings", onPress: () => IntentLauncher.startActivityAsync("android.settings.APP_NOTIFICATION_SETTINGS", { extra: { "android.provider.extra.APP_PACKAGE": "com.kellehs.wellness" } }).catch(() => {}) },
        ]);
        return;
      }
      if (!batteryGranted) {
        await IntentLauncher.startActivityAsync("android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS", { data: "package:com.kellehs.wellness" }).catch(() => {});
        setBatteryGranted(!(await notifee.isBatteryOptimizationEnabled().catch(() => true)));
      }
      if (!hcGranted) {
        const granted = await requestHealthPermissions();
        setHcGranted(granted);
      }
      await startForegroundService();
      setTrackingEnabled(true);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to start tracking.");
    } finally {
      setTrackingBusy(false);
    }
  }

  if (Platform.OS !== "android") {
    return (
      <View style={{ flex: 1, backgroundColor: theme.page, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: theme.textSoft }}>Always-on tracking is Android only.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: theme.page }} contentContainerStyle={styles.content}>
      <Text style={[styles.groupLabel, { color: theme.textSoft }]}>ALWAYS-ON TRACKING</Text>
      <View style={[styles.card, { backgroundColor: cardBg, borderColor: theme.cardBorder }]}>
        <Text style={[styles.desc, { color: theme.textSoft }]}>
          Shows a persistent notification with live glucose and steps. Keeps syncing in the background.
        </Text>

        <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 4 }}>
          <Text style={{ color: theme.textStrong, flex: 1 }}>Always-on tracking notification</Text>
          {trackingBusy
            ? <LoadingIndicator size="small" color={theme.teal.bar} />
            : <Switch value={trackingEnabled} onValueChange={handleToggle} trackColor={{ false: theme.cardBorder, true: theme.teal.bar }} thumbColor="#fff" />
          }
        </View>

        <View style={[styles.statusBox, { backgroundColor: theme.page, borderColor: theme.ink }]}>
          <StatusRow label="Notification permission" status={notifGranted === null ? "unknown" : notifGranted ? "granted" : "denied"} theme={theme} />
          <StatusRow label="Battery optimization exempt" status={batteryGranted === null ? "unknown" : batteryGranted ? "granted" : "denied"} theme={theme} />
          <StatusRow label="Health Connect" status={hcGranted === null ? "unknown" : hcGranted ? "granted" : "denied"} theme={theme} />
        </View>

        {notifGranted === false && (
          <Pressable
            onPress={() => IntentLauncher.startActivityAsync("android.settings.APP_NOTIFICATION_SETTINGS", { extra: { "android.provider.extra.APP_PACKAGE": "com.kellehs.wellness" } }).catch(() => {})}
            style={[styles.btn, { backgroundColor: theme.coral.bg, borderColor: theme.coral.sub }]}
          >
            <Text style={{ color: theme.coral.fg, fontWeight: "500" }}>Open notification settings</Text>
          </Pressable>
        )}
      </View>

      <Text style={[styles.groupLabel, { color: theme.textSoft, marginTop: 8 }]}>DAILY STEP GOAL</Text>
      <View style={[styles.card, { backgroundColor: cardBg, borderColor: theme.cardBorder }]}>
        <Text style={[styles.desc, { color: theme.textSoft }]}>
          Sets your personal daily step target. Used on the Health screen progress ring.
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
          {STEP_GOAL_OPTIONS.map((opt) => {
            const selected = stepGoal === opt;
            return (
              <Pressable
                key={opt}
                onPress={() => handleStepGoalSelect(opt)}
                style={[
                  styles.chip,
                  {
                    backgroundColor: selected ? theme.teal.solid : theme.page,
                    borderColor: selected ? theme.teal.solid : theme.cardBorder,
                    box_shadow: selected ? `3px 3px 0 ${theme.ink}` : undefined,
                  },
                ]}
              >
                <Text style={{ color: selected ? "#fff" : theme.textSoft, fontSize: 13, fontWeight: "800" }}>
                  {opt.toLocaleString()}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {stepGoal === null && (
          <Text style={{ color: theme.coral.fg, fontSize: 11, fontWeight: "700", marginTop: 6 }}>
            No goal set — tap one to set yours
          </Text>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 },
  groupLabel: { fontSize: 9, fontWeight: "900", letterSpacing: 0.6, marginTop: 4, marginBottom: -4 },
  card: { borderRadius: 22, borderWidth: 2, padding: 16, gap: 8 },
  desc: { fontSize: 12, marginBottom: 4 },
  statusBox: { borderWidth: 2, borderRadius: 16, padding: 10, marginTop: 4, gap: 2 },
  btn: { borderWidth: 2, borderRadius: 16, paddingVertical: 10, alignItems: "center", marginTop: 8 },
  chip: { borderWidth: 2, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 7 },
});
