import React, { useCallback, useEffect, useState } from "react";
import { ScrollView, View, Text, Switch, Pressable, StyleSheet, Alert, Platform } from "react-native";
import { LoadingIndicator } from "../../components/LoadingIndicator";
import { useFocusEffect } from "@react-navigation/core";
import { getGrantedPermissions } from "react-native-health-connect";
import * as IntentLauncher from "expo-intent-launcher";
import { useTheme } from "../../theme/ThemeContext";
import { onSolid } from "../../theme/colorUtils";
import { api } from "../../api/client";
import { requestHealthPermissions, syncHealthData } from "../../lib/healthConnect";
import { startForegroundService, stopForegroundService, isForegroundServiceRunning } from "../../lib/foregroundService";

type HCSettings = {
  auto_sync_enabled?: boolean;
  sync_steps?: boolean;
  sync_sleep?: boolean;
  sync_heart_rate?: boolean;
};

export function HealthConnectSettingsScreen() {
  const { theme } = useTheme();
  const [hc, setHc] = useState<HCSettings>({});
  const [hcGranted, setHcGranted] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState<string | null>(null);
  const [liveTracking, setLiveTracking] = useState(false);

  const checkPermissions = useCallback(async () => {
    if (Platform.OS !== "android") return;
    try {
      const running = await isForegroundServiceRunning();
      setLiveTracking(running);
    } catch (_) {}
    try {
      const granted = await getGrantedPermissions();
      const hasSteps = granted.some((p: any) => p.recordType === "Steps" && p.accessType === "read");
      const hasSleep = granted.some((p: any) => p.recordType === "SleepSession" && p.accessType === "read");
      const hasHR = granted.some((p: any) => p.recordType === "HeartRate" && p.accessType === "read");
      setHcGranted(hasSteps && hasSleep && hasHR);
    } catch (_) {
      setHcGranted(false);
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
      const result = await syncHealthData();
      const parts: string[] = [];
      if (result.steps !== null) parts.push(result.steps.toLocaleString() + " steps");
      if (result.sleepHours !== null) parts.push(result.sleepHours + "h sleep");
      if (result.heartRate !== null) parts.push(result.heartRate + " bpm");
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
      const result = await syncHealthData();
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

  if (Platform.OS !== "android") {
    return (
      <View style={{ flex: 1, backgroundColor: theme.page, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: theme.textSoft }}>Health Connect is Android only.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: theme.page }} contentContainerStyle={styles.content}>

      <Text style={[styles.groupLabel, { color: theme.textSoft }]}>PERMISSIONS</Text>
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <View style={styles.statusRow}>
          <Text style={{ color: theme.textStrong, flex: 1 }}>Health Connect permissions</Text>
          <Text style={{ color: hcGranted ? theme.teal.fg : theme.coral.fg, fontWeight: "700", fontSize: 13 }}>
            {hcGranted === null ? "Checking…" : hcGranted ? "Granted" : "Not granted"}
          </Text>
        </View>
        {hcGranted === false && (
          <Pressable
            onPress={async () => { const g = await requestHealthPermissions().catch(() => false); setHcGranted(!!g); }}
            style={[styles.btn, { backgroundColor: theme.teal.solid, borderColor: theme.teal.sub }]}
          >
            <Text style={{ color: onSolid(theme.teal.solid), fontWeight: "600" }}>Grant Health Connect permissions</Text>
          </Pressable>
        )}
      </View>

      <Text style={[styles.groupLabel, { color: theme.textSoft }]}>AUTO-SYNC</Text>
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        {saving && <LoadingIndicator size="small" style={{ alignSelf: "flex-end" }} />}
        <ToggleRow label="Auto-sync enabled" value={hc.auto_sync_enabled !== false} onChange={(v) => setToggle("auto_sync_enabled", v)} theme={theme} />
        <ToggleRow label="Sync steps" value={hc.sync_steps !== false} onChange={(v) => setToggle("sync_steps", v)} theme={theme} />
        <ToggleRow label="Sync sleep" value={hc.sync_sleep !== false} onChange={(v) => setToggle("sync_sleep", v)} theme={theme} />
        <ToggleRow label="Sync heart rate" value={hc.sync_heart_rate !== false} onChange={(v) => setToggle("sync_heart_rate", v)} theme={theme} />
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
  content: { padding: 16, gap: 12 },
  groupLabel: { fontSize: 9, fontWeight: "900", letterSpacing: 0.6, marginTop: 4, marginBottom: -4 },
  card: { borderRadius: 22, borderWidth: 2, padding: 16, gap: 8 },
  desc: { fontSize: 12, marginBottom: 4 },
  statusRow: { flexDirection: "row", alignItems: "center", paddingVertical: 4 },
  btn: { borderWidth: 2, borderRadius: 16, paddingVertical: 10, alignItems: "center", marginTop: 4 },
});
