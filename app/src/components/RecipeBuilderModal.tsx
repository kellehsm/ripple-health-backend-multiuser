import React, { useState, useCallback } from "react";
import {
  Modal, View, Text, TextInput, Pressable, ScrollView,
  StyleSheet, Alert, KeyboardAvoidingView, Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { useCardBg } from "../theme/AppSettingsContext";
import { onSolid } from "../theme/colorUtils";
import { api } from "../api/client";
import { LoadingIndicator } from "./LoadingIndicator";

export type RecipeIngredient = {
  name: string;
  carbs_g: number | null;
  sugar_g: number | null;
  calories: number | null;
  source_food_id?: string;
  source_db?: string;
};

export type Recipe = {
  id: string;
  name: string;
  carbs_g: number | null;
  sugar_g: number | null;
  calories: number | null;
  ingredients: RecipeIngredient[];
};

type FoodResult = {
  source_food_id: string;
  name: string;
  carbs_g: number | null;
  sugar_g: number | null;
  calories: number | null;
  source_db?: string;
};

interface Props {
  visible: boolean;
  onClose: () => void;
  onSaved: (recipe: Recipe) => void;
  existing?: Recipe;
}

type Step = "name" | "ingredients" | "review";

function sumMacros(ingredients: RecipeIngredient[]) {
  return ingredients.reduce(
    (acc, ing) => ({
      carbs_g: Math.round(((acc.carbs_g ?? 0) + (ing.carbs_g ?? 0)) * 10) / 10,
      sugar_g: Math.round(((acc.sugar_g ?? 0) + (ing.sugar_g ?? 0)) * 10) / 10,
      calories: Math.round((acc.calories ?? 0) + (ing.calories ?? 0)),
    }),
    { carbs_g: 0, sugar_g: 0, calories: 0 }
  );
}

export function RecipeBuilderModal({ visible, onClose, onSaved, existing }: Props) {
  const { theme } = useTheme();
  const cardBg = useCardBg();
  const ink = theme.ink;

  const [step, setStep] = useState<Step>("name");
  const [recipeName, setRecipeName] = useState(existing?.name ?? "");
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>(existing?.ingredients ?? []);
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<FoodResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);

  // Per-ingredient macro editing
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editCarbs, setEditCarbs] = useState("");
  const [editSugar, setEditSugar] = useState("");
  const [editCals, setEditCals] = useState("");

  function reset() {
    setStep("name");
    setRecipeName(existing?.name ?? "");
    setIngredients(existing?.ingredients ?? []);
    setSearchQ("");
    setSearchResults([]);
    setEditingIdx(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleSearch() {
    if (!searchQ.trim()) return;
    setSearching(true);
    setSearchResults([]);
    api.searchFood(searchQ)
      .then((data: FoodResult[]) => setSearchResults(Array.isArray(data) ? data : []))
      .catch(() => setSearchResults([]))
      .finally(() => setSearching(false));
  }

  function addIngredient(food: FoodResult) {
    setIngredients(prev => [...prev, {
      name: food.name,
      carbs_g: food.carbs_g,
      sugar_g: food.sugar_g,
      calories: food.calories,
      source_food_id: food.source_food_id,
      source_db: food.source_db,
    }]);
    setSearchQ("");
    setSearchResults([]);
  }

  function removeIngredient(idx: number) {
    setIngredients(prev => prev.filter((_, i) => i !== idx));
    if (editingIdx === idx) setEditingIdx(null);
  }

  function startEditIngredient(idx: number) {
    const ing = ingredients[idx];
    setEditCarbs(ing.carbs_g != null ? String(ing.carbs_g) : "");
    setEditSugar(ing.sugar_g != null ? String(ing.sugar_g) : "");
    setEditCals(ing.calories != null ? String(ing.calories) : "");
    setEditingIdx(idx);
  }

  function saveEditIngredient() {
    if (editingIdx === null) return;
    setIngredients(prev => prev.map((ing, i) =>
      i === editingIdx ? {
        ...ing,
        carbs_g: editCarbs.trim() ? parseFloat(editCarbs) : null,
        sugar_g: editSugar.trim() ? parseFloat(editSugar) : null,
        calories: editCals.trim() ? parseFloat(editCals) : null,
      } : ing
    ));
    setEditingIdx(null);
  }

  async function handleSave() {
    const totals = sumMacros(ingredients);
    setSaving(true);
    try {
      const payload = {
        name: recipeName.trim(),
        carbs_g: totals.carbs_g,
        sugar_g: totals.sugar_g,
        calories: totals.calories,
        ingredients,
      };
      const result: Recipe = existing
        ? await api.updateRecipe(existing.id, payload)
        : await api.createRecipe(payload);
      reset();
      onSaved(result);
    } catch {
      Alert.alert("Couldn't save recipe", "Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  const totals = sumMacros(ingredients);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={[s.root, { backgroundColor: theme.page }]}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {/* Drag handle — signals swipe-to-dismiss on iOS page sheet */}
        <View style={{ alignItems: "center", paddingTop: 10, paddingBottom: 4 }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: ink + "30" }} />
        </View>
        {/* Header */}
        <View style={[s.header, { borderBottomColor: ink + "33" }]}>
          <Pressable onPress={handleClose} style={s.headerBtn} accessibilityRole="button" accessibilityLabel="Close">
            <Ionicons name="close" size={22} color={theme.textSoft} />
          </Pressable>
          <Text style={[s.headerTitle, { color: theme.textStrong }]}>
            {existing ? "Edit recipe" : "New recipe"}
          </Text>
          <View style={{ width: 36 }} />
        </View>

        {/* Step indicator */}
        <View style={s.stepRow}>
          {(["name", "ingredients", "review"] as Step[]).map((st, i) => (
            <View key={st} style={s.stepItem}>
              <View style={[s.stepDot, {
                backgroundColor: step === st ? theme.teal.solid :
                  (["name", "ingredients", "review"].indexOf(step) > i ? theme.teal.sub : ink + "33"),
              }]} />
              <Text style={[s.stepLabel, { color: step === st ? theme.teal.fg : theme.textSoft }]}>
                {st === "name" ? "Name" : st === "ingredients" ? "Ingredients" : "Review"}
              </Text>
            </View>
          ))}
        </View>

        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          {/* ── Step 1: Name ── */}
          {step === "name" && (
            <View style={s.section}>
              <Text style={[s.label, { color: theme.textSoft }]}>Recipe name</Text>
              <TextInput
                value={recipeName}
                onChangeText={setRecipeName}
                placeholder="e.g. My morning smoothie"
                placeholderTextColor={theme.textSoft}
                autoFocus
                style={[s.input, { color: theme.textStrong, borderColor: ink, backgroundColor: cardBg }]}
                returnKeyType="next"
                onSubmitEditing={() => { if (recipeName.trim()) setStep("ingredients"); }}
              />
              <Pressable
                onPress={() => { if (recipeName.trim()) setStep("ingredients"); }}
                disabled={!recipeName.trim()}
                style={[s.primaryBtn, { backgroundColor: theme.teal.solid, opacity: recipeName.trim() ? 1 : 0.45 }]}
              >
                <Text style={[s.primaryBtnText, { color: onSolid(theme.teal.solid) }]}>Next — add ingredients</Text>
              </Pressable>
            </View>
          )}

          {/* ── Step 2: Ingredients ── */}
          {step === "ingredients" && (
            <View style={s.section}>
              <Text style={[s.label, { color: theme.textSoft }]}>Search food to add</Text>
              <View style={s.searchRow}>
                <TextInput
                  value={searchQ}
                  onChangeText={setSearchQ}
                  placeholder="search food..."
                  placeholderTextColor={theme.textSoft}
                  style={[s.searchInput, { color: theme.textStrong, borderColor: ink, backgroundColor: cardBg }]}
                  returnKeyType="search"
                  onSubmitEditing={handleSearch}
                />
                <Pressable
                  onPress={handleSearch}
                  disabled={searching || !searchQ.trim()}
                  style={[s.searchBtn, { backgroundColor: theme.teal.solid }]}
                >
                  {searching
                    ? <LoadingIndicator size="small" color={onSolid(theme.teal.solid)} />
                    : <Ionicons name="search" size={16} color={onSolid(theme.teal.solid)} />}
                </Pressable>
              </View>

              {searchResults.length > 0 && (
                <View style={[s.resultsBox, { borderColor: ink + "44", backgroundColor: cardBg }]}>
                  {searchResults.slice(0, 6).map((food, i) => (
                    <Pressable
                      key={food.source_food_id + i}
                      onPress={() => addIngredient(food)}
                      style={[s.resultRow, i > 0 && { borderTopWidth: 0.5, borderTopColor: ink + "22" }]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: theme.textStrong, fontSize: 13, fontWeight: "500" }} numberOfLines={1}>{food.name}</Text>
                        {(food.calories != null || food.carbs_g != null) && (
                          <Text style={{ color: theme.textSoft, fontSize: 11 }}>
                            {food.calories != null ? food.calories + " cal" : ""}
                            {food.calories != null && food.carbs_g != null ? " · " : ""}
                            {food.carbs_g != null ? food.carbs_g + "g carbs" : ""}
                          </Text>
                        )}
                      </View>
                      <Ionicons name="add-circle-outline" size={20} color={theme.teal.solid} />
                    </Pressable>
                  ))}
                </View>
              )}

              {/* Current ingredient list */}
              {ingredients.length > 0 && (
                <>
                  <Text style={[s.ingHeader, { color: theme.textSoft }]}>
                    INGREDIENTS ({ingredients.length})
                  </Text>
                  {ingredients.map((ing, idx) => (
                    <View key={idx} style={[s.ingRow, { borderColor: ink + "33", backgroundColor: cardBg }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: theme.textStrong, fontSize: 13, fontWeight: "500" }} numberOfLines={1}>{ing.name}</Text>
                        {editingIdx === idx ? (
                          <View style={s.macroEditRow}>
                            <TextInput
                              value={editCarbs}
                              onChangeText={setEditCarbs}
                              placeholder="carbs g"
                              placeholderTextColor={theme.textSoft}
                              keyboardType="decimal-pad"
                              style={[s.macroInput, { color: theme.textStrong, borderColor: ink }]}
                            />
                            <TextInput
                              value={editSugar}
                              onChangeText={setEditSugar}
                              placeholder="sugar g"
                              placeholderTextColor={theme.textSoft}
                              keyboardType="decimal-pad"
                              style={[s.macroInput, { color: theme.textStrong, borderColor: ink }]}
                            />
                            <TextInput
                              value={editCals}
                              onChangeText={setEditCals}
                              placeholder="cal"
                              placeholderTextColor={theme.textSoft}
                              keyboardType="decimal-pad"
                              style={[s.macroInput, { color: theme.textStrong, borderColor: ink }]}
                            />
                            <Pressable onPress={saveEditIngredient} style={[s.microBtn, { backgroundColor: theme.teal.solid }]}>
                              <Text style={{ color: onSolid(theme.teal.solid), fontSize: 11, fontWeight: "700" }}>OK</Text>
                            </Pressable>
                          </View>
                        ) : (
                          <Text style={{ color: theme.textSoft, fontSize: 11 }}>
                            {[
                              ing.calories != null ? ing.calories + " cal" : null,
                              ing.carbs_g != null ? ing.carbs_g + "g carbs" : null,
                            ].filter(Boolean).join(" · ") || "no macro data"}
                          </Text>
                        )}
                      </View>
                      <View style={s.ingActions}>
                        <Pressable
                          onPress={() => editingIdx === idx ? setEditingIdx(null) : startEditIngredient(idx)}
                          style={s.iconBtn}
                          accessibilityLabel="Edit macros"
                        >
                          <Ionicons name={editingIdx === idx ? "chevron-up" : "pencil-outline"} size={16} color={theme.textSoft} />
                        </Pressable>
                        <Pressable onPress={() => removeIngredient(idx)} style={s.iconBtn} accessibilityLabel="Remove ingredient">
                          <Ionicons name="trash-outline" size={16} color={theme.coral.solid} />
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </>
              )}

              <View style={s.navRow}>
                <Pressable onPress={() => setStep("name")} style={[s.secondaryBtn, { borderColor: ink }]}>
                  <Text style={{ color: theme.textSoft, fontSize: 13, fontWeight: "600" }}>← Back</Text>
                </Pressable>
                <Pressable
                  onPress={() => setStep("review")}
                  disabled={ingredients.length === 0}
                  style={[s.primaryBtn, { flex: 1, backgroundColor: theme.teal.solid, opacity: ingredients.length > 0 ? 1 : 0.45 }]}
                >
                  <Text style={[s.primaryBtnText, { color: onSolid(theme.teal.solid) }]}>Review →</Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* ── Step 3: Review ── */}
          {step === "review" && (
            <View style={s.section}>
              <Text style={[s.reviewName, { color: theme.textStrong }]}>{recipeName}</Text>

              <View style={[s.macroSummary, { backgroundColor: theme.teal.tint, borderColor: ink + "44" }]}>
                <Text style={[s.macroSummaryLabel, { color: theme.teal.sub }]}>COMBINED MACROS</Text>
                <View style={s.macroSummaryRow}>
                  <View style={s.macroSummaryItem}>
                    <Text style={[s.macroSummaryVal, { color: theme.teal.fg }]}>{totals.calories}</Text>
                    <Text style={[s.macroSummaryKey, { color: theme.teal.sub }]}>cal</Text>
                  </View>
                  <View style={s.macroSummaryItem}>
                    <Text style={[s.macroSummaryVal, { color: theme.teal.fg }]}>{totals.carbs_g}g</Text>
                    <Text style={[s.macroSummaryKey, { color: theme.teal.sub }]}>carbs</Text>
                  </View>
                  <View style={s.macroSummaryItem}>
                    <Text style={[s.macroSummaryVal, { color: theme.teal.fg }]}>{totals.sugar_g}g</Text>
                    <Text style={[s.macroSummaryKey, { color: theme.teal.sub }]}>sugar</Text>
                  </View>
                </View>
              </View>

              <Text style={[s.ingHeader, { color: theme.textSoft }]}>{ingredients.length} INGREDIENT{ingredients.length !== 1 ? "S" : ""}</Text>
              {ingredients.map((ing, idx) => (
                <View key={idx} style={[s.reviewRow, { borderBottomColor: ink + "1A" }]}>
                  <Text style={{ color: theme.textStrong, fontSize: 13, flex: 1 }}>{ing.name}</Text>
                  <Text style={{ color: theme.textSoft, fontSize: 11 }}>
                    {ing.calories != null ? ing.calories + " cal" : "—"}
                  </Text>
                </View>
              ))}

              <View style={s.navRow}>
                <Pressable onPress={() => setStep("ingredients")} style={[s.secondaryBtn, { borderColor: ink }]}>
                  <Text style={{ color: theme.textSoft, fontSize: 13, fontWeight: "600" }}>← Edit</Text>
                </Pressable>
                <Pressable
                  onPress={handleSave}
                  disabled={saving}
                  style={[s.primaryBtn, { flex: 1, backgroundColor: theme.teal.solid }]}
                >
                  {saving
                    ? <LoadingIndicator size="small" color={onSolid(theme.teal.solid)} />
                    : <Text style={[s.primaryBtnText, { color: onSolid(theme.teal.solid) }]}>
                        {existing ? "Save changes" : "Save recipe"}
                      </Text>}
                </Pressable>
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: 1 },
  headerBtn: { width: 36, alignItems: "center" },
  headerTitle: { fontSize: 16, fontWeight: "700" },
  stepRow: { flexDirection: "row", justifyContent: "center", gap: 24, paddingVertical: 14, paddingHorizontal: 16 },
  stepItem: { alignItems: "center", gap: 4 },
  stepDot: { width: 8, height: 8, borderRadius: 4 },
  stepLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 0.4 },
  content: { padding: 16, paddingBottom: 40 },
  section: { gap: 12 },
  label: { fontSize: 12, fontWeight: "700", letterSpacing: 0.5 },
  input: { borderWidth: 2, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15 },
  searchRow: { flexDirection: "row", gap: 8 },
  searchInput: { flex: 1, borderWidth: 2, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14 },
  searchBtn: { width: 44, height: 44, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  resultsBox: { borderWidth: 1, borderRadius: 10, overflow: "hidden" },
  resultRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  ingHeader: { fontSize: 10, fontWeight: "800", letterSpacing: 0.8, marginTop: 6 },
  ingRow: { flexDirection: "row", alignItems: "flex-start", borderWidth: 1, borderRadius: 10, padding: 10, gap: 8 },
  ingActions: { flexDirection: "column", gap: 6 },
  iconBtn: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  macroEditRow: { flexDirection: "row", gap: 4, marginTop: 4, alignItems: "center" },
  macroInput: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3, fontSize: 11, width: 56 },
  microBtn: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  navRow: { flexDirection: "row", gap: 10, marginTop: 6 },
  secondaryBtn: { borderWidth: 2, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, alignItems: "center", justifyContent: "center" },
  primaryBtn: { borderRadius: 10, paddingVertical: 12, alignItems: "center", justifyContent: "center" },
  primaryBtnText: { fontSize: 14, fontWeight: "700" },
  reviewName: { fontSize: 20, fontWeight: "800", marginBottom: 4 },
  macroSummary: { borderRadius: 12, borderWidth: 1, padding: 14, gap: 8 },
  macroSummaryLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 0.6 },
  macroSummaryRow: { flexDirection: "row", gap: 20 },
  macroSummaryItem: { alignItems: "center" },
  macroSummaryVal: { fontSize: 22, fontWeight: "800" },
  macroSummaryKey: { fontSize: 11, fontWeight: "600" },
  reviewRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1 },
});
