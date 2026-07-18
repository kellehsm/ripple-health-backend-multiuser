import React from "react";
import { ScrollView, View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../theme/ThemeContext";

function IntegrationRow({
  label,
  subtitle,
  icon,
  status,
  onPress,
}: {
  label: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  status: "connected" | "disconnected" | "not_set_up";
  onPress?: () => void;
}) {
  const { theme } = useTheme();
  const statusColor =
    status === "connected" ? theme.teal.fg : theme.textSoft;
  const statusLabel =
    status === "connected"
      ? "Connected"
      : status === "disconnected"
      ? "Disconnected"
      : "Not set up";

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: theme.card,
          borderColor: theme.cardBorder,
          opacity: pressed ? 0.75 : 1,
        },
      ]}
    >
      <Ionicons name={icon} size={22} color={theme.textSoft} />
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, { color: theme.textStrong }]}>{label}</Text>
        <Text style={[styles.rowSub, { color: theme.textSoft }]}>{subtitle}</Text>
      </View>
      <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
      <Ionicons name="chevron-forward" size={14} color={theme.textSoft} />
    </Pressable>
  );
}

export function IntegrationsScreen() {
  const { theme } = useTheme();

  return (
    <ScrollView
      style={{ backgroundColor: theme.page }}
      contentContainerStyle={styles.content}
    >
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <Text style={[styles.sectionTitle, { color: theme.textStrong }]}>
          Connected services
        </Text>
        <Text style={[styles.note, { color: theme.textSoft }]}>
          Tap a service to configure or reconnect.
        </Text>
      </View>

      <IntegrationRow
        label="Dexcom"
        subtitle="Continuous glucose monitoring"
        icon="pulse-outline"
        status="not_set_up"
      />
      <IntegrationRow
        label="Health Connect"
        subtitle="Steps, sleep, heart rate"
        icon="fitness-outline"
        status="not_set_up"
      />
      <IntegrationRow
        label="Google Drive"
        subtitle="Automatic backups"
        icon="cloud-outline"
        status="not_set_up"
      />
      <IntegrationRow
        label="SimpleFIN"
        subtitle="Financial data sync"
        icon="wallet-outline"
        status="not_set_up"
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 10 },
  card: { borderRadius: 14, borderWidth: 0.5, padding: 16, gap: 8 },
  sectionTitle: { fontSize: 15, fontWeight: "600" },
  note: { fontSize: 13 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 0.5,
    padding: 14,
    gap: 12,
  },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 14, fontWeight: "500" },
  rowSub: { fontSize: 12, marginTop: 2 },
  statusText: { fontSize: 12, fontWeight: "500" },
});
