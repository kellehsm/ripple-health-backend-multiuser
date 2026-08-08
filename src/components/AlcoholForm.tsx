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

export function AlcoholForm({
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
  const [abv, setAbv] = useState(initial.abv_percent != null ? String(initial.abv_percent) : "");
  const [vol, setVol] = useState(initial.volume_ml != null ? String(initial.volume_ml) : "");
  const [nameErr, setNameErr] = useState("");
  const [abvErr, setAbvErr] = useState("");
  const [volErr, setVolErr] = useState("");

  function handleSave() {
    let valid = true;
    if (!name.trim()) { setNameErr("Drink name is required."); valid = false; } else setNameErr("");
    const pAbv = parseFloat(abv);
    const pVol = parseFloat(vol);
    if (!abv.trim() || isNaN(pAbv) || pAbv <= 0) { setAbvErr("Enter the ABV % (e.g. 5)."); valid = false; } else setAbvErr("");
    if (!vol.trim() || isNaN(pVol) || pVol <= 0) { setVolErr("Enter the volume in mL (e.g. 355)."); valid = false; } else setVolErr("");
    if (!valid) return;
    const unusual: string[] = [];
    if (pAbv > 96) unusual.push(`${pAbv}% ABV`);
    if (pVol > 2000) unusual.push(`${pVol} mL`);
    if (unusual.length > 0) {
      Alert.alert(
        "Does this look right?",
        `${unusual.join(", ")} seems unusual for one drink — just checking it's not a typo.`,
        [
          { text: "Let me fix it", style: "cancel" },
          { text: "Yes, save it", onPress: () => onSave({ ...initial, name: name.trim(), abv_percent: pAbv, volume_ml: pVol }) },
        ]
      );
      return;
    }
    onSave({ ...initial, name: name.trim(), abv_percent: pAbv, volume_ml: pVol });
  }

  // Show computed standard drinks as live preview
  const previewDrinks =
    abv && vol && !isNaN(parseFloat(abv)) && !isNaN(parseFloat(vol))
      ? Math.round(((parseFloat(abv) / 100) * parseFloat(vol) * 0.789) / 14 * 10) / 10
      : null;

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
          value={abv}
          onChangeText={v => { setAbv(v); setAbvErr(""); }}
          placeholder="%"
          placeholderTextColor={theme.textSoft}
          keyboardType="decimal-pad"
          style={[styles.macroInput, { color: theme.textStrong, borderColor: abvErr ? theme.coral.solid : ink }]}
        />
        <TextInput
          value={vol}
          onChangeText={v => { setVol(v); setVolErr(""); }}
          placeholder="mL"
          placeholderTextColor={theme.textSoft}
          keyboardType="decimal-pad"
          style={[styles.macroInput, { color: theme.textStrong, borderColor: volErr ? theme.coral.solid : ink }]}
        />
      </View>
      <View style={styles.macroInputRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.macroLabel, { color: ink }]}>ABV %</Text>
          {abvErr ? <Text style={{ color: theme.coral.solid, fontSize: 10 }}>{abvErr}</Text> : null}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.macroLabel, { color: ink }]}>VOLUME (mL)</Text>
          {volErr ? <Text style={{ color: theme.coral.solid, fontSize: 10 }}>{volErr}</Text> : null}
        </View>
      </View>
      {previewDrinks != null ? (
        <Text style={{ color: theme.textSoft, fontSize: 11 }}>
          ≈ {previewDrinks} standard drink{previewDrinks !== 1 ? "s" : ""}
        </Text>
      ) : null}
      <View style={styles.editFormButtons}>
        <Pressable onPress={onCancel} style={styles.cancelBtn}>
          <Text style={styles.cancelBtnText}>CANCEL</Text>
        </Pressable>
        <Pressable onPress={handleSave} style={[styles.actionBtn, { backgroundColor: theme.purple.solid, flex: 1 }]}>
          <Text style={[styles.actionBtnText, { color: onSolid(theme.purple.solid) }]}>LOG IT</Text>
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
