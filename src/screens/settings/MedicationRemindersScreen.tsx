import React, { useCallback, useState } from "react";
import {
  ScrollView,
  View,
  Text,
  Pressable,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme } from "../../theme/ThemeContext";
import { ShadowCard } from "../../components/ShadowCard";
import { toast } from "../../lib/toast";
import { api } from "../../api/client";
import { scheduleMedicationReminders } from "../../lib/smartNotifications";

const STORAGE_KEY = "med_reminders";

type MedReminders = Record<string, string[]>;

function isValidTime(t: string): boolean {
  return /^\d{1,2}:\d{2}$/.test(t) && (() => {
    const [h, m] = t.split(":").map(Number);
    return h >= 0 && h <= 23 && m >= 0 && m <= 59;
  })();
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function normalizeTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  return pad(h) + ":" + pad(m);
}

export function MedicationRemindersScreen() {
  const { theme } = useTheme();
  const [meds, setMeds] = useState<any[]>([]);
  const [reminders, setReminders] = useState<MedReminders>({});
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      async function load() {
        setLoading(true);
        try {
          const [medList, stored] = await Promise.all([
            api.getMedications().catch(() => []),
            AsyncStorage.getItem(STORAGE_KEY).catch(() => null),
          ]);
          if (cancelled) return;
          const activeMeds = Array.isArray(medList) ? medList.filter((m: any) => m.active !== false) : [];
          setMeds(activeMeds);
          setReminders(stored ? JSON.parse(stored) : {});
        } finally {
          if (!cancelled) setLoading(false);
        }
      }
      load();
      return () => { cancelled = true; };
    }, [])
  );

  function addTime(medId: string) {
    const raw = (inputs[medId] ?? "").trim();
    if (!raw) return;
    if (!isValidTime(raw)) {
      toast("Enter a valid time like 08:00 or 20:30", "error");
      return;
    }
    const normalized = normalizeTime(raw);
    setReminders((prev) => {
      const existing = prev[medId] ?? [];
      if (existing.includes(normalized)) return prev;
      return { ...prev, [medId]: [...existing, normalized].sort() };
    });
    setInputs((prev) => ({ ...prev, [medId]: "" }));
  }

  function removeTime(medId: string, time: string) {
    setReminders((prev) => ({
      ...prev,
      [medId]: (prev[medId] ?? []).filter((t) => t !== time),
    }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(reminders));
      await scheduleMedicationReminders(
        meds.map((m: any) => ({ id: m.id, name: m.name })),
        reminders
      );
      toast("Reminders saved!");
    } catch (e: any) {
      toast(e?.message ?? "Could not save reminders.", "error");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.page, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={theme.teal.bar} size="large" />
      </View>
    );
  }

  if (meds.length === 0) {
    return (
      <ScrollView style={{ backgroundColor: theme.page }} contentContainerStyle={styles.content}>
        <ShadowCard padding={20}>
          <View style={{ alignItems: "center", gap: 12 }}>
            <Ionicons name="medkit-outline" size={40} color={theme.teal.solid} />
            <Text style={{ color: theme.textStrong, fontSize: 16, fontWeight: "800", textAlign: "center" }}>
              No medications found
            </Text>
            <Text style={{ color: theme.textSoft, fontSize: 13, textAlign: "center" }}>
              Import medications from Settings → Health → Import Medications from CSV first.
            </Text>
          </View>
        </ShadowCard>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: theme.page }} contentContainerStyle={styles.content}>
      <Text style={{ color: theme.textSoft, fontSize: 13, marginBottom: 4 }}>
        Set daily reminder times for each medication. Times repeat every day.
      </Text>

      {meds.map((med: any) => {
        const times = reminders[med.id] ?? [];
        return (
          <ShadowCard key={med.id} padding={14}>
            <Text style={{ color: theme.textStrong, fontSize: 15, fontWeight: "800", marginBottom: 10 }}>
              {med.name}
              {med.dosage ? <Text style={{ color: theme.textSoft, fontWeight: "400" }}> · {med.dosage}</Text> : null}
            </Text>

            {/* Existing time slots */}
            {times.map((t) => (
              <View key={t} style={styles.timeRow}>
                <Ionicons name="alarm-outline" size={16} color={theme.teal.fg} />
                <Text style={{ color: theme.textStrong, fontSize: 15, fontWeight: "700", flex: 1, marginLeft: 8 }}>
                  {t}
                </Text>
                <Pressable onPress={() => removeTime(med.id, t)} hitSlop={8}>
                  <Ionicons name="close-circle-outline" size={20} color={theme.textSoft} />
                </Pressable>
              </View>
            ))}

            {/* Add a time */}
            <View style={styles.addRow}>
              <TextInput
                value={inputs[med.id] ?? ""}
                onChangeText={(v) => setInputs((prev) => ({ ...prev, [med.id]: v }))}
                placeholder="HH:MM"
                placeholderTextColor={theme.textSoft}
                keyboardType="numbers-and-punctuation"
                maxLength={5}
                style={[styles.timeInput, { color: theme.textStrong, borderColor: theme.ink, backgroundColor: theme.card }]}
              />
              <Pressable
                onPress={() => addTime(med.id)}
                style={[styles.addBtn, { backgroundColor: theme.teal.solid, borderColor: theme.ink }]}
              >
                <Ionicons name="add" size={18} color="#fff" />
                <Text style={{ color: "#fff", fontWeight: "800", fontSize: 12, marginLeft: 2 }}>ADD</Text>
              </Pressable>
            </View>
          </ShadowCard>
        );
      })}

      <Pressable
        onPress={handleSave}
        disabled={saving}
        style={[styles.saveBtn, { backgroundColor: theme.teal.solid, borderColor: theme.ink }]}
      >
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={{ color: "#fff", fontSize: 15, fontWeight: "900", letterSpacing: 0.4 }}>SAVE REMINDERS</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.06)",
  },
  addRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    marginTop: 10,
  },
  timeInput: {
    flex: 1,
    borderWidth: 2,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 15,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 2,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  saveBtn: {
    borderRadius: 22,
    borderWidth: 2,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
    shadowColor: "rgba(60,40,20,0.15)",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },
});
