import React, { useEffect, useState } from "react";
import { ScrollView, View, Text, Pressable, StyleSheet, TextInput } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTheme } from "../../theme/ThemeContext";
import { api } from "../../api/client";

const WEEK_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function PreferencesSettingsScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<any>();
  const [weekStart, setWeekStartState] = useState<Record<string, number>>({});
  const [birthdate, setBirthdate] = useState('');
  const [birthdateSaving, setBirthdateSaving] = useState(false);
  const [birthdateSaved, setBirthdateSaved] = useState(false);

  useEffect(() => {
    api.getSettings().then((s) => {
      setWeekStartState(s?.week_start ?? {});
      setBirthdate(s?.profile?.birthdate ?? '');
    }).catch(() => {});
  }, []);

  async function saveBirthdate() {
    const trimmed = birthdate.trim();
    if (!trimmed) return;
    setBirthdateSaving(true);
    try {
      await api.patchSettings({ profile: { birthdate: trimmed } });
      setBirthdateSaved(true);
      setTimeout(() => setBirthdateSaved(false), 2000);
    } catch {} finally {
      setBirthdateSaving(false);
    }
  }

  async function setWeekStart(section: string, dayIndex: number) {
    const updated = { week_start: { ...weekStart, [section]: dayIndex } };
    setWeekStartState((prev) => ({ ...prev, [section]: dayIndex }));
    await api.patchSettings(updated).catch(() => {});
  }

  return (
    <ScrollView style={{ backgroundColor: theme.page }} contentContainerStyle={styles.content}>

      <Text style={[styles.groupLabel, { color: theme.textSoft }]}>PROFILE</Text>
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <Text style={[styles.desc, { color: theme.textSoft }]}>
          Used to calculate heart rate zones during exercise sessions (Tanaka formula).
        </Text>
        <Text style={[{ color: theme.textStrong, fontSize: 12, fontWeight: '700', marginBottom: 4 }]}>
          Date of birth
        </Text>
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <TextInput
            style={[styles.birthdateInput, { backgroundColor: theme.page, borderColor: theme.ink, color: theme.textStrong }]}
            value={birthdate}
            onChangeText={setBirthdate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={theme.textSoft}
            keyboardType="numbers-and-punctuation"
            maxLength={10}
            onSubmitEditing={saveBirthdate}
          />
          <Pressable
            onPress={saveBirthdate}
            disabled={birthdateSaving}
            style={[styles.btn, { backgroundColor: birthdateSaved ? theme.teal.solid : theme.teal.tint, borderColor: theme.teal.solid, flex: 0, paddingHorizontal: 16 }]}
          >
            <Text style={{ color: birthdateSaved ? '#fff' : theme.teal.fg, fontWeight: '700', fontSize: 13 }}>
              {birthdateSaved ? 'Saved ✓' : birthdateSaving ? '…' : 'Save'}
            </Text>
          </Pressable>
        </View>
      </View>

      <Text style={[styles.groupLabel, { color: theme.textSoft }]}>HOME SCREEN</Text>
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <Text style={[styles.desc, { color: theme.textSoft }]}>Reorder or hide cards on your Home screen.</Text>
        <Pressable
          onPress={() => navigation.navigate("CustomizeDashboard")}
          style={[styles.btn, { backgroundColor: theme.teal.tint, borderColor: theme.teal.solid }]}
        >
          <Text style={{ color: theme.teal.fg, fontWeight: "700" }}>Open customizer →</Text>
        </Pressable>
      </View>

      <Text style={[styles.groupLabel, { color: theme.textSoft }]}>WEEK START DAY</Text>
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <Text style={[styles.desc, { color: theme.textSoft }]}>
          Controls the "this week" calculation for each section.
        </Text>
        {(["water", "sleep", "steps", "hobbies"] as const).map((section) => {
          const current = (weekStart as any)[section] ?? 1;
          return (
            <View key={section} style={{ gap: 6, marginTop: 8 }}>
              <Text style={{ color: theme.textStrong, fontSize: 13 }}>
                {section.charAt(0).toUpperCase() + section.slice(1)}
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: "row", gap: 6 }}>
                  {WEEK_DAYS.map((day, i) => (
                    <Pressable
                      key={day}
                      onPress={() => { Haptics.selectionAsync(); setWeekStart(section, i); }}
                      style={[styles.chip, { backgroundColor: current === i ? theme.teal.bar : theme.page, borderColor: theme.ink }]}
                    >
                      {current === i ? (
                        <View style={{ flexDirection: "row", gap: 3, alignItems: "center" }}>
                          <Ionicons name="checkmark" size={11} color="#fff" />
                          <Text style={{ color: "#fff", fontSize: 12 }}>{day.slice(0, 3)}</Text>
                        </View>
                      ) : (
                        <Text style={{ color: theme.textSoft, fontSize: 12 }}>{day.slice(0, 3)}</Text>
                      )}
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  groupLabel: { fontSize: 9, fontWeight: "900", letterSpacing: 0.6, marginTop: 4, marginBottom: -4 },
  card: { borderRadius: 22, borderWidth: 2, padding: 16, gap: 8 },
  desc: { fontSize: 12, marginBottom: 4 },
  btn: { borderWidth: 2, borderRadius: 16, paddingVertical: 10, alignItems: "center", marginTop: 4 },
  birthdateInput: { flex: 1, borderWidth: 2, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  chip: { borderWidth: 2, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 },
});
