import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
} from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { onSolid } from "../theme/colorUtils";

export type MacroValues = {
  name: string;
  carbs_g: number | null;
  sugar_g: number | null;
  calories: number | null;
  caffeine_mg: number | null;
  sodium_mg: number | null;
  /** Number of servings actually eaten. Nutrition fields above are PER-SERVING. Defaults to 1. */
  servings?: number | null;
};

export function MacroEditForm({
  initial,
  saveLabel,
  onSave,
  onCancel,
}: {
  initial: MacroValues;
  saveLabel: string;
  onSave: (values: MacroValues) => void;
  onCancel: () => void;
}) {
  const { theme } = useTheme();
  const ink = theme.ink;
  const card = theme.card;
  const styles = useMemo(() => makeStyles(ink, card, theme.cardBorder), [ink, card, theme.cardBorder]);
  const [name, setName] = useState(initial.name);
  const [carbs, setCarbs] = useState(initial.carbs_g != null ? String(initial.carbs_g) : "");
  const [sugar, setSugar] = useState(initial.sugar_g != null ? String(initial.sugar_g) : "");
  const [cals, setCals] = useState(initial.calories != null ? String(initial.calories) : "");
  const [caffeine, setCaffeine] = useState(initial.caffeine_mg != null ? String(initial.caffeine_mg) : "");
  const [sodium, setSodium] = useState(initial.sodium_mg != null ? String(initial.sodium_mg) : "");
  const [servings, setServings] = useState(initial.servings != null && initial.servings > 0 ? String(initial.servings) : "1");
  const [nameErr, setNameErr] = useState("");
  const [macroErr, setMacroErr] = useState("");

  function parseNum(s: string): number | null {
    const t = s.trim();
    if (!t) return null;
    const n = parseFloat(t);
    return isNaN(n) ? null : n;
  }

  function doSaveMacro() {
    const servingsVal = parseNum(servings);
    onSave({
      name: name.trim(),
      carbs_g: parseNum(carbs),
      sugar_g: parseNum(sugar),
      calories: parseNum(cals),
      caffeine_mg: parseNum(caffeine),
      sodium_mg: parseNum(sodium),
      servings: servingsVal != null && servingsVal > 0 ? servingsVal : 1,
    });
  }

  function handleSave() {
    let valid = true;
    if (!name.trim()) { setNameErr("Please enter a meal name."); valid = false; } else setNameErr("");
    const badMacro = (carbs.trim() && isNaN(parseFloat(carbs))) ||
      (sugar.trim() && isNaN(parseFloat(sugar))) ||
      (cals.trim() && isNaN(parseFloat(cals))) ||
      (caffeine.trim() && isNaN(parseFloat(caffeine))) ||
      (sodium.trim() && isNaN(parseFloat(sodium)));
    if (badMacro) { setMacroErr("All fields must be numbers or left blank."); valid = false; } else setMacroErr("");
    if (!valid) return;
    const carbsVal = parseNum(carbs);
    const sugarVal = parseNum(sugar);
    const calsVal = parseNum(cals);
    const caffeineVal = parseNum(caffeine);
    const sodiumVal = parseNum(sodium);
    const unusual: string[] = [];
    if (carbsVal !== null && carbsVal > 500) unusual.push(`${carbsVal}g carbs`);
    if (sugarVal !== null && sugarVal > 200) unusual.push(`${sugarVal}g sugar`);
    if (calsVal !== null && (calsVal > 5000 || calsVal < 0)) unusual.push(`${calsVal} cal`);
    if (caffeineVal !== null && caffeineVal > 1000) unusual.push(`${caffeineVal}mg caffeine`);
    if (unusual.length > 0) {
      Alert.alert(
        "Does this look right?",
        `${unusual.join(", ")} seems high for a single meal — just checking it's not a typo.`,
        [
          { text: "Let me fix it", style: "cancel" },
          { text: "Yes, save it", onPress: doSaveMacro },
        ]
      );
      return;
    }
    doSaveMacro();
  }

  return (
    <View style={styles.editForm}>
      <TextInput
        value={name}
        onChangeText={v => { setName(v); setNameErr(""); }}
        placeholder="Food name"
        placeholderTextColor={theme.textSoft}
        style={[styles.textInput, { color: theme.textStrong, borderColor: nameErr ? theme.coral.solid : ink }]}
        accessibilityLabel="Meal name"
      />
      {nameErr ? <Text style={{ color: theme.coral.solid, fontSize: 11, marginTop: -4 }}>{nameErr}</Text> : null}
      <View style={styles.macroInputRow}>
        <TextInput
          value={cals}
          onChangeText={v => { setCals(v); setMacroErr(""); }}
          placeholder="kcal"
          placeholderTextColor={theme.textSoft}
          keyboardType="decimal-pad"
          style={[styles.macroInput, { color: theme.textStrong }]}
          accessibilityLabel="Calories"
        />
        <TextInput
          value={carbs}
          onChangeText={v => { setCarbs(v); setMacroErr(""); }}
          placeholder="g"
          placeholderTextColor={theme.textSoft}
          keyboardType="decimal-pad"
          style={[styles.macroInput, { color: theme.textStrong }]}
          accessibilityLabel="Carbohydrates in grams"
        />
        <TextInput
          value={sugar}
          onChangeText={v => { setSugar(v); setMacroErr(""); }}
          placeholder="g"
          placeholderTextColor={theme.textSoft}
          keyboardType="decimal-pad"
          style={[styles.macroInput, { color: theme.textStrong }]}
          accessibilityLabel="Sugar in grams"
        />
      </View>
      <View style={styles.macroInputRow}>
        <Text style={[styles.macroLabel, { color: ink }]}>CALORIES</Text>
        <Text style={[styles.macroLabel, { color: ink }]}>CARBS</Text>
        <Text style={[styles.macroLabel, { color: ink }]}>SUGAR</Text>
      </View>
      <View style={styles.macroInputRow}>
        <TextInput
          value={caffeine}
          onChangeText={v => { setCaffeine(v); setMacroErr(""); }}
          placeholder="mg"
          placeholderTextColor={theme.textSoft}
          keyboardType="decimal-pad"
          style={[styles.macroInput, { color: theme.textStrong }]}
          accessibilityLabel="Caffeine in mg"
        />
        <TextInput
          value={sodium}
          onChangeText={v => { setSodium(v); setMacroErr(""); }}
          placeholder="mg"
          placeholderTextColor={theme.textSoft}
          keyboardType="decimal-pad"
          style={[styles.macroInput, { color: theme.textStrong }]}
          accessibilityLabel="Sodium in mg"
        />
      </View>
      <View style={styles.macroInputRow}>
        <Text style={[styles.macroLabel, { color: ink }]}>CAFFEINE</Text>
        <Text style={[styles.macroLabel, { color: ink }]}>SODIUM</Text>
      </View>
      {macroErr ? <Text style={{ color: theme.coral.solid, fontSize: 11 }}>{macroErr}</Text> : null}

      {/* Servings — nutrition above is PER-SERVING; totals scale by this. */}
      <View style={styles.servingsRow}>
        <Text style={[styles.servingsLabel, { color: ink }]}>SERVINGS</Text>
        <Pressable
          onPress={() => {
            const cur = parseFloat(servings) || 1;
            const next = Math.max(0.25, Math.round((cur - 0.5) * 4) / 4);
            setServings(String(next));
          }}
          style={[styles.stepBtn, { borderColor: ink }]}
          accessibilityLabel="Decrease servings"
        >
          <Text style={[styles.stepBtnText, { color: ink }]}>–</Text>
        </Pressable>
        <TextInput
          value={servings}
          onChangeText={(v) => setServings(v)}
          keyboardType="decimal-pad"
          selectTextOnFocus
          style={[styles.servingsInput, { color: theme.textStrong, borderColor: ink, backgroundColor: card }]}
          accessibilityLabel="Servings"
        />
        <Pressable
          onPress={() => {
            const cur = parseFloat(servings) || 1;
            const next = Math.round((cur + 0.5) * 4) / 4;
            setServings(String(next));
          }}
          style={[styles.stepBtn, { borderColor: ink }]}
          accessibilityLabel="Increase servings"
        >
          <Text style={[styles.stepBtnText, { color: ink }]}>+</Text>
        </Pressable>
      </View>

      <View style={styles.editFormButtons}>
        <Pressable onPress={onCancel} style={styles.cancelBtn}>
          <Text style={styles.cancelBtnText}>CANCEL</Text>
        </Pressable>
        <Pressable onPress={handleSave} style={[styles.actionBtn, { backgroundColor: theme.coral.solid, flex: 1 }]}>
          <Text style={[styles.actionBtnText, { color: onSolid(theme.coral.solid) }]}>{saveLabel.toUpperCase()}</Text>
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
    servingsRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
    servingsLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 0.6, flex: 1 },
    stepBtn: {
      width: 34, height: 34, borderRadius: 17, borderWidth: 2,
      alignItems: "center", justifyContent: "center", backgroundColor: card,
    },
    stepBtnText: { fontSize: 18, fontWeight: "900", lineHeight: 20 },
    servingsInput: {
      width: 62, borderWidth: 2, borderRadius: 14, textAlign: "center",
      paddingVertical: 6, fontSize: 14, fontWeight: "700",
    },
  });
}
