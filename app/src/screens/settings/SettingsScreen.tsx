import React from "react";
import { ScrollView, View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTheme } from "../../theme/ThemeContext";
import { RootStackParamList } from "../../navigation/types";

type Nav = NativeStackNavigationProp<RootStackParamList>;

type GroupConfig = {
  label: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  colorKey: "teal" | "blue" | "amber" | "pink" | "green" | "red";
  screen: keyof RootStackParamList;
};

const GROUPS: GroupConfig[] = [
  {
    label: "Account",
    subtitle: "Profile, login, delete account",
    icon: "person-outline",
    colorKey: "blue",
    screen: "SettingsAccount",
  },
  {
    label: "Appearance",
    subtitle: "Theme, colors",
    icon: "color-palette-outline",
    colorKey: "teal",
    screen: "SettingsAppearance",
  },
  {
    label: "Notifications",
    subtitle: "Check-in timing, reminder types",
    icon: "notifications-outline",
    colorKey: "amber",
    screen: "SettingsNotifications",
  },
  {
    label: "Integrations",
    subtitle: "Dexcom, Health Connect, Google Drive",
    icon: "link-outline",
    colorKey: "pink",
    screen: "SettingsIntegrations",
  },
  {
    label: "Data & Backup",
    subtitle: "Backup, export, week-start day",
    icon: "server-outline",
    colorKey: "green",
    screen: "SettingsDataBackup",
  },
  {
    label: "Privacy & Security",
    subtitle: "Biometric lock",
    icon: "shield-outline",
    colorKey: "red",
    screen: "SettingsPrivacySecurity",
  },
  {
    label: "Help & About",
    subtitle: "FAQ, version, changelog",
    icon: "information-circle-outline",
    colorKey: "teal",
    screen: "SettingsHelpAbout",
  },
];

export function SettingsScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();

  return (
    <ScrollView
      style={{ backgroundColor: theme.page }}
      contentContainerStyle={styles.content}
    >
      {GROUPS.map((g, i) => {
        const c = theme[g.colorKey];
        return (
          <Pressable
            key={g.screen}
            onPress={() => navigation.navigate(g.screen as any)}
            style={({ pressed }) => [
              styles.row,
              {
                backgroundColor: theme.card,
                borderColor: theme.cardBorder,
                opacity: pressed ? 0.75 : 1,
              },
            ]}
          >
            <View style={[styles.iconWrap, { backgroundColor: c.bg }]}>
              <Ionicons name={g.icon} size={20} color={c.fg} />
            </View>
            <View style={styles.rowText}>
              <Text style={[styles.rowLabel, { color: theme.textStrong }]}>{g.label}</Text>
              <Text style={[styles.rowSubtitle, { color: theme.textSoft }]} numberOfLines={1}>
                {g.subtitle}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={theme.textSoft} />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 10 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 0.5,
    padding: 14,
    gap: 14,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 15, fontWeight: "600" },
  rowSubtitle: { fontSize: 12, marginTop: 2 },
});
