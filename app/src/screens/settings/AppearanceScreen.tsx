import React from "react";
import { ScrollView, View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../theme/ThemeContext";
import { useCardBg } from "../../theme/AppSettingsContext";
import { fonts } from "../../theme/typography";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../navigation/types";

export function AppearanceScreen() {
  const { theme, mode, toggle } = useTheme();
  const cardBg = useCardBg();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <ScrollView
      style={{ backgroundColor: theme.page }}
      contentContainerStyle={styles.content}
    >
      <View style={[styles.card, { backgroundColor: cardBg, borderColor: theme.cardBorder }]}>
        <Text style={[styles.sectionTitle, { color: theme.textStrong }]}>Color mode</Text>

        {(["light", "dark"] as const).map((m) => (
          <Pressable
            key={m}
            onPress={() => { if (mode !== m) toggle(); }}
            style={[
              styles.modeRow,
              {
                borderColor: mode === m ? theme.teal.bar : theme.cardBorder,
                backgroundColor: mode === m ? theme.teal.bg : "transparent",
              },
            ]}
          >
            <Ionicons
              name={m === "light" ? "sunny" : "moon"}
              size={20}
              color={mode === m ? theme.teal.fg : theme.textSoft}
            />
            <Text
              style={[
                styles.modeLabel,
                { color: mode === m ? theme.teal.fg : theme.textStrong },
              ]}
            >
              {m === "light" ? "Light" : "Dark"}
            </Text>
            {mode === m && (
              <Ionicons name="checkmark" size={18} color={theme.teal.bar} style={{ marginLeft: "auto" }} />
            )}
          </Pressable>
        ))}
      </View>

      <View style={[styles.card, { backgroundColor: cardBg, borderColor: theme.cardBorder }]}>
        <Text style={[styles.sectionTitle, { color: theme.textStrong }]}>Accent themes</Text>
        <Text style={[styles.comingSoon, { color: theme.textSoft }]}>
          Additional accent colour themes coming soon.
        </Text>
      </View>

      <View style={[styles.card, { backgroundColor: cardBg, borderColor: theme.cardBorder }]}>
        <Text style={[styles.sectionTitle, { color: theme.textStrong }]}>Backgrounds & Transparency</Text>
        <Pressable
          style={[styles.modeRow, { borderColor: theme.cardBorder }]}
          onPress={() => navigation.navigate("SettingsCustomizeBackgrounds")}
        >
          <Ionicons name="image-outline" size={20} color={theme.textSoft} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.modeLabel, { color: theme.textStrong }]}>Customize backgrounds</Text>
            <Text style={{ fontSize: 12, color: theme.textSoft, fontFamily: fonts.regular }}>
              Set images and transparency for pages, cards, and tiles
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={theme.textSoft} />
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 14 },
  card: { borderRadius: 14, borderWidth: 0.5, padding: 16, gap: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 3 },
  sectionTitle: { fontSize: 15, fontWeight: "600", fontFamily: fonts.semiBold },
  modeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    padding: 14,
  },
  modeLabel: { fontSize: 15, fontWeight: "500", fontFamily: fonts.medium },
  comingSoon: { fontSize: 13, fontFamily: fonts.regular },
});
