import React from "react";
import { Modal, View, Text, Pressable, Switch, ScrollView, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import type { TileKey, TileConfig } from "../hooks/useHealthTileConfig";

interface Props {
  visible: boolean;
  config: TileConfig;
  onToggle: (key: TileKey, value: boolean) => void;
  onClose: () => void;
}

function SectionHeader({ label }: { label: string }) {
  const { theme } = useTheme();
  return (
    <Text style={[styles.sectionHeader, { color: theme.textSoft }]}>{label}</Text>
  );
}

function TileRow({ label, tileKey, config, onToggle }: {
  label: string;
  tileKey: TileKey;
  config: TileConfig;
  onToggle: (key: TileKey, value: boolean) => void;
}) {
  const { theme } = useTheme();
  return (
    <View style={[styles.row, { borderBottomColor: theme.cardBorder }]}>
      <Text style={[styles.rowLabel, { color: theme.textStrong }]}>{label}</Text>
      <Switch
        value={config[tileKey]}
        onValueChange={(val) => onToggle(tileKey, val)}
        trackColor={{ false: theme.cardBorder, true: theme.teal.solid }}
        thumbColor="#fff"
      />
    </View>
  );
}

export function HealthTileConfigModal({ visible, config, onToggle, onClose }: Props) {
  const { theme } = useTheme();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
          onPress={() => {}}
          accessibilityViewIsModal={true}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.textStrong }]}>Customize Tiles</Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={theme.textSoft} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <SectionHeader label="CHIPS" />
            <TileRow label="Mindfulness" tileKey="mindfulness" config={config} onToggle={onToggle} />
            <TileRow label="Glucose" tileKey="glucose" config={config} onToggle={onToggle} />
            <TileRow label="Steps" tileKey="steps" config={config} onToggle={onToggle} />
            <TileRow label="Sleep" tileKey="sleep" config={config} onToggle={onToggle} />
            <TileRow label="Water" tileKey="water" config={config} onToggle={onToggle} />
            <TileRow label="Heart Rate" tileKey="heart" config={config} onToggle={onToggle} />

            <SectionHeader label="DETAIL CARDS" />
            <TileRow label="Sleep Detail" tileKey="sleep_card" config={config} onToggle={onToggle} />
            <TileRow label="Glucose Chart" tileKey="glucose_chart" config={config} onToggle={onToggle} />
            <TileRow label="Heart Rate Chart" tileKey="heart_chart" config={config} onToggle={onToggle} />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    padding: 20,
    paddingBottom: 34,
    maxHeight: "70%",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  title: { fontSize: 17, fontWeight: "800" },
  sectionHeader: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
    marginTop: 12,
    marginBottom: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLabel: { fontSize: 15, fontWeight: "600" },
});
