import React, { useState } from "react";
import { ScrollView, View, Text, Pressable, StyleSheet, Switch } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../theme/ThemeContext";

type WeekStart = "monday" | "sunday";

export function DataBackupScreen() {
  const { theme } = useTheme();
  const [driveBackup, setDriveBackup] = useState(false);
  const [weekStart, setWeekStart] = useState<WeekStart>("monday");

  return (
    <ScrollView
      style={{ backgroundColor: theme.page }}
      contentContainerStyle={styles.content}
    >
      {/* Google Drive backup */}
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <Text style={[styles.sectionTitle, { color: theme.textStrong }]}>Google Drive backup</Text>

        <View style={styles.switchRow}>
          <View style={styles.switchText}>
            <Text style={[styles.switchLabel, { color: theme.textStrong }]}>
              Automatic backups
            </Text>
            <Text style={[styles.switchSub, { color: theme.textSoft }]}>
              Backs up daily at 2 AM
            </Text>
          </View>
          <Switch
            value={driveBackup}
            onValueChange={setDriveBackup}
            trackColor={{ true: theme.teal.bar }}
          />
        </View>

        {driveBackup && (
          <>
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: theme.textSoft }]}>Last backup</Text>
              <Text style={[styles.infoValue, { color: theme.textStrong }]}>Never</Text>
            </View>
            <Pressable
              style={[styles.btn, { backgroundColor: theme.teal.bg }]}
            >
              <Ionicons name="cloud-upload-outline" size={16} color={theme.teal.fg} />
              <Text style={[styles.btnText, { color: theme.teal.fg }]}>Back up now</Text>
            </Pressable>
          </>
        )}

        <Pressable style={[styles.btn, { backgroundColor: theme.green.bg }]}>
          <Ionicons name="download-outline" size={16} color={theme.green.fg} />
          <Text style={[styles.btnText, { color: theme.green.fg }]}>Restore from backup</Text>
        </Pressable>
      </View>

      {/* Export */}
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <Text style={[styles.sectionTitle, { color: theme.textStrong }]}>Export data</Text>
        <Text style={[styles.note, { color: theme.textSoft }]}>
          Download all your data as a JSON file.
        </Text>
        <Pressable style={[styles.btn, { backgroundColor: theme.blue.bg }]}>
          <Ionicons name="document-outline" size={16} color={theme.blue.fg} />
          <Text style={[styles.btnText, { color: theme.blue.fg }]}>Export all data</Text>
        </Pressable>
      </View>

      {/* Week start */}
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <Text style={[styles.sectionTitle, { color: theme.textStrong }]}>Week starts on</Text>
        <View style={styles.weekRow}>
          {(["monday", "sunday"] as WeekStart[]).map((day) => (
            <Pressable
              key={day}
              onPress={() => setWeekStart(day)}
              style={[
                styles.weekOption,
                {
                  borderColor: weekStart === day ? theme.teal.bar : theme.cardBorder,
                  backgroundColor: weekStart === day ? theme.teal.bg : "transparent",
                  flex: 1,
                },
              ]}
            >
              <Text
                style={[
                  styles.weekOptionText,
                  { color: weekStart === day ? theme.teal.fg : theme.textStrong },
                ]}
              >
                {day.charAt(0).toUpperCase() + day.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 14 },
  card: { borderRadius: 14, borderWidth: 0.5, padding: 16, gap: 12 },
  sectionTitle: { fontSize: 15, fontWeight: "600" },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  switchText: { flex: 1, paddingRight: 8 },
  switchLabel: { fontSize: 14, fontWeight: "500" },
  switchSub: { fontSize: 12, marginTop: 2 },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  infoLabel: { fontSize: 14 },
  infoValue: { fontSize: 14, fontWeight: "500" },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 10,
    paddingVertical: 11,
  },
  btnText: { fontSize: 14, fontWeight: "500" },
  note: { fontSize: 13 },
  weekRow: { flexDirection: "row", gap: 10 },
  weekOption: {
    borderRadius: 10,
    borderWidth: 1.5,
    paddingVertical: 10,
    alignItems: "center",
  },
  weekOptionText: { fontSize: 14, fontWeight: "500" },
});
