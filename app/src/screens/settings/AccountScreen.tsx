import React, { useState } from "react";
import {
  ScrollView,
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme } from "../../theme/ThemeContext";

const ONBOARDING_KEY = "ripple:onboarding_complete";

export function AccountScreen() {
  const { theme } = useTheme();
  const [loggingOut, setLoggingOut] = useState(false);

  function handleLogOut() {
    Alert.alert("Log out", "Log out of your account?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log out",
        style: "destructive",
        onPress: async () => {
          setLoggingOut(true);
          await AsyncStorage.removeItem(ONBOARDING_KEY);
          // Token/session clearing will go here once auth is fully wired
          setLoggingOut(false);
        },
      },
    ]);
  }

  function handleDeleteAccount() {
    Alert.alert(
      "Delete account",
      "This permanently deletes your account and all data. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => {} },
      ]
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: theme.page }}
      contentContainerStyle={styles.content}
    >
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <Text style={[styles.sectionTitle, { color: theme.textStrong }]}>Profile</Text>
        <View style={styles.infoRow}>
          <Text style={[styles.infoLabel, { color: theme.textSoft }]}>Name</Text>
          <Text style={[styles.infoValue, { color: theme.textStrong }]}>Kelly</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={[styles.infoLabel, { color: theme.textSoft }]}>Email</Text>
          <Text style={[styles.infoValue, { color: theme.textStrong }]}>kjsmyre@gmail.com</Text>
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <Text style={[styles.sectionTitle, { color: theme.textStrong }]}>Account actions</Text>
        <Pressable
          onPress={handleLogOut}
          style={[styles.actionBtn, { borderColor: theme.cardBorder }]}
        >
          <Text style={[styles.actionBtnText, { color: theme.textStrong }]}>Log out</Text>
        </Pressable>
        <Pressable
          onPress={handleDeleteAccount}
          style={[styles.actionBtn, { borderColor: theme.red.sub }]}
        >
          <Text style={[styles.actionBtnText, { color: theme.red.sub }]}>Delete account</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 14 },
  card: { borderRadius: 14, borderWidth: 0.5, padding: 16, gap: 12 },
  sectionTitle: { fontSize: 15, fontWeight: "600" },
  infoRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  infoLabel: { fontSize: 14 },
  infoValue: { fontSize: 14, fontWeight: "500" },
  actionBtn: { borderRadius: 10, borderWidth: 1, padding: 14, alignItems: "center" },
  actionBtnText: { fontSize: 15, fontWeight: "500" },
});
