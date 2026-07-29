import React, { useState } from "react";
import { ScrollView, View, Text, StyleSheet, Switch } from "react-native";
import { useTheme } from "../../theme/ThemeContext";
import { useCardBg } from "../../theme/AppSettingsContext";
import { fonts } from "../../theme/typography";

export function PrivacySecurityScreen() {
  const { theme } = useTheme();
  const cardBg = useCardBg();
  const [biometric, setBiometric] = useState(false);

  return (
    <ScrollView
      style={{ backgroundColor: theme.page }}
      contentContainerStyle={styles.content}
    >
      <View style={[styles.card, { backgroundColor: cardBg, borderColor: theme.cardBorder }]}>
        <Text style={[styles.sectionTitle, { color: theme.textStrong }]}>App lock</Text>

        <View style={styles.switchRow}>
          <View style={styles.switchText}>
            <Text style={[styles.switchLabel, { color: theme.textStrong }]}>
              Biometric lock
            </Text>
            <Text style={[styles.switchSub, { color: theme.textSoft }]}>
              Require fingerprint or Face ID to open the app
            </Text>
          </View>
          <Switch
            value={biometric}
            onValueChange={setBiometric}
            trackColor={{ true: theme.teal.bar }}
          />
        </View>

        {biometric && (
          <Text style={[styles.note, { color: theme.amber.fg }]}>
            Biometric lock coming in a future update — saved but not yet active.
          </Text>
        )}
      </View>

      <View style={[styles.card, { backgroundColor: cardBg, borderColor: theme.cardBorder }]}>
        <Text style={[styles.sectionTitle, { color: theme.textStrong }]}>Data privacy</Text>
        <Text style={[styles.note, { color: theme.textSoft }]}>
          All your data is stored on your own server. Nothing is shared with third
          parties except connected integrations you explicitly enable.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 14 },
  card: { borderRadius: 14, borderWidth: 0.5, padding: 16, gap: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 3 },
  sectionTitle: { fontSize: 15, fontWeight: "600", fontFamily: fonts.semiBold },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  switchText: { flex: 1, paddingRight: 8 },
  switchLabel: { fontSize: 14, fontWeight: "500", fontFamily: fonts.medium },
  switchSub: { fontSize: 12, marginTop: 2, lineHeight: 18, fontFamily: fonts.regular },
  note: { fontSize: 13, lineHeight: 18, fontFamily: fonts.regular },
});
