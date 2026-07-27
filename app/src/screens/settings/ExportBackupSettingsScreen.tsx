import React, { useCallback, useState } from "react";
import { ScrollView, View, Text, TextInput, Switch, Pressable, StyleSheet, Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LoadingIndicator } from "../../components/LoadingIndicator";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as WebBrowser from "expo-web-browser";
import { useFocusEffect } from "@react-navigation/core";
import { useTheme } from "../../theme/ThemeContext";
import { api, GOOGLE_CLIENT_ID } from "../../api/client";
import { getUserId } from "../../lib/auth";

WebBrowser.maybeCompleteAuthSession();

type DriveStatus = { connected: boolean; last_backup: string | null; auto_backup: boolean; connected_at: string | null };

export function ExportBackupSettingsScreen() {
  const { theme } = useTheme();
  const defaultEnd = new Date().toISOString().slice(0, 10);
  const defaultStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [exportStart, setExportStart] = useState(defaultStart);
  const [exportEnd, setExportEnd] = useState(defaultEnd);
  const [exporting, setExporting] = useState(false);
  const [exportingAll, setExportingAll] = useState(false);
  const [driveStatus, setDriveStatus] = useState<DriveStatus | null>(null);
  const [driveConnecting, setDriveConnecting] = useState(false);
  const [driveBackingUp, setDriveBackingUp] = useState(false);
  const [driveBackups, setDriveBackups] = useState<Array<{ id: string; name: string; createdTime: string }> | null>(null);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const loadDriveStatus = useCallback(async () => {
    try { setDriveStatus(await api.getDriveStatus()); } catch (_) {}
  }, []);

  useFocusEffect(useCallback(() => { loadDriveStatus(); }, [loadDriveStatus]));

  async function handleExportReport() {
    setExporting(true);
    try {
      const url = await api.reportUrl(new Date(exportStart).toISOString(), new Date(exportEnd + "T23:59:59").toISOString());
      const localUri = (FileSystem.cacheDirectory ?? "") + "ripple-wellness-report.pdf";
      const { uri } = await FileSystem.downloadAsync(url, localUri);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: "Share health report" });
      } else {
        Alert.alert("Saved", "Report saved to: " + uri);
      }
    } catch (e: any) { Alert.alert("Export failed", e?.message ?? "Unknown error"); }
    finally { setExporting(false); }
  }

  async function handleExportAll() {
    setExportingAll(true);
    try {
      const url = await api.exportAllUrl();
      const date = new Date().toISOString().slice(0, 10);
      const localUri = (FileSystem.cacheDirectory ?? "") + "ripple-backup-" + date + ".json";
      const { uri } = await FileSystem.downloadAsync(url, localUri);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "application/json", dialogTitle: "Save data backup" });
      } else {
        Alert.alert("Saved", "Backup saved to: " + uri);
      }
      await AsyncStorage.setItem("last_json_backup", Date.now().toString());
    } catch (e: any) { Alert.alert("Export failed", e?.message ?? "Unknown error"); }
    finally { setExportingAll(false); }
  }

  async function handleConnectDrive() {
    if (!GOOGLE_CLIENT_ID) { Alert.alert("Not configured", "Set GOOGLE_CLIENT_ID to enable Drive backups."); return; }
    setDriveConnecting(true);
    try {
      const userId = await getUserId();
      if (!userId) { Alert.alert("Error", "Could not determine user ID."); return; }
      const redirectUri = "https://app.kels.gg/auth/google/callback";
      const authUrl = "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID, redirect_uri: redirectUri, response_type: "code",
        scope: "https://www.googleapis.com/auth/drive.file", access_type: "offline", prompt: "consent", state: userId,
      }).toString();
      const result = await WebBrowser.openAuthSessionAsync(authUrl, "ripple://oauth");
      if (result.type === "success" && result.url.includes("status=connected")) {
        await loadDriveStatus();
        Alert.alert("Connected", "Google Drive backup is set up. Nightly backups will run at 2 AM.");
      } else if (result.type === "success" && result.url.includes("status=error")) {
        Alert.alert("Connection failed", "Google authorization failed. Try again.");
      }
    } catch (e: any) { Alert.alert("Error", e?.message ?? "Failed to open Google auth."); }
    finally { setDriveConnecting(false); }
  }

  async function handleManualBackup() {
    setDriveBackingUp(true);
    try {
      const res = await api.triggerDriveBackup();
      await loadDriveStatus();
      Alert.alert("Backup complete", res.filename ?? "Backup uploaded to Google Drive.");
    } catch (e: any) { Alert.alert("Backup failed", e?.message ?? "Unknown error"); }
    finally { setDriveBackingUp(false); }
  }

  async function handleAutoBackupToggle(value: boolean) {
    try {
      await api.setDriveAutoBackup(value);
      setDriveStatus((prev) => prev ? { ...prev, auto_backup: value } : prev);
    } catch (e: any) { Alert.alert("Error", e?.message ?? "Failed to update setting."); }
  }

  async function handleLoadBackups() {
    setLoadingBackups(true);
    try { setDriveBackups((await api.listDriveBackups()).files ?? []); }
    catch (e: any) { Alert.alert("Error", e?.message ?? "Could not list backups."); }
    finally { setLoadingBackups(false); }
  }

  async function handleRestore(fileId: string, filename: string) {
    Alert.alert("Restore from backup?", `This will import data from "${filename}". Existing records won't be overwritten.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Restore", onPress: async () => {
        setRestoringId(fileId);
        try {
          const res = await api.restoreFromDrive(fileId);
          const c = res.counts ?? {};
          const lines = [
            c.glucose_readings && `${c.glucose_readings} glucose readings`,
            c.meals && `${c.meals} meals`,
            c.journal_entries && `${c.journal_entries} journal entries`,
            c.spending_entries && `${c.spending_entries} spending entries`,
          ].filter(Boolean);
          Alert.alert("Restore complete", lines.length > 0 ? "Added: " + lines.join(", ") : "Nothing new to import.");
        } catch (e: any) { Alert.alert("Restore failed", e?.message ?? "Unknown error"); }
        finally { setRestoringId(null); }
      }},
    ]);
  }

  async function handleDisconnectDrive() {
    Alert.alert("Disconnect Google Drive?", "Nightly backups will stop. Existing files in Drive remain.", [
      { text: "Cancel", style: "cancel" },
      { text: "Disconnect", style: "destructive", onPress: async () => {
        try { await api.disconnectDrive(); setDriveStatus(null); }
        catch (e: any) { Alert.alert("Error", e?.message ?? "Failed to disconnect."); }
      }},
    ]);
  }

  return (
    <ScrollView style={{ backgroundColor: theme.page }} contentContainerStyle={styles.content}>

      <Text style={[styles.groupLabel, { color: theme.textSoft }]}>HEALTH REPORT</Text>
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <Text style={[styles.desc, { color: theme.textSoft }]}>PDF with glucose trends and meal timing — useful to bring to a doctor's appointment.</Text>
        <Text style={[styles.label, { color: theme.textSoft }]}>Start date</Text>
        <TextInput value={exportStart} onChangeText={setExportStart} placeholder="YYYY-MM-DD" placeholderTextColor={theme.textSoft}
          autoCapitalize="none" autoCorrect={false}
          style={[styles.input, { color: theme.textStrong, borderColor: theme.ink, backgroundColor: theme.page }]} />
        <Text style={[styles.label, { color: theme.textSoft }]}>End date</Text>
        <TextInput value={exportEnd} onChangeText={setExportEnd} placeholder="YYYY-MM-DD" placeholderTextColor={theme.textSoft}
          autoCapitalize="none" autoCorrect={false}
          style={[styles.input, { color: theme.textStrong, borderColor: theme.ink, backgroundColor: theme.page }]} />
        <Pressable onPress={handleExportReport} disabled={exporting}
          style={[styles.btn, { backgroundColor: theme.teal.bg, borderColor: theme.teal.sub, opacity: exporting ? 0.6 : 1 }]}>
          {exporting ? <LoadingIndicator size="small" color={theme.teal.fg} /> : <Text style={{ color: theme.teal.fg, fontWeight: "500" }}>Generate &amp; share PDF</Text>}
        </Pressable>
      </View>

      <Text style={[styles.groupLabel, { color: theme.textSoft }]}>FULL DATA EXPORT</Text>
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <Text style={[styles.desc, { color: theme.textSoft }]}>Full backup of all your data as JSON.</Text>
        <Pressable onPress={handleExportAll} disabled={exportingAll}
          style={[styles.btn, { backgroundColor: theme.teal.bg, borderColor: theme.teal.sub, opacity: exportingAll ? 0.6 : 1 }]}>
          {exportingAll ? <LoadingIndicator size="small" color={theme.teal.fg} /> : <Text style={{ color: theme.teal.fg, fontWeight: "500" }}>Download full backup</Text>}
        </Pressable>
      </View>

      <Text style={[styles.groupLabel, { color: theme.textSoft }]}>GOOGLE DRIVE</Text>
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <Text style={[styles.desc, { color: theme.textSoft }]}>Automatically backs up to Google Drive every night at 2 AM. Keeps the last 14 days.</Text>
        {driveStatus?.connected ? (
          <>
            <View style={[styles.statusBox, { borderColor: theme.teal.sub, backgroundColor: theme.teal.bg }]}>
              <Text style={{ color: theme.teal.fg, fontSize: 13, fontWeight: "600" }}>● Connected</Text>
              {driveStatus.last_backup ? (
                <Text style={{ color: theme.teal.fg, fontSize: 12, marginTop: 2 }}>Last backup: {new Date(driveStatus.last_backup).toLocaleString()}</Text>
              ) : (
                <Text style={{ color: theme.teal.sub, fontSize: 12, marginTop: 2 }}>No backup yet</Text>
              )}
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 4 }}>
              <Text style={{ color: theme.textStrong, flex: 1 }}>Nightly auto-backup</Text>
              <Switch value={driveStatus.auto_backup} onValueChange={handleAutoBackupToggle}
                trackColor={{ false: theme.cardBorder, true: theme.teal.bar }} thumbColor="#fff" />
            </View>
            <Pressable onPress={handleManualBackup} disabled={driveBackingUp}
              style={[styles.btn, { backgroundColor: theme.teal.bg, borderColor: theme.teal.sub, opacity: driveBackingUp ? 0.6 : 1 }]}>
              {driveBackingUp ? <LoadingIndicator size="small" color={theme.teal.fg} /> : <Text style={{ color: theme.teal.fg, fontWeight: "500" }}>Back up now</Text>}
            </Pressable>
            <Pressable onPress={handleLoadBackups} disabled={loadingBackups}
              style={[styles.btn, { backgroundColor: theme.purple.bg ?? theme.card, borderColor: theme.purple.sub, opacity: loadingBackups ? 0.6 : 1 }]}>
              {loadingBackups ? <LoadingIndicator size="small" color={theme.purple.fg} /> : <Text style={{ color: theme.purple.fg, fontWeight: "500" }}>View backups to restore</Text>}
            </Pressable>
            {driveBackups !== null && (
              <View style={{ gap: 6, marginTop: 4 }}>
                {driveBackups.length === 0 ? (
                  <Text style={{ color: theme.textSoft, fontSize: 12, textAlign: "center" }}>No JSON backups found in Drive.</Text>
                ) : driveBackups.map((file) => (
                  <View key={file.id} style={{ flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: theme.cardBorder, borderRadius: 8, padding: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.textStrong, fontSize: 13, fontWeight: "600" }}>{file.name}</Text>
                      <Text style={{ color: theme.textSoft, fontSize: 11 }}>{new Date(file.createdTime).toLocaleDateString()}</Text>
                    </View>
                    <Pressable onPress={() => handleRestore(file.id, file.name)} disabled={restoringId === file.id}
                      style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: theme.purple.sub, backgroundColor: theme.purple.bg ?? theme.card }}>
                      {restoringId === file.id ? <LoadingIndicator size="small" color={theme.purple.fg} /> : <Text style={{ color: theme.purple.fg, fontSize: 12, fontWeight: "600" }}>Restore</Text>}
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
            <Pressable onPress={handleDisconnectDrive}
              style={[styles.btn, { backgroundColor: theme.card, borderColor: theme.coral.sub, marginTop: 4 }]}>
              <Text style={{ color: theme.coral.fg, fontWeight: "500" }}>Disconnect Google Drive</Text>
            </Pressable>
          </>
        ) : (
          <Pressable onPress={handleConnectDrive} disabled={driveConnecting}
            style={[styles.btn, { backgroundColor: theme.blue.bg, borderColor: theme.blue.sub, opacity: driveConnecting ? 0.6 : 1 }]}>
            {driveConnecting ? <LoadingIndicator size="small" color={theme.blue.fg} /> : <Text style={{ color: theme.blue.fg, fontWeight: "500" }}>Connect Google Drive</Text>}
          </Pressable>
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
  label: { fontSize: 12, marginTop: 8 },
  input: { borderWidth: 2, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, marginTop: 4 },
  btn: { borderWidth: 2, borderRadius: 16, paddingVertical: 10, alignItems: "center", marginTop: 4 },
  statusBox: { borderWidth: 2, borderRadius: 16, padding: 10, marginTop: 4 },
});
