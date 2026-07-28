import React, { useEffect, useState } from "react";
import { ScrollView, View, Text, Switch, StyleSheet, Alert } from "react-native";
import { useTheme } from "../../theme/ThemeContext";
import { isBiometricLockEnabled, setBiometricLockEnabled, authenticateWithBiometrics } from "../../lib/biometricLock";

export function SecuritySettingsScreen() {
  const { theme } = useTheme();
  const [biometricEnabled, setBiometricEnabled] = useState(false);

  useEffect(() => {
    isBiometricLockEnabled().then(setBiometricEnabled).catch(() => {});
  }, []);

  async function handleToggle(value: boolean) {
    if (value) {
      const result = await authenticateWithBiometrics();
      if (result === "unavailable") {
        Alert.alert("Not available", "No biometric hardware or enrollments found on this device.");
        return;
      }
      if (result === "failed") return;
      await setBiometricLockEnabled(true);
      setBiometricEnabled(true);
    } else {
      await setBiometricLockEnabled(false);
      setBiometricEnabled(false);
    }
  }

  return (
    <ScrollView style={{ backgroundColor: theme.page }} contentContainerStyle={styles.content}>
      <Text style={[styles.groupLabel, { color: theme.textSoft }]}>APP LOCK</Text>
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <Text style={[styles.desc, { color: theme.textSoft }]}>
          Require biometric auth (fingerprint / face) when opening Ripple after 5 minutes in the background.
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 4 }}>
          <Text style={{ color: theme.textStrong, flex: 1 }}>Require biometric unlock</Text>
          <Switch
            value={biometricEnabled} onValueChange={handleToggle}
            trackColor={{ false: theme.cardBorder, true: theme.teal.bar }} thumbColor="#fff"
          />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 },
  groupLabel: { fontSize: 9, fontWeight: "900", letterSpacing: 0.6, marginTop: 4, marginBottom: -4 },
  card: { borderRadius: 22, borderWidth: 2, padding: 16, gap: 8 },
  desc: { fontSize: 12, marginBottom: 4 },
});
