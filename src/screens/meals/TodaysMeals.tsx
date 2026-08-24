/**
 * TodaysMeals — the grouped, swipeable meal log card shown in MealsScreen.
 */
import React, { useRef } from "react";
import { View, Text, Pressable, Animated } from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { ShadowCard } from "../../components/ShadowCard";
import { GhostRow } from "../../components/GhostRow";
import { LoadingIndicator } from "../../components/LoadingIndicator";
import { MacroEditForm, type MacroValues } from "../../components/MacroEditForm";
import { ThemedIcon } from "../../theme/iconRegistry";
import { SPACING, RADIUS, FONT_SIZES } from "../../theme/tokens";
import { formatNutrition } from "../../utils/nutritionFormatter";
import { emojiForMealName } from "../../lib/mealEmoji";
import { MiniGlucoseChart, MealsEmptyState, type GlucoseReading } from "./MealCards";

// ─── Types ────────────────────────────────────────────────────────────────────

type MealType = "breakfast" | "lunch" | "dinner" | "snack";

export type Meal = {
  id: string;
  name: string;
  meal_type: string;
  carbs_g: number | null;
  sugar_g: number | null;
  calories: number | null;
  caffeine_mg: number | null;
  sodium_mg: number | null;
  logged_at?: string;
  servings?: number | null;
};

// ─── Color helpers ────────────────────────────────────────────────────────────

function mealSolidColor(type: string, theme: any): string {
  const map: Record<string, string> = {
    breakfast: theme.teal.solid,
    lunch: theme.coral.solid,
    dinner: theme.berry.solid,
    snack: theme.purple.solid,
  };
  return map[type] ?? theme.teal.solid;
}

function mealTintColor(type: string, theme: any): string {
  const map: Record<string, string> = {
    breakfast: theme.teal.tint,
    lunch: theme.coral.tint,
    dinner: theme.berry.tint,
    snack: theme.purple.tint,
  };
  return map[type] ?? theme.coral.tint;
}

const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

// ─── Props ────────────────────────────────────────────────────────────────────

export type TodaysMealsProps = {
  theme: any;
  ink: string;
  meals: Meal[];
  loadingMeals: boolean;
  mealsError: string | null;
  collapsedGroups: Set<MealType>;
  expandedMealId: string | null;
  editingMealId: string | null;
  glucoseData: Record<string, GlucoseReading[]>;
  loadingGlucose: Record<string, boolean>;
  glucoseErrors: Record<string, string>;
  tourHistoryRef: React.RefObject<View | null>;
  cardStyles: { cardTitle: any; sectionLabel: any; mealCard: any; mealContent: any; mealMain: any; iconBtn: any; glucosePanel: any };
  onToggleGroup: (groupType: MealType) => void;
  onToggleGlucose: (meal: Meal) => void;
  onOpenEdit: (meal: Meal) => void;
  onSaveEdit: (mealId: string, values: MacroValues) => void;
  onCancelEdit: () => void;
  onAddServing: (meal: Meal) => void;
  onDeleteMeal: (meal: Meal) => void;
  onOpenLogMeal: () => void;
  onRetryLoad: () => void;
};

// ─── TodaysMeals ─────────────────────────────────────────────────────────────

export function TodaysMeals({
  theme, ink, meals, loadingMeals, mealsError,
  collapsedGroups, expandedMealId, editingMealId,
  glucoseData, loadingGlucose, glucoseErrors,
  tourHistoryRef, cardStyles,
  onToggleGroup, onToggleGlucose, onOpenEdit, onSaveEdit, onCancelEdit,
  onAddServing, onDeleteMeal, onOpenLogMeal, onRetryLoad,
}: TodaysMealsProps) {
  const swipeableRefs = useRef<Record<string, Swipeable | null>>({});
  const mealCardScales = useRef<Map<string, Animated.Value>>(new Map());

  function renderDeleteAction(meal: Meal) {
    return (
      <Pressable
        onPress={function () {
          swipeableRefs.current[meal.id]?.close();
          onDeleteMeal(meal);
        }}
        style={{
          backgroundColor: theme.danger,
          justifyContent: "center",
          alignItems: "center",
          width: 80,
          borderRadius: RADIUS.md,
          marginLeft: SPACING.sm,
          marginTop: 10,
        }}
        accessibilityLabel={"Delete " + meal.name}
      >
        <Ionicons name="trash" size={18} color="#fff" />
        <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700", marginTop: 2 }}>Delete</Text>
      </Pressable>
    );
  }

  return (
    <View ref={tourHistoryRef}>
    <ShadowCard size="card" accent={theme.coral.solid} cardId="food_report">
      <Text style={{ fontSize: FONT_SIZES.subheading, fontWeight: "700", color: theme.textStrong, marginBottom: 4 }} allowFontScaling maxFontSizeMultiplier={1.4} accessibilityRole="header">Today's meals</Text>

      {mealsError ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: theme.coral.tint, borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: theme.coral.solid, padding: 10, marginTop: 6 }}>
          <Ionicons name="alert-circle-outline" size={16} color={theme.coral.solid} />
          <Text style={{ color: theme.coral.sub, fontSize: FONT_SIZES.body, flex: 1 }}>Couldn't load meals</Text>
          <Pressable onPress={onRetryLoad} hitSlop={8} accessibilityRole="button" accessibilityLabel="Retry loading meals">
            <Text style={{ color: theme.coral.solid, fontSize: FONT_SIZES.body, fontWeight: "800" }}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      {loadingMeals ? (
        <View style={{ marginTop: 10, gap: 8 }}>
          <ShadowCard skeleton skeletonHeight={48} />
          <ShadowCard skeleton skeletonHeight={48} />
          <ShadowCard skeleton skeletonHeight={48} />
        </View>
      ) : meals.length === 0 ? (
        <GhostRow label="Nothing logged yet today" action={{ label: "Log a meal", onPress: onOpenLogMeal }} />
      ) : (
        MEAL_TYPES.filter(mt => meals.some(m => m.meal_type === mt)).map(function (groupType) {
          const groupMeals = meals.filter(m => m.meal_type === groupType);
          const isCollapsed = collapsedGroups.has(groupType);
          const groupColor = mealSolidColor(groupType, theme);
          const groupCals = groupMeals.reduce((s, m) => s + (Number(m.calories ?? 0) * (Number(m.servings) || 1)), 0);
          return (
            <View key={groupType} style={{ marginTop: 8 }}>
              <Pressable
                onPress={function () {
                  Haptics.selectionAsync();
                  onToggleGroup(groupType);
                }}
                style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 }}
                accessibilityRole="button"
                accessibilityLabel={`${groupType}, ${groupMeals.length} ${groupMeals.length === 1 ? "entry" : "entries"}, ${groupCals} calories. ${isCollapsed ? "Collapsed, double tap to expand" : "Expanded, double tap to collapse"}.`}
                hitSlop={6}
              >
                <ThemedIcon slot={`mealType.${groupType}`} size={22} color={groupColor} />
                <Text style={{ color: theme.textStrong, fontSize: FONT_SIZES.micro, fontWeight: "900", letterSpacing: 0.6, flex: 1 }} allowFontScaling maxFontSizeMultiplier={1.3}>
                  {groupType.toUpperCase()} · {groupMeals.length}
                </Text>
                {groupCals > 0 ? (
                  <Text style={{ color: theme.textSoft, fontSize: FONT_SIZES.caption, fontWeight: "700" }} allowFontScaling maxFontSizeMultiplier={1.3}>
                    {groupCals} cal
                  </Text>
                ) : null}
                <Ionicons name={isCollapsed ? "chevron-down" : "chevron-up"} size={14} color={theme.textSoft} />
              </Pressable>
              {isCollapsed ? null : groupMeals.map(function (meal) {
                const nutrition = formatNutrition(meal.carbs_g, meal.sugar_g, meal.calories, meal.caffeine_mg, meal.sodium_mg);
                const isExpanded = expandedMealId === meal.id;
                const isEditing = editingMealId === meal.id;
                const readings = glucoseData[meal.id] ?? [];
                const isLoadingG = loadingGlucose[meal.id] ?? false;
                const gError = glucoseErrors[meal.id];
                const mealColor = mealSolidColor(meal.meal_type, theme);
                if (!mealCardScales.current.has(meal.id)) {
                  mealCardScales.current.set(meal.id, new Animated.Value(1));
                }
                const mealScale = mealCardScales.current.get(meal.id)!;
                const cals = meal.calories != null ? Math.round(Number(meal.calories) * (Number(meal.servings) || 1)) : null;

                return (
                  <Swipeable
                    key={meal.id}
                    ref={function (r) { swipeableRefs.current[meal.id] = r; }}
                    renderRightActions={function () { return renderDeleteAction(meal); }}
                    overshootRight={false}
                    friction={2}
                  >
                    <Animated.View style={{ transform: [{ scale: mealScale }] }}>
                    <View style={[cardStyles.mealCard, { borderColor: ink, backgroundColor: mealTintColor(meal.meal_type, theme) }]}>
                      {/* Collapsed row — single line: emoji + name + cal right-aligned + actions */}
                      <View style={cardStyles.mealContent}>
                        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: mealColor, alignItems: "center", justifyContent: "center" }}>
                          <Text style={{ fontSize: 18 }}>{emojiForMealName(meal.name)}</Text>
                        </View>

                        <Pressable
                          style={cardStyles.mealMain}
                          onPress={function () { onToggleGlucose(meal); }}
                          onPressIn={function () { Animated.spring(mealScale, { toValue: 0.98, useNativeDriver: true, speed: 300, bounciness: 4 }).start(); }}
                          onPressOut={function () { Animated.spring(mealScale, { toValue: 1, useNativeDriver: true, speed: 300, bounciness: 4 }).start(); }}
                          accessibilityLabel={`${meal.name}${cals != null ? `, ${cals} calories` : ""}${nutrition ? `, ${nutrition}` : ""}. ${isExpanded && !isEditing ? "Collapse" : "Expand"} to see details.`}
                        >
                          <Text style={{ color: theme.textStrong, fontSize: FONT_SIZES.body, fontWeight: "600", flex: 1 }} numberOfLines={1}>{meal.name}</Text>
                          {cals != null ? (
                            <Text style={{ color: theme.textSoft, fontSize: FONT_SIZES.caption, fontWeight: "700", marginLeft: 8 }} numberOfLines={1}>{cals} cal</Text>
                          ) : null}
                          <Ionicons name={isExpanded && !isEditing ? "chevron-up" : "chevron-down"} size={13} color={theme.textSoft} style={{ marginLeft: 4 }} />
                        </Pressable>

                        <Pressable onPress={function () { onOpenEdit(meal); }} style={cardStyles.iconBtn} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Edit ${meal.name}`}>
                          <Ionicons name="pencil-outline" size={15} color={isEditing ? theme.coral.solid : theme.textSoft} />
                        </Pressable>
                        <Pressable onPress={function () { onDeleteMeal(meal); }} style={cardStyles.iconBtn} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Delete ${meal.name}`}>
                          <Ionicons name="trash-outline" size={15} color={theme.coral.solid} />
                        </Pressable>
                      </View>

                      {/* Expanded panel — macros + glucose + edit form */}
                      {isEditing ? (
                        <View style={[cardStyles.glucosePanel, { borderTopColor: theme.cardBorder }]}>
                          <MacroEditForm
                            initial={{ name: meal.name, carbs_g: meal.carbs_g, sugar_g: meal.sugar_g, calories: meal.calories, caffeine_mg: meal.caffeine_mg, sodium_mg: meal.sodium_mg, servings: meal.servings ?? 1 }}
                            saveLabel="Save"
                            onSave={function (values) { onSaveEdit(meal.id, values); }}
                            onCancel={onCancelEdit}
                          />
                        </View>
                      ) : isExpanded ? (
                        <View style={[cardStyles.glucosePanel, { borderTopColor: theme.cardBorder }]}>
                          {nutrition ? (
                            <Text style={{ color: theme.textSoft, fontSize: FONT_SIZES.caption, marginBottom: 8 }}>
                              {nutrition}{Number(meal.servings) > 1 ? "  ·  ×" + Number(meal.servings) + " servings" : ""}
                            </Text>
                          ) : null}
                          <Pressable onPress={function () { onAddServing(meal); }} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Add a serving to ${meal.name}`} style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 8 }}>
                            <Ionicons name="add-circle-outline" size={15} color={theme.teal.solid} />
                            <Text style={{ color: theme.teal.solid, fontSize: FONT_SIZES.caption, fontWeight: "700" }}>Add serving</Text>
                          </Pressable>
                          {isLoadingG ? (
                            <LoadingIndicator style={{ marginVertical: 10 }} />
                          ) : gError ? (
                            <Text style={{ color: theme.coral.sub, fontSize: FONT_SIZES.caption }}>{gError}</Text>
                          ) : (
                            <MiniGlucoseChart readings={readings} mealLoggedAt={meal.logged_at ?? null} />
                          )}
                        </View>
                      ) : null}
                    </View>
                    </Animated.View>
                  </Swipeable>
                );
              })}
            </View>
          );
        })
      )}
    </ShadowCard>
    </View>
  );
}
