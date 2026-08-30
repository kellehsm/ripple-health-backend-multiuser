import React, { useCallback, useEffect, useState } from "react";
import { ScrollView, View, Text, Switch, Pressable, StyleSheet, Alert, Platform } from "react-native";
import { LoadingIndicator } from "../../components/LoadingIndicator";
import { useFocusEffect } from "@react-navigation/core";
import { getGrantedPermissions, initialize, revokeAllPermissions, openHealthConnectSettings } from "react-native-health-connect";
import * as IntentLauncher from "expo-intent-launcher";
import { useTheme } from "../../theme/ThemeContext";
import { onSolid } from "../../theme/colorUtils";
import { api } from "../../api/client";
import { requestHealthPermissions, syncHealthData, resetHCInitialized } from "../../lib/healthConnect";
import { startForegroundService, stopForegroundService, isForegroundServiceRunning } from "../../lib/foregroundService";
import { ScreenBackground } from "../../components/ScreenBackground";

type HCSettings = {
  auto_sync_enabled?: boolean;
  sync_steps?: boolean;
  sync_sleep?: boolean;
  sync_heart_rate?: boolean;
  sync_exercise?: boolean;
  sync_weight?: boolean;
  sync_spo2?: boolean;
};

export function HealthConnectSettingsScreen() {
  const { theme } = useTheme();
  const [hc, setHc] = useState<HCSettings>({});
  const [hcGranted, setHcGranted] = useState<boolean | null>(null);
  const [grantedRecords, setGrantedRecords] = useState<{ steps: boolean; sleep: boolean; heart: boolean; exercise: boolean; weight: boolean; spo2: boolean }>({ steps: false, sleep: false, heart: false, exercise: false, weight: false, spo2: false });
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState<string | null>(null);
  const [liveTracking, setLiveTracking] = useState(false);

  const checkPermissions = useCallback(async (afterRevoke = false) => {
    if (Platform.OS !== "android") return;
    try {
      const running = await isForegroundServiceRunning();
      setLiveTracking(running);
    } catch (_) {}
    try {
      // Health Connect requires initialize() before every session — without it,
      // getGrantedPermissions() often returns [] or throws, which used to flip
      // the UI to "Not granted" and made permissions look like they were being
      // revoked on every focus.
      const ready = await initialize();
      if (!ready) {
        // After revoke the client may briefly fail to initialize — treat that as
        // "not connected" rather than keeping the prior stale "Connected" state.
        if (afterRevoke) {
          setHcGranted(false);
          setGrantedRecords({ steps: false, sleep: false, heart: false, exercise: false, weight: false, spo2: false });
        }
        return;
      }
      const granted = await getGrantedPermissions();
      const hasSteps = granted.some((p: any) => p.recordType === "Steps" && p.accessType === "read");
      const hasSleep = granted.some((p: any) => p.recordType === "SleepSession" && p.accessType === "read");
      const hasHR = granted.some((p: any) => p.recordType === "HeartRate" && p.accessType === "read");
      const hasExercise = granted.some((p: any) => p.recordType === "ExerciseSession" && p.accessType === "read");
      const hasWeight = granted.some((p: any) => p.recordType === "Weight" && p.accessType === "read");
      const hasSpo2 = granted.some((p: any) => p.recordType === "OxygenSaturation" && p.accessType === "read");
      setGrantedRecords({ steps: hasSteps, sleep: hasSleep, heart: hasHR, exercise: hasExercise, weight: hasWeight, spo2: hasSpo2 });
      // "Granted" = at least one record connected. Partial grants are valid;
      // the per-record chips below tell the user exactly what's on.
      setHcGranted(hasSteps || hasSleep || hasHR || hasExercise || hasWeight || hasSpo2);
    } catch (_) {
      // Transient IPC failure — keep the last known state rather than flipping
      // to "Not granted" and confusing the user.
    }
  }, []);

  useEffect(() => {
    api.getSettings().then((s) => setHc(s?.health_connect ?? {})).catch(() => {});
    checkPermissions();
  }, [checkPermissions]);

  useFocusEffect(useCallback(() => { checkPermissions(); }, [checkPermissions]));

  async function setToggle(key: string, value: boolean) {
    const updated = { health_connect: { ...hc, [key]: value } };
    setHc((prev) => ({ ...prev, [key]: value }));
    setSaving(true);
    try {
      await api.patchSettings(updated);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const granted = await requestHealthPermissions();
      if (!granted) { setSyncResult("Permission denied by Health Connect."); return; }
      const result = await syncHealthData({ syncExercise: hc.sync_exercise !== false, syncWeight: hc.sync_weight !== false, syncSpo2: hc.sync_spo2 !== false });
      const parts: string[] = [];
      if (result.steps !== null) parts.push(result.steps.toLocaleString() + " steps");
      if (result.sleepHours !== null) parts.push(result.sleepHours + "h sleep");
      if (result.heartRate !== null) parts.push(result.heartRate + " bpm");
      if (result.activeMinutes !== null) parts.push(result.activeMinutes + "min active");
      if (result.weightKg !== null) parts.push(result.weightKg + "kg");
      if (result.spo2Pct !== null) parts.push(result.spo2Pct + "% SpO2");
      if (result.errors.length > 0) parts.push("errors: " + result.errors.join(", "));
      setSyncResult(parts.length > 0 ? "Synced: " + parts.join(" · ") : "No new data found.");
    } catch (e: any) {
      setSyncResult("Sync failed: " + (e?.message ?? "unknown error"));
    } finally {
      setSyncing(false);
    }
  }

  async function handleBackfill() {
    setBackfilling(true);
    setBackfillResult(null);
    try {
      const granted = await requestHealthPermissions();
      if (!granted) { setBackfillResult("Health Connect permission required."); return; }
      const result = await syncHealthData({ syncExercise: hc.sync_exercise !== false, syncWeight: hc.sync_weight !== false, syncSpo2: hc.sync_spo2 !== false });
      const parts: string[] = [];
      if (result.steps !== null) parts.push(result.steps.toLocaleString() + " steps today");
      if (result.errors.length > 0) parts.push("errors: " + result.errors.join(", "));
      setBackfillResult(parts.length > 0 ? "Done — " + parts.join(", ") : "Backfill complete (30 days).");
    } catch (e: any) {
      setBackfillResult("Backfill failed: " + (e?.message ?? "unknown error"));
    } finally {
      setBackfilling(false);
    }
  }

  async function handleLiveTracking() {
    try {
      if (liveTracking) {
        await stopForegroundService();
        setLiveTracking(false);
      } else {
        const granted = await requestHealthPermissions();
        if (!granted) {
          Alert.alert("Permission required", "Health Connect permission is needed for live tracking.");
          return;
        }
        await startForegroundService();
        setLiveTracking(true);
      }
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to toggle live tracking.");
    }
  }

  async function handleDisconnectHC() {
    Alert.alert(
      "Disconnect Health Connect?",
      "Ripple will lose access to all Health Connect data. You can reconnect at any time by granting permissions again.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: async () => {
            try {
              await revokeAllPermissions();
              // Reset client init flag so the next HC call re-initializes cleanly;
              // also reset UI state immediately (don't wait for checkPermissions) so
              // sync/live-tracking code doesn't race with the stale "Connected" state.
              resetHCInitialized();
              setHcGranted(false);
              setGrantedRecords({ steps: false, sleep: false, heart: false, exercise: false, weight: false, spo2: false });
              await api.patchSettings({ health_connect: { ...hc, auto_sync_enabled: false } });
              setHc((prev) => ({ ...prev, auto_sync_enabled: false }));
              // Re-check from scratch to confirm revoke took effect.
              await checkPermissions(true);
            } catch (e: any) {
              Alert.alert("Error", e?.message ?? "Failed to revoke permissions.");
            }
          },
        },
      ]
    );
  }

  if (Platform.OS !== "android") {
    return (
      <View style={{ flex: 1, backgroundColor: theme.page, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: theme.textSoft }}>Health Connect is Android only.</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.page }}>
      <ScreenBackground pageId="settings_health_connect" />
    <ScrollView style={{ backgroundColor: "transparent" }} contentContainerStyle={styles.content}>

      <Text style={[styles.groupLabel, { color: theme.textSoft }]}>PERMISSIONS</Text>
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <View style={styles.statusRow}>
          <Text style={{ color: theme.textStrong, flex: 1 }}>Health Connect permissions</Text>
          <Text style={{ color: hcGranted ? theme.teal.fg : theme.coral.fg, fontWeight: "700", fontSize: 13 }}>
            {hcGranted === null ? "Checking…" : hcGranted ? "Connected" : "Not connected"}
          </Text>
        </View>
        {hcGranted !== null && (
          <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
            {[
              { label: "Steps", on: grantedRecords.steps },
              { label: "Sleep", on: grantedRecords.sleep },
              { label: "Heart rate", on: grantedRecords.heart },
              { label: "Exercise", on: grantedRecords.exercise },
              { label: "Weight", on: grantedRecords.weight },
              { label: "SpO2", on: grantedRecords.spo2 },
            ].map((chip) => (
              <View
                key={chip.label}
                style={{
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  borderRadius: 8,
                  borderWidth: 1.5,
                  borderColor: chip.on ? theme.teal.solid : theme.cardBorder,
                  backgroundColor: chip.on ? theme.teal.tint : theme.card,
                }}
              >
                <Text style={{ color: chip.on ? theme.teal.fg : theme.textSoft, fontSize: 11, fontWeight: "700" }}>
                  {chip.on ? "✓ " : "○ "}{chip.label}
                </Text>
              </View>
            ))}
          </View>
        )}
        {(hcGranted === false || (hcGranted && !(grantedRecords.steps && grantedRecords.sleep && grantedRecords.heart && grantedRecords.exercise && grantedRecords.weight && grantedRecords.spo2))) && (
          <Pressable
            onPress={async () => {
              try {
                const granted = await requestHealthPermissions();
                if (!granted) {
                  // requestPermission returned nothing — open settings so user can grant manually
                  openHealthConnectSettings();
                }
              } catch {
                // Fallback: open Health Connect settings page directly
                openHealthConnectSettings();
              }
              // Must await so checkPermissions' initialize() call doesn't race
              // with the still-open HC permissions dialog (concurrent init hangs the HC UI).
              await checkPermissions();
            }}
            style={[styles.btn, { backgroundColor: theme.teal.solid, borderColor: theme.teal.sub }]}
          >
            <Text style={{ color: onSolid(theme.teal.solid), fontWeight: "600" }}>
              {hcGranted ? "Grant remaining permissions" : "Grant Health Connect permissions"}
            </Text>
          </Pressable>
        )}
        {hcGranted && (
          <Pressable
            onPress={handleDisconnectHC}
            style={[styles.btn, { backgroundColor: theme.coral.tint, borderColor: theme.coral.sub }]}
          >
            <Text style={{ color: theme.coral.fg, fontWeight: "600" }}>Disconnect Health Connect</Text>
          </Pressable>
        )}
      </View>

      <Text style={[styles.groupLabel, { color: theme.textSoft }]}>SAMSUNG HEALTH</Text>
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <Text style={[styles.desc, { color: theme.textSoft }]}>
          Use Samsung Health? Your steps, sleep, and heart rate flow into Ripple automatically through Health Connect — no separate login needed.
        </Text>
        <Text style={[styles.desc, { color: theme.textSoft }]}>
          One-time setup: open Samsung Health → Settings → Connected services → Health Connect, and turn on sharing for Steps, Sleep, and Heart rate. Then grant the permissions above.
        </Text>
        <Pressable
          onPress={() => { try { openHealthConnectSettings(); } catch { Alert.alert("Unavailable", "Could not open Health Connect settings."); } }}
          style={[styles.btn, { backgroundColor: theme.blue.tint, borderColor: theme.blue.sub }]}
        >
          <Text style={{ color: theme.blue.fg, fontWeight: "600" }}>Open Health Connect settings</Text>
        </Pressable>
        <Text style={{ color: theme.textSoft, fontSize: 11 }}>
          Tip: after enabling, use "Sync now" below — if numbers appear, Samsung Health is connected.
        </Text>
        <View style={{ borderTopWidth: 1, borderColor: theme.cardBorder, marginTop: 4, paddingTop: 8 }}>
          <Text style={[styles.desc, { color: theme.textSoft }]}>
            To disconnect Samsung Health: open Health Connect settings below → App permissions → Connected apps → Samsung Health → turn off all permissions.
          </Text>
          <Pressable
            onPress={() => { try { openHealthConnectSettings(); } catch { Alert.alert("Unavailable", "Could not open Health Connect settings."); } }}
            style={[styles.btn, { backgroundColor: theme.coral.tint, borderColor: theme.coral.sub }]}
          >
            <Text style={{ color: theme.coral.fg, fontWeight: "600" }}>Disconnect Samsung Health</Text>
          </Pressable>
        </View>
      </View>

      <Text style={[styles.groupLabel, { color: theme.textSoft }]}>AUTO-SYNC</Text>
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        {saving && <LoadingIndicator size="small" style={{ alignSelf: "flex-end" }} />}
        <ToggleRow label="Auto-sync enabled" value={hc.auto_sync_enabled !== false} onChange={(v) => setToggle("auto_sync_enabled", v)} theme={theme} />
        <ToggleRow label="Sync steps" value={hc.sync_steps !== false} onChange={(v) => setToggle("sync_steps", v)} theme={theme} />
        <ToggleRow label="Sync sleep" value={hc.sync_sleep !== false} onChange={(v) => setToggle("sync_sleep", v)} theme={theme} />
        <ToggleRow label="Sync heart rate" value={hc.sync_heart_rate !== false} onChange={(v) => setToggle("sync_heart_rate", v)} theme={theme} />
        <ToggleRow label="Sync exercise (active minutes)" value={hc.sync_exercise !== false} onChange={(v) => setToggle("sync_exercise", v)} theme={theme} />
        <ToggleRow label="Sync weight" value={hc.sync_weight !== false} onChange={(v) => setToggle("sync_weight", v)} theme={theme} />
        <ToggleRow label="Sync blood oxygen (SpO2)" value={hc.sync_spo2 !== false} onChange={(v) => setToggle("sync_spo2", v)} theme={theme} />
      </View>

      <Text style={[styles.groupLabel, { color: theme.textSoft }]}>MANUAL SYNC</Text>
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <Pressable onPress={handleSync} disabled={syncing}
          style={[styles.btn, { backgroundColor: theme.teal.bg, borderColor: theme.teal.sub, opacity: syncing ? 0.6 : 1 }]}>
          {syncing ? <LoadingIndicator size="small" color={theme.teal.fg} /> : <Text style={{ color: theme.teal.fg, fontWeight: "500" }}>Sync now from Health Connect</Text>}
        </Pressable>
        {syncResult ? <Text style={{ color: theme.textSoft, fontSize: 12, marginTop: 4 }}>{syncResult}</Text> : null}

        <Pressable onPress={handleBackfill} disabled={backfilling}
          style={[styles.btn, { backgroundColor: theme.teal.bg, borderColor: theme.teal.sub, opacity: backfilling ? 0.6 : 1 }]}>
          {backfilling ? <LoadingIndicator size="small" color={theme.teal.fg} /> : <Text style={{ color: theme.teal.fg, fontWeight: "500" }}>Backfill 30-day history</Text>}
        </Pressable>
        {backfillResult ? <Text style={{ color: theme.textSoft, fontSize: 12, marginTop: 4 }}>{backfillResult}</Text> : null}
      </View>

      <Text style={[styles.groupLabel, { color: theme.textSoft }]}>LIVE TRACKING</Text>
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <Text style={[styles.desc, { color: theme.textSoft }]}>
          Keeps a persistent notification with live data. Requires Health Connect permissions.
        </Text>
        <Pressable
          onPress={handleLiveTracking}
          style={[styles.btn, { backgroundColor: liveTracking ? theme.coral.tint : theme.blue.tint, borderColor: liveTracking ? theme.coral.sub : theme.blue.sub }]}
        >
          <Text style={{ color: liveTracking ? theme.coral.fg : theme.blue.fg, fontWeight: "600" }}>
            {liveTracking ? "Stop live tracking" : "Start live tracking"}
          </Text>
        </Pressable>
        {liveTracking && (
          <Pressable
            onPress={() => IntentLauncher.startActivityAsync("android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS", { data: "package:com.kellehs.wellness" }).catch(() => Alert.alert("Unavailable", "Could not open battery settings."))}
            style={[styles.btn, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
          >
            <Text style={{ color: theme.textSoft, fontWeight: "500" }}>Battery optimization exemption</Text>
          </Pressable>
        )}
      </View>
    </ScrollView>
    </View>
  );
}

function ToggleRow({ label, value, onChange, theme }: { label: string; value: boolean; onChange: (v: boolean) => void; theme: any }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 4 }}>
      <Text style={{ color: theme.textStrong, flex: 1 }}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ false: theme.cardBorder, true: theme.teal.bar }} thumbColor="#fff" />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  groupLabel: { fontSize: 9, fontWeight: "900", letterSpacing: 0.6, marginTop: 4, marginBottom: -4 },
  card: { borderRadius: 22, borderWidth: 2, padding: 16, gap: 8 },
  desc: { fontSize: 12, marginBottom: 4 },
  statusRow: { flexDirection: "row", alignItems: "center", paddingVertical: 4 },
  btn: { borderWidth: 2, borderRadius: 16, paddingVertical: 10, alignItems: "center", marginTop: 4 },
});
