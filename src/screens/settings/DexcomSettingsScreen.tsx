import React, { useEffect, useState } from "react";
import { ScrollView, View, Text, TextInput, Pressable, StyleSheet, Alert, KeyboardAvoidingView, Platform } from "react-native";
import { LoadingIndicator } from "../../components/LoadingIndicator";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../theme/ThemeContext";
import { api } from "../../api/client";

export function DexcomSettingsScreen() {
  const { theme } = useTheme();
  const [accountId, setAccountId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [region, setRegion] = useState<"us" | "ous">("us");
  const [passwordSet, setPasswordSet] = useState(false);
  const [saving, setSaving] = useState(false);
  const [connError, setConnError] = useState<string | null>(null);
  const [connSuccess, setConnSuccess] = useState<string | null>(null);

  useEffect(() => {
    api.getSettings().then((s) => {
      setAccountId(s?.dexcom?.share_account_id ?? "");
      setRegion(s?.dexcom?.share_region === "ous" ? "ous" : "us");
      setPasswordSet(!!s?.dexcom?.share_password_set);
    }).catch(() => {});
  }, []);

  async function handleSave() {
    if (!accountId.trim()) {
      Alert.alert("Missing Info", "Please enter your Dexcom Account ID.");
      return;
    }
    if (!password && !passwordSet) {
      Alert.alert("Missing Info", "Please enter your Dexcom password.");
      return;
    }

    setConnError(null);
    setConnSuccess(null);
    setSaving(true);
    try {
      if (password) {
        // Verify credentials against Dexcom before saving — surfaces wrong password/ID errors
        await api.dexcomVerifyShare({ account_id: accountId.trim(), password, region });
      } else {
        // No new password — just update account_id and region (password preserved server-side)
        await api.patchSettings({
          dexcom: { share_account_id: accountId.trim(), share_password: "", share_region: region },
        });
      }
      setPassword("");
      setPasswordSet(true);
      api.glucoseSyncShare().catch(() => {});
      setConnSuccess(password ? "Credentials verified and saved. Syncing now…" : "Dexcom settings updated.");
    } catch (e: any) {
      const raw = e?.message ?? "Failed to save.";
      // Strip "API error 4xx: " prefix Fastify adds before showing to user
      const msg = raw.replace(/^API error \d+: /, "");
      setConnError(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
    <ScrollView style={{ backgroundColor: theme.page }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={[styles.groupLabel, { color: theme.textSoft }]}>CREDENTIALS</Text>
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <Text style={[styles.desc, { color: theme.textSoft }]}>
          Credentials are stored on the server and never returned to the app after saving.
        </Text>

        <Text style={[styles.label, { color: theme.textSoft }]}>Account ID</Text>
        <TextInput
          value={accountId} onChangeText={setAccountId}
          placeholder="Dexcom account ID (UUID)" placeholderTextColor={theme.textSoft}
          autoCapitalize="none" autoCorrect={false}
          returnKeyType="next"
          style={[styles.input, { color: theme.textStrong, borderColor: theme.ink, backgroundColor: theme.page }]}
        />

        <Text style={[styles.label, { color: theme.textSoft }]}>
          Password {passwordSet ? "(set — leave blank to keep)" : ""}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <TextInput
            value={password} onChangeText={setPassword}
            placeholder={passwordSet ? "Leave blank to keep existing" : "Password"}
            placeholderTextColor={theme.textSoft}
            secureTextEntry={!showPassword} autoCapitalize="none" autoCorrect={false}
            returnKeyType="done" onSubmitEditing={handleSave}
            style={[styles.input, { flex: 1, color: theme.textStrong, borderColor: theme.ink, backgroundColor: theme.page }]}
          />
          <Pressable onPress={() => setShowPassword(v => !v)} hitSlop={8} style={{ padding: 4 }}>
            <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color={theme.textSoft} />
          </Pressable>
        </View>

        <Text style={[styles.label, { color: theme.textSoft }]}>Region</Text>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
          {(["us", "ous"] as const).map((r) => (
            <Pressable key={r} onPress={() => setRegion(r)}
              style={[styles.chip, { backgroundColor: region === r ? theme.teal.bar : theme.page, borderColor: theme.ink }]}>
              <Text style={{ color: region === r ? "#fff" : theme.textSoft, fontSize: 13 }}>
                {r === "us" ? "US" : "Outside US"}
              </Text>
            </Pressable>
          ))}
        </View>

        {connError && (
          <View style={[styles.inlineBanner, { backgroundColor: theme.coral.tint, borderColor: theme.coral.solid }]}>
            <Ionicons name="alert-circle-outline" size={15} color={theme.coral.fg} style={{ flexShrink: 0 }} />
            <Text style={{ color: theme.coral.fg, fontSize: 12, flex: 1, marginLeft: 8 }}>{connError}</Text>
            <Pressable onPress={() => setConnError(null)} hitSlop={8}>
              <Ionicons name="close" size={14} color={theme.coral.fg} />
            </Pressable>
          </View>
        )}
        {connSuccess && (
          <View style={[styles.inlineBanner, { backgroundColor: theme.teal.tint, borderColor: theme.teal.solid }]}>
            <Ionicons name="checkmark-circle-outline" size={15} color={theme.teal.fg} style={{ flexShrink: 0 }} />
            <Text style={{ color: theme.teal.fg, fontSize: 12, flex: 1, marginLeft: 8 }}>{connSuccess}</Text>
          </View>
        )}
        <Pressable onPress={handleSave} disabled={saving}
          style={[styles.btn, { backgroundColor: theme.teal.bg, borderColor: theme.teal.sub }]}>
          {saving ? <LoadingIndicator size="small" color={theme.teal.fg} /> : <Text style={{ color: theme.teal.fg, fontWeight: "500" }}>Save credentials</Text>}
        </Pressable>
      </View>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  groupLabel: { fontSize: 9, fontWeight: "900", letterSpacing: 0.6, marginTop: 4, marginBottom: -4 },
  card: { borderRadius: 22, borderWidth: 2, padding: 16, gap: 8 },
  desc: { fontSize: 12, marginBottom: 4 },
  label: { fontSize: 12, marginTop: 8 },
  input: { borderWidth: 2, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, marginTop: 4 },
  chip: { borderWidth: 2, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 7 },
  inlineBanner: { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, marginTop: 4 },
  btn: { borderWidth: 2, borderRadius: 16, paddingVertical: 10, alignItems: "center", marginTop: 8 },
});
