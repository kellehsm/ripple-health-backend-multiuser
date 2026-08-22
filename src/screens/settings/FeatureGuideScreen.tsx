import React, { useState } from "react";
import { ScrollView, View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ScreenBackground } from "../../components/ScreenBackground";
import { FeatureIntroSheet } from "../../components/FeatureIntroSheet";
import { useTheme } from "../../theme/ThemeContext";
import { FEATURE_INTROS, type FeatureIntro } from "../../onboarding/featureIntros";
import { resetAllFeatureIntros } from "../../onboarding/useFeatureIntro";
import { toast } from "../../lib/toast";

export function FeatureGuideScreen() {
  const { theme } = useTheme();
  const [openIntro, setOpenIntro] = useState<FeatureIntro | null>(null);

  return (
    <View style={{ flex: 1, backgroundColor: theme.page }}>
      <ScreenBackground pageId="settings" />
      <ScrollView style={{ flex: 1, backgroundColor: "transparent" }} contentContainerStyle={styles.content}>
        <Text style={[styles.groupLabel, { color: theme.textSoft }]}>FEATURE TOURS</Text>
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          {FEATURE_INTROS.map((f, i, arr) => (
            <React.Fragment key={f.key}>
              <Pressable onPress={() => setOpenIntro(f)} style={[styles.row, { borderColor: theme.cardBorder }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.textStrong, fontSize: 15, fontWeight: "600" }}>
                    {f.cards[0].emoji}{"  "}{f.name}
                  </Text>
                  <Text style={{ color: theme.textSoft, fontSize: 12, marginTop: 2 }}>{f.cards[0].title}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.textSoft} />
              </Pressable>
              {i < arr.length - 1 && <View style={[styles.divider, { backgroundColor: theme.cardBorder }]} />}
            </React.Fragment>
          ))}
          <View style={[styles.divider, { backgroundColor: theme.cardBorder }]} />
          <Pressable
            onPress={() => void resetAllFeatureIntros().then(() => toast("Feature intros reset"))}
            style={[styles.row, { borderColor: theme.cardBorder }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.textStrong, fontSize: 15, fontWeight: "600" }}>Show all intros again</Text>
              <Text style={{ color: theme.textSoft, fontSize: 12, marginTop: 2 }}>
                Every feature intro will re-appear on next visit
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.textSoft} />
          </Pressable>
        </View>
      </ScrollView>
      {openIntro && (
        <FeatureIntroSheet intro={openIntro} visible={true} onClose={() => setOpenIntro(null)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  groupLabel: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.6,
    marginTop: 4,
    marginBottom: -4,
    textTransform: "uppercase",
  },
  card: {
    borderRadius: 26,
    borderWidth: 2,
    overflow: "hidden",
    shadowColor: "rgba(60,40,20,0.1)",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  divider: { height: 1, marginHorizontal: 16 },
});
