/**
 * LogMealCard — the "Log a meal" ShadowCard plus its three companion modals
 * (add-food action sheet, meal-type picker, servings default prompt).
 * All state for those modals (addSheetVisible, mealTypePickerVisible,
 * servingsPromptName, servingsInput) lives in the parent and flows in as props.
 */
import React, { useRef } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Modal,
  ScrollView,
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { ShadowCard } from "../../components/ShadowCard";
import { SearchScanBar } from "../../components/SearchScanBar";
import { ResultRow } from "../../components/ResultRow";
import { MacroEditForm, type MacroValues } from "../../components/MacroEditForm";
import { ThemedIcon } from "../../theme/iconRegistry";
import { formatNutrition } from "../../utils/nutritionFormatter";

// ─── Types ────────────────────────────────────────────────────────────────────

export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

export type FrequentMeal = {
  name: string;
  source_food_id: string | null;
  source_db: string | null;
  carbs_g: number | null;
  sugar_g: number | null;
  calories: number | null;
  caffeine_mg: number | null;
  sodium_mg: number | null;
  frequency: number;
};

export type FoodResult = {
  source_food_id: string;
  name: string;
  carbs_g: number | null;
  sugar_g: number | null;
  calories: number | null;
  caffeine_mg?: number | null;
  sodium_mg?: number | null;
  source_db?: string;
  barcode?: string;
};

export type PendingFood = {
  name: string;
  carbs_g: number | null;
  sugar_g: number | null;
  calories: number | null;
  caffeine_mg: number | null;
  sodium_mg: number | null;
  source_food_id?: string;
  source_db?: string;
  barcode?: string;
  servings?: number | null;
};

type QuickDrink = {
  name: string;
  calories: number | null;
  caffeine_mg: number | null;
  carbs_g: number | null;
  sugar_g: number | null;
  sodium_mg: number | null;
};

import type { Recipe } from "../../components/RecipeBuilderModal";

export type LogMealCardProps = {
  theme: any;
  ink: string;
  card: string;
  tourLogRef: React.RefObject<View | null>;
  mealType: MealType;
  searchQuery: string;
  searchResults: FoodResult[];
  searching: boolean;
  searchError: string | null;
  pendingFood: PendingFood | null;
  frequentMeals: FrequentMeal[];
  recipes: Recipe[];
  impactScores: Record<string, number>;
  foodReport: Array<{ meal_name: string; avg_spike: number; sample_count: number }>;
  hiddenSections: string[];
  // modal state (owned by parent)
  addSheetVisible: boolean;
  mealTypePickerVisible: boolean;
  servingsPromptName: string | null;
  servingsInput: string;
  // chip animated values (parent-owned so they survive re-renders)
  chipScales: React.RefObject<Map<string, Animated.Value>>;
  recipeScales: React.RefObject<Map<string, Animated.Value>>;
  // styles passed from parent stylesheet
  styles: {
    frequentSection: any;
    sectionLabel: any;
    frequentRow: any;
    frequentChip: any;
    secondaryBtn: any;
    secondaryBtnText: any;
    typePill: any;
    cardTitle: any;
    totalBlock: any;
    totalBlockLabel: any;
    totalBlockValue: any;
  };
  // callbacks
  onSearchQueryChange: (text: string) => void;
  onSearch: () => void;
  onSelectFood: (food: FoodResult) => void;
  onSavePending: (values: MacroValues) => void;
  onCancelPending: () => void;
  onSelectFrequent: (meal: FrequentMeal) => void;
  onLogRecipe: (recipe: Recipe) => void;
  onEditRecipe: (recipe: Recipe) => void;
  onQuickDrink: (drink: QuickDrink) => void;
  onPromptFrequentServings: (name: string) => void;
  onHideFrequent: (name: string) => void;
  onOpenRecipeBuilder: () => void;
  // modal open/close
  onOpenAddSheet: () => void;
  onCloseAddSheet: () => void;
  onOpenMealTypePicker: () => void;
  onCloseMealTypePicker: () => void;
  onSelectMealType: (type: MealType) => void;
  onCloseServingsPrompt: () => void;
  onServingsInputChange: (text: string) => void;
  onSaveServingsPrompt: () => void;
  // add-sheet actions
  onOpenScanner: () => void;
  onOpenPhotoScanner: () => void;
  onOpenGalleryScanner: () => void;
  onEnterManually: () => void;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const QUICK_DRINKS: QuickDrink[] = [
  { name: "Water", calories: 0, caffeine_mg: null, carbs_g: 0, sugar_g: 0, sodium_mg: null },
  { name: "Black Coffee", calories: 5, caffeine_mg: 95, carbs_g: 0, sugar_g: 0, sodium_mg: 5 },
  { name: "Espresso", calories: 3, caffeine_mg: 63, carbs_g: 0, sugar_g: 0, sodium_mg: 5 },
  { name: "Latte", calories: 120, caffeine_mg: 64, carbs_g: 12, sugar_g: 12, sodium_mg: 115 },
  { name: "Green Tea", calories: 2, caffeine_mg: 28, carbs_g: 0, sugar_g: 0, sodium_mg: null },
  { name: "Black Tea", calories: 2, caffeine_mg: 47, carbs_g: 0, sugar_g: 0, sodium_mg: null },
  { name: "Energy Drink", calories: 110, caffeine_mg: 80, carbs_g: 27, sugar_g: 27, sodium_mg: 105 },
  { name: "Diet Soda", calories: 0, caffeine_mg: 46, carbs_g: 0, sugar_g: 0, sodium_mg: 40 },
  { name: "Orange Juice", calories: 112, caffeine_mg: null, carbs_g: 26, sugar_g: 21, sodium_mg: 2 },
  { name: "Whole Milk", calories: 149, caffeine_mg: null, carbs_g: 12, sugar_g: 12, sodium_mg: 105 },
  { name: "Kombucha", calories: 30, caffeine_mg: 14, carbs_g: 7, sugar_g: 4, sodium_mg: 10 },
  { name: "Protein Shake", calories: 160, caffeine_mg: null, carbs_g: 6, sugar_g: 3, sodium_mg: 180 },
];

const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

function chipColors(i: number, theme: any): { bg: string; fg: string; sub: string } {
  const palette = [
    { bg: theme.teal.tint, fg: theme.teal.fg, sub: theme.teal.sub },
    { bg: theme.coral.tint, fg: theme.coral.fg, sub: theme.coral.sub },
    { bg: theme.purple.tint, fg: theme.purple.fg, sub: theme.purple.sub },
    { bg: theme.berry.tint, fg: theme.berry.fg, sub: theme.berry.sub },
  ];
  return palette[i % palette.length];
}

// ─── LogMealCard ──────────────────────────────────────────────────────────────

export function LogMealCard({
  theme, ink, card, tourLogRef,
  mealType, searchQuery, searchResults, searching, searchError,
  pendingFood, frequentMeals, recipes, impactScores, foodReport,
  hiddenSections,
  addSheetVisible, mealTypePickerVisible, servingsPromptName, servingsInput,
  chipScales, recipeScales,
  styles,
  onSearchQueryChange, onSearch, onSelectFood, onSavePending, onCancelPending,
  onSelectFrequent, onLogRecipe, onEditRecipe, onQuickDrink,
  onPromptFrequentServings, onHideFrequent, onOpenRecipeBuilder,
  onOpenAddSheet, onCloseAddSheet,
  onOpenMealTypePicker, onCloseMealTypePicker, onSelectMealType,
  onCloseServingsPrompt, onServingsInputChange, onSaveServingsPrompt,
  onOpenScanner, onOpenPhotoScanner, onOpenGalleryScanner, onEnterManually,
}: LogMealCardProps) {
  return (
    <>
      <View ref={tourLogRef}>
        <ShadowCard size="card" bg={theme.coral.tint} accent={theme.coral.solid} rotate={-0.5} cardId="meal_log">
          <Text style={[styles.cardTitle, { color: theme.textStrong }]} allowFontScaling maxFontSizeMultiplier={1.4} accessibilityRole="header">Log a meal</Text>

          {/* Quick drinks row */}
          <View style={styles.frequentSection}>
            <Text style={[styles.sectionLabel, { color: theme.textSoft }]}>DRINKS</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.frequentRow}>
              {QUICK_DRINKS.map(function (drink) {
                return (
                  <Pressable
                    key={drink.name}
                    onPress={function () { onQuickDrink(drink); }}
                    style={[styles.frequentChip, { backgroundColor: theme.teal.tint }]}
                    accessibilityRole="button"
                    accessibilityLabel={`Log ${drink.name}${drink.calories != null && drink.calories > 0 ? `, ${drink.calories} calories` : ""}${drink.caffeine_mg != null ? `, ${drink.caffeine_mg}mg caffeine` : ""}`}
                  >
                    <Text style={{ color: theme.teal.fg, fontSize: 13, fontWeight: "700" }} numberOfLines={1}>{drink.name}</Text>
                    {(drink.calories != null && drink.calories > 0) || drink.caffeine_mg != null ? (
                      <Text style={{ color: theme.teal.sub, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
                        {[drink.calories != null && drink.calories > 0 ? drink.calories + " cal" : null, drink.caffeine_mg != null ? drink.caffeine_mg + "mg caf" : null].filter(Boolean).join(" · ")}
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {/* Your usual section */}
          {!hiddenSections.includes('your_usual') && ((frequentMeals.length > 0 || recipes.length > 0) ? (
            <View style={styles.frequentSection}>
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
                <Text style={[styles.sectionLabel, { color: theme.textSoft, flex: 1, marginBottom: 0 }]}>YOUR USUAL</Text>
                <Pressable
                  onPress={onOpenRecipeBuilder}
                  style={[styles.secondaryBtn, { paddingVertical: 4 }]}
                >
                  <Ionicons name="bookmark-outline" size={12} color={ink} />
                  <Text style={styles.secondaryBtnText}>+ RECIPE</Text>
                </Pressable>
              </View>
              {(function () {
                const highSpikeMeal = frequentMeals.reduce<{ name: string; spike: number; count: number } | null>(function (best, m) {
                  const s = impactScores[m.name];
                  if (s == null || s <= 40) return best;
                  const rep = foodReport.find(function (r) { return r.meal_name === m.name; });
                  if (!rep || rep.sample_count < 3) return best;
                  if (!best || s > best.spike) return { name: m.name, spike: s, count: rep.sample_count };
                  return best;
                }, null);
                return highSpikeMeal ? (
                  <View style={{ backgroundColor: theme.amber.tint, borderRadius: 12, borderWidth: 1.5, borderColor: theme.amber.solid, padding: 8, marginBottom: 8, flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={{ fontSize: 11, color: theme.amber.sub }}>
                      {highSpikeMeal.name + " has averaged a +" + highSpikeMeal.spike + " mg/dL rise across " + highSpikeMeal.count + " recent logs"}
                    </Text>
                  </View>
                ) : null;
              })()}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.frequentRow}>
                {recipes.map(function (recipe) {
                  if (!recipeScales.current!.has(recipe.id)) {
                    recipeScales.current!.set(recipe.id, new Animated.Value(1));
                  }
                  const recipeScale = recipeScales.current!.get(recipe.id)!;
                  return (
                    <Animated.View key={recipe.id} style={{ transform: [{ scale: recipeScale }] }}>
                      <Pressable
                        onPress={function () { onLogRecipe(recipe); }}
                        onLongPress={function () { onEditRecipe(recipe); }}
                        onPressIn={function () {
                          Animated.spring(recipeScale, { toValue: 0.96, useNativeDriver: true, speed: 50, bounciness: 0 }).start();
                        }}
                        onPressOut={function () {
                          Animated.spring(recipeScale, { toValue: 1, useNativeDriver: true, speed: 50, bounciness: 4 }).start();
                        }}
                        style={[styles.frequentChip, { backgroundColor: theme.teal.tint }]}
                        accessibilityRole="button"
                        accessibilityLabel={`Log recipe ${recipe.name}${recipe.calories != null ? `, ${recipe.calories} calories` : ""}`}
                        accessibilityHint="Double tap to log. Long press to edit the recipe."
                      >
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                          <Ionicons name="bookmark" size={11} color={theme.teal.fg} />
                          <Text style={{ color: theme.teal.fg, fontSize: 13, fontWeight: "700" }} numberOfLines={1}>{recipe.name}</Text>
                        </View>
                        {(recipe.calories != null || recipe.carbs_g != null) ? (
                          <Text style={{ color: theme.teal.sub, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
                            {recipe.calories != null ? recipe.calories + " cal" : recipe.carbs_g + "g carbs"}
                          </Text>
                        ) : null}
                      </Pressable>
                    </Animated.View>
                  );
                })}
                {frequentMeals.map(function (meal, i) {
                  const cc = chipColors(i, theme);
                  const spike = impactScores[meal.name];
                  const badgeBg = spike == null ? null : spike <= 20 ? theme.teal.solid : spike <= 40 ? (theme.amber?.solid ?? "#f59e0b") : (theme.berry?.solid ?? theme.coral.solid);
                  const chipKey = meal.source_food_id ?? meal.name;
                  if (!chipScales.current!.has(chipKey)) {
                    chipScales.current!.set(chipKey, new Animated.Value(1));
                  }
                  const chipScale = chipScales.current!.get(chipKey)!;
                  return (
                    <Animated.View key={meal.source_food_id ?? meal.name + i} style={{ transform: [{ scale: chipScale }] }}>
                      <Pressable
                        onPress={function () { Haptics.selectionAsync(); onSelectFrequent(meal); }}
                        onLongPress={function () {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                          const { Alert } = require("react-native");
                          Alert.alert(
                            meal.name,
                            "Long-press options",
                            [
                              { text: "Cancel", style: "cancel" },
                              { text: "Set default servings", onPress: function () { onPromptFrequentServings(meal.name); } },
                              { text: "Hide from usuals", style: "destructive", onPress: function () { onHideFrequent(meal.name); } },
                            ]
                          );
                        }}
                        onPressIn={function () {
                          Animated.spring(chipScale, { toValue: 0.96, useNativeDriver: true, speed: 50, bounciness: 0 }).start();
                        }}
                        onPressOut={function () {
                          Animated.spring(chipScale, { toValue: 1, useNativeDriver: true, speed: 50, bounciness: 4 }).start();
                        }}
                        style={[styles.frequentChip, { backgroundColor: cc.bg }]}
                        accessibilityRole="button"
                        accessibilityLabel={`Log ${meal.name}${meal.calories != null ? `, ${meal.calories} calories` : ""}${spike != null && spike > 30 ? `, averages ${spike} milligrams per deciliter glucose rise` : ""}`}
                        accessibilityHint="Double tap to log. Long press to hide from your usuals."
                      >
                        <Text style={{ color: cc.fg, fontSize: 13, fontWeight: "700" }} numberOfLines={1} allowFontScaling maxFontSizeMultiplier={1.3}>{meal.name}</Text>
                        <Text style={{ color: cc.sub, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
                          {[
                            meal.calories != null ? meal.calories + " cal" : meal.carbs_g != null ? meal.carbs_g + "g carbs" : null,
                            spike != null && spike > 30 ? "↑" + spike + " mg/dL" : null,
                          ].filter(Boolean).join(" · ")}
                        </Text>
                      </Pressable>
                    </Animated.View>
                  );
                })}
              </ScrollView>
            </View>
          ) : (
            <Pressable
              onPress={onOpenRecipeBuilder}
              style={[styles.secondaryBtn, { alignSelf: "flex-start", marginBottom: 8 }]}
            >
              <Ionicons name="bookmark-outline" size={12} color={ink} />
              <Text style={styles.secondaryBtnText}>+ SAVE A RECIPE</Text>
            </Pressable>
          ))}

          {/* Meal-type pill */}
          <Pressable
            onPress={function () { Haptics.selectionAsync(); onOpenMealTypePicker(); }}
            style={[styles.typePill, { borderColor: ink, backgroundColor: card }]}
            accessibilityRole="button"
            accessibilityLabel={`Meal type: ${mealType}. Tap to change.`}
          >
            <Text style={{ color: theme.textSoft, fontSize: 9, fontWeight: "800", letterSpacing: 0.5 }}>FOR</Text>
            <Text style={{ color: ink, fontSize: 12, fontWeight: "800", marginLeft: 6 }}>{mealType.toUpperCase()}</Text>
            <Ionicons name="chevron-down" size={12} color={theme.textSoft} style={{ marginLeft: 4 }} />
          </Pressable>

          {/* Search bar */}
          <SearchScanBar
            placeholder="Search foods (pizza, salad…)"
            query={searchQuery}
            onQueryChange={onSearchQueryChange}
            onSubmit={onSearch}
            searching={searching}
            accentColor={theme.coral.solid}
            error={searchError}
            errorColor={theme.coral.sub}
            actions={[
              { label: "+ ADD FOOD", icon: "add-circle-outline", onPress: onOpenAddSheet, accessibilityLabel: "Add a food — scan barcode, photo, or enter manually" },
            ]}
          />

          {pendingFood ? (
            <MacroEditForm
              initial={pendingFood}
              saveLabel="Log it"
              onSave={onSavePending}
              onCancel={onCancelPending}
            />
          ) : searchResults.length > 0 ? (
            <View style={{ marginTop: 12, gap: 8 }}>
              {searchResults.map(function (food, i) {
                const nutrition = formatNutrition(food.carbs_g, food.sugar_g, food.calories, food.caffeine_mg, food.sodium_mg);
                return (
                  <ResultRow
                    key={food.source_food_id ?? String(i)}
                    title={food.name}
                    subtitle={nutrition ?? undefined}
                    onPress={function () { onSelectFood(food); }}
                    accessibilityLabel={`Log ${food.name}${nutrition ? `, ${nutrition}` : ""}`}
                    rightIcon={{ name: "create-outline", color: theme.coral.sub }}
                  />
                );
              })}
            </View>
          ) : null}
        </ShadowCard>
      </View>

      {/* Add-food action sheet */}
      <Modal visible={addSheetVisible} transparent animationType="fade" onRequestClose={onCloseAddSheet}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }} onPress={onCloseAddSheet}>
          <Pressable onPress={function (e) { e.stopPropagation(); }} style={{ backgroundColor: card, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 2, borderBottomWidth: 0, borderColor: theme.cardBorder, padding: 12 }}>
            <Text style={{ color: theme.textSoft, fontSize: 11, fontWeight: "800", letterSpacing: 1, textAlign: "center", paddingVertical: 8 }}>ADD A FOOD</Text>
            {([
              { label: "Scan a barcode",   icon: "barcode-outline" as const, onPress: onOpenScanner },
              { label: "Snap a photo",     icon: "camera-outline"  as const, onPress: onOpenPhotoScanner },
              { label: "Pick from photos", icon: "images-outline"  as const, onPress: onOpenGalleryScanner },
              { label: "Enter manually",   icon: "create-outline"  as const, onPress: onEnterManually },
            ] as const).map(function (row) {
              return (
                <Pressable
                  key={row.label}
                  onPress={row.onPress}
                  style={function (state: any) { return { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, paddingHorizontal: 12, borderRadius: 12, backgroundColor: state.pressed ? theme.page : "transparent" }; }}
                  accessibilityRole="button"
                  accessibilityLabel={row.label}
                >
                  <Ionicons name={row.icon} size={20} color={theme.textStrong} />
                  <Text style={{ color: theme.textStrong, fontSize: 15, fontWeight: "600" }}>{row.label}</Text>
                </Pressable>
              );
            })}
            <Pressable onPress={onCloseAddSheet} style={{ paddingVertical: 12, alignItems: "center" }}>
              <Text style={{ color: theme.textSoft, fontSize: 14, fontWeight: "700" }}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Meal-type picker sheet */}
      <Modal visible={mealTypePickerVisible} transparent animationType="fade" onRequestClose={onCloseMealTypePicker}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }} onPress={onCloseMealTypePicker}>
          <Pressable onPress={function (e) { e.stopPropagation(); }} style={{ backgroundColor: card, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 2, borderBottomWidth: 0, borderColor: theme.cardBorder, padding: 12 }}>
            <Text style={{ color: theme.textSoft, fontSize: 11, fontWeight: "800", letterSpacing: 1, textAlign: "center", paddingVertical: 8 }}>LOG THIS AS</Text>
            {MEAL_TYPES.map(function (type) {
              const selected = mealType === type;
              return (
                <Pressable
                  key={type}
                  onPress={function () { Haptics.selectionAsync(); onSelectMealType(type); }}
                  style={function (state: any) { return { flexDirection: "row", alignItems: "center", paddingVertical: 14, paddingHorizontal: 12, borderRadius: 12, backgroundColor: state.pressed ? theme.page : "transparent" }; }}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <ThemedIcon slot={`mealType.${type}`} size={32} />
                  <Text style={{ flex: 1, color: theme.textStrong, fontSize: 15, fontWeight: selected ? "800" : "600", marginLeft: 8 }}>{type[0].toUpperCase() + type.slice(1)}</Text>
                  {selected ? <Ionicons name="checkmark" size={20} color={theme.teal.solid} /> : null}
                </Pressable>
              );
            })}
            <Pressable onPress={onCloseMealTypePicker} style={{ paddingVertical: 12, alignItems: "center" }}>
              <Text style={{ color: theme.textSoft, fontSize: 14, fontWeight: "700" }}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Servings default prompt */}
      <Modal visible={servingsPromptName != null} transparent animationType="fade" onRequestClose={onCloseServingsPrompt}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: 24 }} onPress={onCloseServingsPrompt}>
          <Pressable onPress={function (e) { e.stopPropagation(); }} style={{ backgroundColor: card, borderRadius: 22, borderWidth: 2, borderColor: theme.cardBorder, padding: 16, gap: 10 }}>
            <Text style={{ color: theme.textStrong, fontSize: 15, fontWeight: "800" }}>Default servings for {servingsPromptName}</Text>
            <Text style={{ color: theme.textSoft, fontSize: 12 }}>
              Every time you tap this chip, log this many servings by default (0.25 – 10).
            </Text>
            <TextInput
              value={servingsInput}
              onChangeText={onServingsInputChange}
              keyboardType="decimal-pad"
              autoFocus
              returnKeyType="done"
              onSubmitEditing={onSaveServingsPrompt}
              style={{ borderWidth: 2, borderColor: theme.cardBorder, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, color: theme.textStrong, fontSize: 16 }}
            />
            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
              <Pressable onPress={onCloseServingsPrompt} style={{ paddingVertical: 10, paddingHorizontal: 14 }}>
                <Text style={{ color: theme.textSoft, fontSize: 14, fontWeight: "700" }}>Cancel</Text>
              </Pressable>
              <Pressable onPress={onSaveServingsPrompt} style={{ paddingVertical: 10, paddingHorizontal: 18, backgroundColor: theme.teal.solid, borderRadius: 12 }}>
                <Text style={{ color: "#fff", fontSize: 14, fontWeight: "800" }}>Save</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
