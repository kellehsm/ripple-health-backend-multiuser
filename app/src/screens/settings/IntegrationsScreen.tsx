import React, { useCallback, useState } from "react";
import { ScrollView, View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/core";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTheme } from "../../theme/ThemeContext";
import { useCardBg } from "../../theme/AppSettingsContext";
import { fonts } from "../../theme/typography";
import { RootStackParamList } from "../../navigation/types";
import { api } from "../../api/client";

type Nav = NativeStackNavigationProp<RootStackParamList>;

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
  const cardBg = useCardBg();
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
          backgroundColor: cardBg,
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
      {onPress && <Ionicons name="chevron-forward" size={14} color={theme.textSoft} />}
    </Pressable>
  );
}

export function IntegrationsScreen() {
  const { theme } = useTheme();
  const cardBg = useCardBg();
  const navigation = useNavigation<Nav>();
  const [hardcoverConnected, setHardcoverConnected] = useState(false);

  useFocusEffect(useCallback(() => {
    api.hardcoverStatus()
      .then((s) => setHardcoverConnected(s.connected))
      .catch(() => {});
  }, []));

  return (
    <ScrollView
      style={{ backgroundColor: theme.page }}
      contentContainerStyle={styles.content}
    >
      <View style={[styles.card, { backgroundColor: cardBg, borderColor: theme.cardBorder }]}>
        <Text style={[styles.sectionTitle, { color: theme.textStrong }]}>
          Connected services
        </Text>
        <Text style={[styles.note, { color: theme.textSoft }]}>
          Tap a service to configure or reconnect. All integrations are optional.
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
      <IntegrationRow
        label="Hardcover"
        subtitle="Reading progress sync · optional"
        icon="book-outline"
        status={hardcoverConnected ? "connected" : "not_set_up"}
        onPress={() => navigation.navigate("SettingsHardcover")}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 10 },
  card: { borderRadius: 14, borderWidth: 0.5, padding: 16, gap: 8, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 3 },
  sectionTitle: { fontSize: 15, fontWeight: "600", fontFamily: fonts.semiBold },
  note: { fontSize: 13, fontFamily: fonts.regular },
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 0.5,
    padding: 14,
    gap: 12,
  },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 14, fontWeight: "500", fontFamily: fonts.medium },
  rowSub: { fontSize: 12, marginTop: 2, fontFamily: fonts.regular },
  statusText: { fontSize: 12, fontWeight: "500", fontFamily: fonts.medium },
});
