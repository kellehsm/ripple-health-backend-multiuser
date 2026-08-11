import React, { useEffect, useState } from "react";
import { Modal, View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { ChangelogEntry, pendingChangelog, markChangelogSeen } from "../lib/whatsNew";

export function WhatsNewModal() {
  const { theme } = useTheme();
  const [entry, setEntry] = useState<ChangelogEntry | null>(null);

  useEffect(() => {
    pendingChangelog().then((e) => setEntry(e)).catch(() => {});
  }, []);

  async function close() {
    await markChangelogSeen();
    setEntry(null);
  }

  if (!entry) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <View style={[styles.badge, { backgroundColor: theme.teal.tint, borderColor: theme.teal.solid }]}>
              <Text style={{ color: theme.teal.fg, fontSize: 10, fontWeight: "900", letterSpacing: 1.2 }}>WHAT'S NEW</Text>
            </View>
            <Text style={{ color: theme.textSoft, fontSize: 11, fontWeight: "700" }}>v{entry.version}</Text>
          </View>
          <Text style={[styles.headline, { color: theme.textStrong }]}>{entry.headline}</Text>
          <ScrollView style={{ maxHeight: 340 }} contentContainerStyle={{ gap: 10, paddingVertical: 6 }}>
            {entry.bullets.map((b, i) => (
              <View key={i} style={{ flexDirection: "row", gap: 8 }}>
                <Ionicons name="ellipse" size={6} color={theme.teal.solid} style={{ marginTop: 6 }} />
                <Text style={{ color: theme.textStrong, fontSize: 14, flex: 1, lineHeight: 20 }}>{b}</Text>
              </View>
            ))}
          </ScrollView>
          <Pressable
            onPress={close}
            style={[styles.button, { backgroundColor: theme.teal.solid, borderColor: theme.ink }]}
            accessibilityRole="button"
            accessibilityLabel="Dismiss what's new"
          >
            <Text style={{ color: "#fff", fontWeight: "900", fontSize: 14, letterSpacing: 0.5 }}>Got it</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 24 },
  card: { borderWidth: 2, borderRadius: 22, padding: 20, gap: 4 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1.5 },
  headline: { fontSize: 18, fontWeight: "900", marginBottom: 8 },
  button: {
    marginTop: 12,
    borderWidth: 2,
    borderRadius: 14,
    paddingVertical: 10,
    alignItems: "center",
  },
});
