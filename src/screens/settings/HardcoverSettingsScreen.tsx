import React, { useState, useCallback } from "react";
import {
  ScrollView, View, Text, TextInput, Pressable,
  StyleSheet, Alert, Linking, KeyboardAvoidingView, Platform,
} from "react-native";
import { useFocusEffect } from "@react-navigation/core";
import { Ionicons } from "@expo/vector-icons";
import { LoadingIndicator } from "../../components/LoadingIndicator";
import { useTheme } from "../../theme/ThemeContext";
import { api } from "../../api/client";

export function HardcoverSettingsScreen() {
  const { theme } = useTheme();
  const [connected, setConnected] = useState(false);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    api.getSettings()
      .then((s: any) => {
        setConnected(!!s?.hardcover?.token_set);
        setLastSynced(s?.hardcover?.last_synced_at ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []));

  async function handleConnect() {
    if (!token.trim()) {
      Alert.alert("Missing token", "Paste your Hardcover API token to continue.");
      return;
    }
    setSaving(true);
    try {
      const res = await api.hardcoverConnect(token.trim());
      setConnected(true);
      setToken("");
      Alert.alert("Connected", `Linked to @${res.username} on Hardcover. Your reading progress will sync automatically every few hours.`);
    } catch (e: any) {
      const msg = (e?.message ?? "").replace(/^API error \d+: /, "");
      Alert.alert("Connection failed", msg || "Check your token and try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    Alert.alert(
      "Disconnect Hardcover",
      "Your local reading progress stays intact — only the sync link will be removed.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: async () => {
            try {
              await api.hardcoverDisconnect();
              setConnected(false);
              setLastSynced(null);
            } catch {
              Alert.alert("Error", "Could not disconnect. Try again.");
            }
          },
        },
      ]
    );
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await api.hardcoverSync();
      const summary = `Imported: ${res.imported ?? 0}  Pushed: ${res.pushed}  Pulled: ${res.pulled}  Errors: ${res.errors}`;
      Alert.alert("Sync complete", summary);
      setLastSynced(new Date().toISOString());
    } catch (e: any) {
      const msg = (e?.message ?? "").replace(/^API error \d+: /, "");
      Alert.alert("Sync failed", msg || "Check your connection and try again.");
    } finally {
      setSyncing(false);
    }
  }

  function fmtDate(iso: string | null): string {
    if (!iso) return "Never";
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.page }}>
        <LoadingIndicator />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
    <ScrollView style={{ backgroundColor: theme.page }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

      {/* About */}
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <Text style={[styles.desc, { color: theme.textSoft }]}>
          Hardcover is an optional book-tracking platform. Connecting your account syncs reading status and page progress in both directions — your local tracking in Ripple always works independently.
        </Text>
        <Pressable
          onPress={() => void Linking.openURL("https://hardcover.app")}
          style={{ marginTop: 6 }}
        >
          <Text style={{ color: theme.teal.fg, fontSize: 13 }}>hardcover.app ↗</Text>
        </Pressable>
      </View>

      {connected ? (
        <>
          {/* Connected state */}
          <Text style={[styles.groupLabel, { color: theme.textSoft }]}>STATUS</Text>
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Ionicons name="checkmark-circle" size={20} color={theme.teal.fg} />
              <Text style={{ color: theme.teal.fg, fontWeight: "700", fontSize: 15 }}>Connected</Text>
            </View>
            <Text style={{ color: theme.textSoft, fontSize: 12, marginTop: 6 }}>
              Last synced: {fmtDate(lastSynced)}
            </Text>
            <Text style={{ color: theme.textSoft, fontSize: 12, marginTop: 2 }}>
              Syncs automatically every 4 hours while Ripple is running.
            </Text>

            <Pressable
              onPress={handleSync}
              disabled={syncing}
              style={[styles.btn, { backgroundColor: theme.teal.bg, borderColor: theme.teal.sub, marginTop: 12 }]}
            >
              {syncing
                ? <LoadingIndicator size="small" color={theme.teal.fg} />
                : <Text style={{ color: theme.teal.fg, fontWeight: "600" }}>Sync now</Text>}
            </Pressable>
          </View>

          <Text style={[styles.groupLabel, { color: theme.textSoft }]}>ACCOUNT</Text>
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <Text style={[styles.desc, { color: theme.textSoft }]}>
              Disconnecting removes the sync link. Your reading history in Ripple is unaffected.
            </Text>
            <Pressable
              onPress={handleDisconnect}
              style={[styles.btn, { backgroundColor: theme.page, borderColor: theme.coral?.sub ?? "#e8654e", marginTop: 8 }]}
            >
              <Text style={{ color: theme.coral?.fg ?? "#e8654e", fontWeight: "600" }}>Disconnect Hardcover</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <>
          {/* Not connected — show token entry */}
          <Text style={[styles.groupLabel, { color: theme.textSoft }]}>CONNECT YOUR ACCOUNT</Text>
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <Text style={[styles.desc, { color: theme.textSoft }]}>
              1. Open Hardcover and go to Settings → API.{"\n"}
              2. Copy your personal API token.{"\n"}
              3. Paste it below.
            </Text>
            <Pressable
              onPress={() => void Linking.openURL("https://hardcover.app/account/api")}
              style={{ marginBottom: 12 }}
            >
              <Text style={{ color: theme.teal.fg, fontSize: 13 }}>Open Hardcover API settings ↗</Text>
            </Pressable>

            <Text style={[styles.label, { color: theme.textSoft }]}>API Token</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 }}>
              <TextInput
                value={token}
                onChangeText={setToken}
                placeholder="Paste your Hardcover token"
                placeholderTextColor={theme.textSoft}
                secureTextEntry={!showToken}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={handleConnect}
                style={[styles.input, { flex: 1, color: theme.textStrong, borderColor: theme.ink, backgroundColor: theme.page }]}
              />
              <Pressable onPress={() => setShowToken(v => !v)} hitSlop={8}>
                <Ionicons
                  name={showToken ? "eye-off-outline" : "eye-outline"}
                  size={20}
                  color={theme.textSoft}
                />
              </Pressable>
            </View>

            <Text style={{ color: theme.textSoft, fontSize: 11, marginTop: 6 }}>
              Token is stored on the server and never returned after saving.
            </Text>

            <Pressable
              onPress={handleConnect}
              disabled={saving}
              style={[styles.btn, { backgroundColor: theme.teal.bg, borderColor: theme.teal.sub, marginTop: 12 }]}
            >
              {saving
                ? <LoadingIndicator size="small" color={theme.teal.fg} />
                : <Text style={{ color: theme.teal.fg, fontWeight: "600" }}>Connect Hardcover</Text>}
            </Pressable>
          </View>
        </>
      )}

      {/* What syncs */}
      <Text style={[styles.groupLabel, { color: theme.textSoft }]}>WHAT SYNCS</Text>
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        {[
          ["Reading status", "Want to read · Currently reading · Finished · Dropped"],
          ["Page progress", "Pages read, synced to your Hardcover reading log"],
        ].map(([title, sub]) => (
          <View key={title} style={styles.syncRow}>
            <Ionicons name="sync-outline" size={16} color={theme.teal.fg} style={{ marginTop: 1 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.textStrong, fontSize: 14, fontWeight: "600" }}>{title}</Text>
              <Text style={{ color: theme.textSoft, fontSize: 12, marginTop: 2 }}>{sub}</Text>
            </View>
          </View>
        ))}
        <Text style={[styles.desc, { color: theme.textSoft, marginTop: 8 }]}>
          Only books with a Hardcover ID (found via search) will sync. Books added manually won't link automatically.
        </Text>
      </View>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  groupLabel: { fontSize: 9, fontWeight: "900", letterSpacing: 0.6, marginTop: 4, marginBottom: -4, textTransform: "uppercase" },
  card: { borderRadius: 22, borderWidth: 2, padding: 16, gap: 8 },
  desc: { fontSize: 13, lineHeight: 20 },
  label: { fontSize: 12, marginTop: 4 },
  input: { borderWidth: 2, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14 },
  btn: { borderWidth: 2, borderRadius: 16, paddingVertical: 10, alignItems: "center" },
  syncRow: { flexDirection: "row", gap: 10, alignItems: "flex-start", paddingVertical: 4 },
});
