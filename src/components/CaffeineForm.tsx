import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
} from "react-native";
import { onSolid } from "../theme/colorUtils";
import type { SubstancePending } from "../types/substances";

export function CaffeineForm({
  initial,
  onSave,
  onCancel,
  theme,
}: {
  initial: SubstancePending;
  onSave: (v: SubstancePending) => void;
  onCancel: () => void;
  theme: any;
}) {
  const ink = theme.ink;
  const card = theme.card;
  const styles = useMemo(() => makeStyles(ink, card, theme.cardBorder), [ink, card, theme.cardBorder]);
  const [name, setName] = useState(initial.name);
  const [mg, setMg] = useState(initial.caffeine_mg != null ? String(initial.caffeine_mg) : "");
  const [nameErr, setNameErr] = useState("");
  const [mgErr, setMgErr] = useState("");

  function handleSave() {
    let valid = true;
    if (!name.trim()) { setNameErr("Drink name is required."); valid = false; } else setNameErr("");
    const parsed = parseFloat(mg);
    if (!mg.trim() || isNaN(parsed) || parsed <= 0) { setMgErr("Enter caffeine amount in mg (e.g. 95)."); valid = false; } else setMgErr("");
    if (!valid) return;
    if (parsed > 1000) {
      Alert.alert(
        "Does this look right?",
        `${parsed} mg caffeine is quite a lot for one drink — just checking it's not a typo.`,
        [
          { text: "Let me fix it", style: "cancel" },
          { text: "Yes, save it", onPress: () => onSave({ ...initial, name: name.trim(), caffeine_mg: parsed }) },
        ]
      );
      return;
    }
    onSave({ ...initial, name: name.trim(), caffeine_mg: parsed });
  }

  return (
    <View style={styles.editForm}>
      <TextInput
        value={name}
        onChangeText={v => { setName(v); setNameErr(""); }}
        placeholder="Drink name"
        placeholderTextColor={theme.textSoft}
        style={[styles.textInput, { color: theme.textStrong, borderColor: nameErr ? theme.coral.solid : ink }]}
      />
      {nameErr ? <Text style={{ color: theme.coral.solid, fontSize: 11, marginTop: -4 }}>{nameErr}</Text> : null}
      <View style={styles.macroInputRow}>
        <TextInput
          value={mg}
          onChangeText={v => { setMg(v); setMgErr(""); }}
          placeholder="mg"
          placeholderTextColor={theme.textSoft}
          keyboardType="decimal-pad"
          style={[styles.macroInput, { color: theme.textStrong, flex: 1, borderColor: mgErr ? theme.coral.solid : ink }]}
        />
      </View>
      {mgErr ? <Text style={{ color: theme.coral.solid, fontSize: 11, marginTop: -4 }}>{mgErr}</Text> : null}
      <View style={styles.macroInputRow}>
        <Text style={[styles.macroLabel, { color: ink }]}>CAFFEINE (mg)</Text>
      </View>
      {initial.source_db === "usda" || initial.source_db === "openfoodfacts" ? (
        <Text style={{ color: theme.textSoft, fontSize: 11 }}>
          Value is per 100g — adjust for your actual serving.
        </Text>
      ) : null}
      <View style={styles.editFormButtons}>
        <Pressable onPress={onCancel} style={styles.cancelBtn}>
          <Text style={styles.cancelBtnText}>CANCEL</Text>
        </Pressable>
        <Pressable onPress={handleSave} style={[styles.actionBtn, { backgroundColor: theme.coral.sub, flex: 1 }]}>
          <Text style={[styles.actionBtnText, { color: onSolid(theme.coral.sub) }]}>LOG IT</Text>
        </Pressable>
      </View>
    </View>
  );
}

function makeStyles(ink: string, card: string, _border: string) {
  return StyleSheet.create({
    editForm: { marginTop: 12, gap: 8 },
    macroInputRow: { flexDirection: "row", gap: 6 },
    macroInput: {
      flex: 1,
      borderWidth: 2,
      borderColor: ink,
      borderRadius: 16,
      paddingHorizontal: 8,
      paddingVertical: 8,
      fontSize: 12,
      backgroundColor: card,
      shadowColor: "rgba(60,40,20,0.1)",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.08,
      shadowRadius: 10,
      elevation: 2,
    },
    macroLabel: { flex: 1, fontSize: 9, fontWeight: "800", letterSpacing: 0.6, textAlign: "center" },
    editFormButtons: { flexDirection: "row", gap: 8 },
    cancelBtn: {
      borderWidth: 2,
      borderColor: ink,
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 9,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: card,
      shadowColor: "rgba(60,40,20,0.1)",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.08,
      shadowRadius: 10,
      elevation: 2,
    },
    cancelBtnText: { color: ink, fontWeight: "800", fontSize: 11, letterSpacing: 0.4 },
    textInput: {
      borderWidth: 2,
      borderColor: ink,
      borderRadius: 16,
      paddingHorizontal: 10,
      paddingVertical: 10,
      backgroundColor: card,
      fontSize: 14,
      shadowColor: "rgba(60,40,20,0.1)",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.08,
      shadowRadius: 10,
      elevation: 2,
    },
    actionBtn: {
      borderRadius: 16,
      borderWidth: 2,
      borderColor: ink,
      paddingHorizontal: 14,
      paddingVertical: 10,
      alignItems: "center",
      justifyContent: "center",
      minWidth: 72,
      shadowColor: "rgba(60,40,20,0.1)",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.08,
      shadowRadius: 10,
      elevation: 2,
    },
    actionBtnText: { fontWeight: "800", fontSize: 11, letterSpacing: 0.4 },
  });
}
