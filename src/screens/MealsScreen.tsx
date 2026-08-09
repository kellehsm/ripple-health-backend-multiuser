import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useTabPreferences } from "../hooks/useTabPreferences";
import {
  ScrollView,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  Dimensions,
  RefreshControl,
  Animated
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { LoadingIndicator } from "../components/LoadingIndicator";
import * as Haptics from "expo-haptics";
import notifee from "@notifee/react-native";
import Svg, { Polyline, Text as SvgText, Path, Ellipse, Line } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { onSolid } from "../theme/colorUtils";
import { coloredShadow } from "../theme/styleUtils";
import { ShadowCard } from "../components/ShadowCard";
import { IconBadge } from "../components/IconBadge";
import { api } from "../api/client";

import { Swipeable } from "react-native-gesture-handler";
import { SPACING, RADIUS } from "../theme/tokens";
import { BarcodeScannerModal } from "../components/BarcodeScannerModal";
import { PhotoScannerModal } from "../components/PhotoScannerModal";
import { invalidateBarcodeCache } from "../utils/barcodeCache";
import { RecipeBuilderModal, Recipe } from "../components/RecipeBuilderModal";
import { toast, Msg } from "../lib/toast";
import { UndoBanner } from "../components/UndoBanner";
import { TooltipBubble } from "../components/TooltipBubble";
import { hasSeenTooltip, markTooltipSeen } from "../utils/tooltipSeen";
import { SectionEditorModal, SectionDef } from "../components/SectionEditorModal";
import { FeatureTour, TourStep } from "../components/FeatureTour";
import { ScreenBackground } from "../components/ScreenBackground";
import { formatNutrition } from "../utils/nutritionFormatter";
import { MEALS_SECTIONS } from "../constants";
import {
  type SubstanceType,
  type SubstanceResult,
  type SubstancePending,
  type SubstanceEntry,
  type SubstanceTotals,
} from "../types/substances";
import { CaffeineForm } from "../components/CaffeineForm";
import { AlcoholForm } from "../components/AlcoholForm";
import { MacroEditForm, type MacroValues } from "../components/MacroEditForm";

// ─────────────────────────────────────────────────────────────────────────────

type MealType = "breakfast" | "lunch" | "dinner" | "snack";

type FrequentMeal = {
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

type FoodResult = {
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

type Meal = {
  id: string;
  name: string;
  meal_type: string;
  carbs_g: number | null;
  sugar_g: number | null;
  calories: number | null;
  caffeine_mg: number | null;
  sodium_mg: number | null;
  logged_at?: string;
};

type PendingFood = {
  name: string;
  carbs_g: number | null;
  sugar_g: number | null;
  calories: number | null;
  caffeine_mg: number | null;
  sodium_mg: number | null;
  source_food_id?: string;
  source_db?: string;
  barcode?: string;
};

type QuickDrink = {
  name: string;
  calories: number | null;
  caffeine_mg: number | null;
  carbs_g: number | null;
  sugar_g: number | null;
  sodium_mg: number | null;
};

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

type GlucoseReading = {
  recorded_at: string;
  mg_dl: number;
};

const SCREEN_WIDTH = Dimensions.get("window").width;
const MINI_CHART_WIDTH = SCREEN_WIDTH - 96;
const MINI_CHART_HEIGHT = 100;
const MC_PAD_LEFT = 24;
const MC_PAD_BOTTOM = 16;
const MC_PAD_TOP = 10;

const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

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

function chipColors(i: number, theme: any): { bg: string; fg: string; sub: string } {
  const palette = [
    { bg: theme.teal.tint, fg: theme.teal.fg, sub: theme.teal.sub },
    { bg: theme.coral.tint, fg: theme.coral.fg, sub: theme.coral.sub },
    { bg: theme.purple.tint, fg: theme.purple.fg, sub: theme.purple.sub },
    { bg: theme.berry.tint, fg: theme.berry.fg, sub: theme.berry.sub },
  ];
  return palette[i % palette.length];
}

function buildMiniPoints(
  readings: GlucoseReading[],
  windowStart: number,
  windowEnd: number,
  minVal: number,
  maxVal: number
): string {
  const windowMs = windowEnd - windowStart;
  if (windowMs === 0) return "";
  const usableWidth = MINI_CHART_WIDTH - MC_PAD_LEFT;
  const usableHeight = MINI_CHART_HEIGHT - MC_PAD_TOP - MC_PAD_BOTTOM;
  return readings
    .map(function (r) {
      const t = new Date(r.recorded_at).getTime();
      const x = MC_PAD_LEFT + ((t - windowStart) / windowMs) * usableWidth;
      const y =
        MC_PAD_TOP +
        usableHeight -
        ((Number(r.mg_dl) - minVal) / (maxVal - minVal)) * usableHeight;
      return x + "," + y;
    })
    .join(" ");
}


function MiniGlucoseChart({
  readings,
  mealLoggedAt,
}: {
  readings: GlucoseReading[];
  mealLoggedAt: string | null;
}) {
  const { theme } = useTheme();
  const ink = theme.ink;
  if (readings.length === 0) {
    return (
      <Text style={{ color: theme.textSoft, fontSize: 12 }}>
        No glucose readings found for this meal window.
      </Text>
    );
  }

  const values = readings.map(function (r) { return Number(r.mg_dl); });
  const minVal = Math.min.apply(null, values.concat([70])) - 5;
  const maxVal = Math.max.apply(null, values.concat([140])) + 10;
  const times = readings.map(function (r) { return new Date(r.recorded_at).getTime(); });
  const windowStart = Math.min.apply(null, times);
  const windowEnd = Math.max.apply(null, times);
  const points = buildMiniPoints(readings, windowStart, windowEnd, minVal, maxVal);

  const peakIdx = values.indexOf(Math.max.apply(null, values));
  const peakVal = values[peakIdx];
  const peakTime = times[peakIdx];

  let summaryText = "Peak: " + peakVal + " mg/dL";
  if (mealLoggedAt) {
    const mealTime = new Date(mealLoggedAt).getTime();
    const minutesAfter = Math.round((peakTime - mealTime) / 60000);
    if (minutesAfter > 0) {
      summaryText = "Peaked at " + peakVal + " mg/dL, " + minutesAfter + " min after eating";
    }
  }

  const isHighResponse = peakVal > 180;
  const chartLineColor = isHighResponse ? theme.red.solid : theme.berry.sub;

  return (
    <View style={{ marginTop: 4, borderRadius: 12, borderWidth: isHighResponse ? 1.5 : 0, borderColor: isHighResponse ? theme.red.solid : "transparent", padding: isHighResponse ? 4 : 0 }}>
      {isHighResponse && (
        <Text style={{ color: theme.red.fg, fontSize: 10, fontWeight: "700", marginBottom: 2 }}>⚠ HIGH RESPONSE ({peakVal} mg/dL)</Text>
      )}
      {points.length > 0 && (
        <Svg width={MINI_CHART_WIDTH} height={MINI_CHART_HEIGHT}>
          <SvgText x={0} y={MC_PAD_TOP + 6} fontSize={9} fill={theme.textSoft}>{Math.round(maxVal)}</SvgText>
          <SvgText x={0} y={MINI_CHART_HEIGHT - MC_PAD_BOTTOM} fontSize={9} fill={theme.textSoft}>{Math.round(minVal)}</SvgText>
          <Polyline points={points} fill="none" stroke={ink} strokeWidth={2.5} />
          <Polyline points={points} fill="none" stroke={chartLineColor} strokeWidth={1.5} />
        </Svg>
      )}
      <Text style={{ color: theme.textSoft, fontSize: 11, marginTop: 4 }}>{summaryText}</Text>
    </View>
  );
}

function MealsEmptyState({ onPress }: { onPress: () => void }) {
  const { theme } = useTheme();
  const c = theme.coral.solid;
  return (
    <View style={{ alignItems: "center", paddingVertical: 48 }}>
      <Svg width={120} height={100} viewBox="0 0 120 100">
        <Ellipse cx="60" cy="62" rx="40" ry="12" fill={c} opacity={0.18} />
        <Path d="M30 55 Q30 30 60 30 Q90 30 90 55" stroke={c} strokeWidth="5" fill="none" opacity={0.7} strokeLinecap="round" />
        <Line x1="24" y1="55" x2="96" y2="55" stroke={c} strokeWidth="5" strokeLinecap="round" opacity={0.7} />
        <Line x1="60" y1="55" x2="60" y2="20" stroke={c} strokeWidth="3" strokeLinecap="round" opacity={0.45} />
        <Line x1="48" y1="20" x2="72" y2="20" stroke={c} strokeWidth="3" strokeLinecap="round" opacity={0.45} />
      </Svg>
      <Text style={{ fontSize: 16, fontWeight: "700", color: theme.textStrong, marginTop: 16 }}>Nothing logged yet</Text>
      <Text style={{ fontSize: 13, color: theme.textSoft, marginTop: 6, textAlign: "center", maxWidth: 240 }}>
        Add your first meal to start tracking how food affects your day
      </Text>
      <Pressable
        onPress={() => { Haptics.selectionAsync(); onPress(); }}
        style={{ marginTop: 20, paddingHorizontal: 20, paddingVertical: 11, borderRadius: 22, borderWidth: 2, borderColor: theme.ink, backgroundColor: theme.coral.solid }}
      >
        <Text style={{ fontWeight: "700", color: onSolid(theme.coral.solid) }}>Log a meal</Text>
      </Pressable>
    </View>
  );
}

export function MealsScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<any>();
  const { preferences, loading: prefsLoading } = useTabPreferences();
  const ink = theme.ink;
  const card = theme.card;
  const styles = useMemo(() => makeStyles(ink, card, theme.cardBorder), [ink, card, theme.cardBorder]);

  const [showTooltip, setShowTooltip] = useState(false);
  const [hiddenSections, setHiddenSections] = useState<string[]>([]);
  const [showSectionEditor, setShowSectionEditor] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const [tourPadding, setTourPadding] = useState(0);
  const tourLogRef = useRef<View>(null);
  const tourHistoryRef = useRef<View>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const scrollOffsetRef = useRef(0);
  const chipScales = useRef<Map<string, Animated.Value>>(new Map());
  const recipeScales = useRef<Map<string, Animated.Value>>(new Map());
  const mealCardScales = useRef<Map<string, Animated.Value>>(new Map());
  const [hiddenFrequent, setHiddenFrequent] = useState<Set<string>>(new Set());

  const MEALS_TOUR: TourStep[] = [
    { ref: tourLogRef,     title: "Log a Meal",   body: "Search thousands of foods, scan a barcode, or pick from your saved usuals. Tap a meal type first to categorise it." },
    { ref: tourHistoryRef, title: "Today's Meals", body: "Everything you've logged today appears here. Tap any entry to edit or delete it." },
  ];

  useFocusEffect(useCallback(() => {
    if (prefsLoading) return;
    if (!preferences.selectedModules.includes('meals')) {
      navigation.navigate('Home');
    }
    let cancelled = false;
    hasSeenTooltip("meals").then(seen => {
      if (!cancelled && !seen) {
        setShowTooltip(true);
        markTooltipSeen("meals");
      }
    });
    hasSeenTooltip("meals-tour").then(seen => {
      if (!cancelled && !seen) { markTooltipSeen("meals-tour"); setTimeout(() => setShowTour(true), 600); }
    });
    api.getSettings().then((s: any) => {
      if (!cancelled) setHiddenSections(s?.meals_hidden_sections ?? []);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [prefsLoading, preferences.selectedModules]));

  async function handleSaveSections(newHidden: string[]) {
    setHiddenSections(newHidden);
    setShowSectionEditor(false);
    try { await api.patchSettings({ meals_hidden_sections: newHidden }); } catch (_) {}
  }

  const [mealType, setMealType] = useState<MealType>("breakfast");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<FoodResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [meals, setMeals] = useState<Meal[]>([]);
  const [loadingMeals, setLoadingMeals] = useState(true);
  const [mealsError, setMealsError] = useState<string | null>(null);

  const [scannerVisible, setScannerVisible] = useState(false);
  const [subScannerVisible, setSubScannerVisible] = useState(false);
  const [photoScannerVisible, setPhotoScannerVisible] = useState(false);
  const [pendingFood, setPendingFood] = useState<PendingFood | null>(null);
  const [editingMealId, setEditingMealId] = useState<string | null>(null);
  const [frequentMeals, setFrequentMeals] = useState<FrequentMeal[]>([]);
  const [impactScores, setImpactScores] = useState<Record<string, number>>({});
  const [foodReport, setFoodReport] = useState<Array<{ meal_name: string; avg_spike: number; sample_count: number }>>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedMealId, setExpandedMealId] = useState<string | null>(null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [showRecipeBuilder, setShowRecipeBuilder] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
  const [glucoseData, setGlucoseData] = useState<Record<string, GlucoseReading[]>>({});
  const [loadingGlucose, setLoadingGlucose] = useState<Record<string, boolean>>({});
  const [glucoseErrors, setGlucoseErrors] = useState<Record<string, string>>({});

  // ── Substance state (alcohol only) ───────────────────────────────────────
  const [subQuery, setSubQuery] = useState("");
  const [subResults, setSubResults] = useState<SubstanceResult[]>([]);
  const [subSearching, setSubSearching] = useState(false);
  const [subSearchError, setSubSearchError] = useState<string | null>(null);
  const [pendingSub, setPendingSub] = useState<SubstancePending | null>(null);
  const [subEntries, setSubEntries] = useState<SubstanceEntry[]>([]);
  const [subTotals, setSubTotals] = useState<SubstanceTotals>({ caffeine_mg: 0, standard_drinks: 0 });
  const [subLoading, setSubLoading] = useState(false);

  type UndoMeal =
    | { type: "meal"; data: Meal; timer: ReturnType<typeof setTimeout> }
    | { type: "substance"; data: SubstanceEntry; timer: ReturnType<typeof setTimeout> };
  const [undoMeal, setUndoMeal] = useState<UndoMeal | null>(null);

  const loadMeals = useCallback(function () {
    const today = new Date().toISOString().split("T")[0];
    setLoadingMeals(true);
    setMealsError(null);
    api.meals(today)
      .then(function (data: Meal[]) { setMeals(Array.isArray(data) ? data : []); })
      .catch(function (e: Error) { setMealsError(e.message || "Failed to load meals"); })
      .finally(function () { setLoadingMeals(false); });
  }, []);

  const loadSubstances = useCallback(function () {
    const today = new Date().toISOString().split("T")[0];
    setSubLoading(true);
    api.substancesToday(today)
      .then(function (data: { entries: SubstanceEntry[]; totals: SubstanceTotals }) {
        setSubEntries(Array.isArray(data?.entries) ? data.entries : []);
        if (data?.totals) setSubTotals(data.totals);
      })
      .catch(function () {})
      .finally(function () { setSubLoading(false); });
  }, []);

  useEffect(function () {
    loadMeals();
    loadSubstances();
    // Load hidden frequent meal names first, then filter the list on arrival
    AsyncStorage.getItem("ripple_hidden_frequent")
      .then(function (raw) {
        const hidden = new Set<string>(raw ? JSON.parse(raw) : []);
        setHiddenFrequent(hidden);
        return hidden;
      })
      .catch(function () { return new Set<string>(); })
      .then(function (hidden) {
        api.frequentMeals()
          .then(function (data) {
            const all: FrequentMeal[] = Array.isArray(data) ? data : [];
            setFrequentMeals(all.filter(function (m) { return !hidden.has(m.name); }));
          })
          .catch(function () {});
      });
    api.recipes()
      .then(function (data: Recipe[]) { setRecipes(Array.isArray(data) ? data : []); })
      .catch(function () {});
    api.getMealImpactScores()
      .then(function (data: { scores: Array<{ meal_name: string; avg_spike: number; sample_count: number }> }) {
        if (data?.scores) {
          const map: Record<string, number> = {};
          data.scores.forEach(function (s) { map[s.meal_name] = s.avg_spike; });
          setImpactScores(map);
          setFoodReport(data.scores);
        }
      })
      .catch(function () {});
  }, [loadMeals, loadSubstances]);

  const foodDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const foodSearchSeqRef = useRef(0);

  function handleSearch(query?: string) {
    const q = (query ?? searchQuery).trim();
    if (!q) return;
    const seq = ++foodSearchSeqRef.current;
    setSearching(true);
    setSearchError(null);
    setSearchResults([]);
    setPendingFood(null);
    api.searchFood(q)
      .then(function (data: FoodResult[]) {
        if (seq !== foodSearchSeqRef.current) return;
        setSearchResults(Array.isArray(data) ? data : []);
      })
      .catch(function (e: Error) {
        if (seq !== foodSearchSeqRef.current) return;
        setSearchError(e.message || "Food search failed");
      })
      .finally(function () {
        if (seq === foodSearchSeqRef.current) setSearching(false);
      });
  }

  function handleFoodQueryChange(text: string) {
    setSearchQuery(text);
    if (foodDebounceRef.current) clearTimeout(foodDebounceRef.current);
    if (!text.trim()) { setSearchResults([]); return; }
    foodDebounceRef.current = setTimeout(function () { handleSearch(text); }, 450);
  }

  function handleSelectFood(food: FoodResult) {
    setPendingFood({
      name: food.name,
      carbs_g: food.carbs_g,
      sugar_g: food.sugar_g,
      calories: food.calories,
      caffeine_mg: food.caffeine_mg ?? null,
      sodium_mg: food.sodium_mg ?? null,
      source_food_id: food.source_food_id,
      source_db: food.source_db,
      barcode: food.barcode,
    });
  }

  function handleSelectFrequent(meal: FrequentMeal) {
    setSearchResults([]);
    setSearchQuery("");
    setPendingFood({
      name: meal.name,
      carbs_g: meal.carbs_g,
      sugar_g: meal.sugar_g,
      calories: meal.calories,
      caffeine_mg: meal.caffeine_mg ?? null,
      sodium_mg: meal.sodium_mg ?? null,
      source_food_id: meal.source_food_id ?? undefined,
      source_db: meal.source_db ?? "manual",
    });
  }

  function handleQuickDrink(drink: QuickDrink) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    api.addMeal({
      meal_type: mealType,
      name: drink.name,
      carbs_g: drink.carbs_g,
      sugar_g: drink.sugar_g,
      calories: drink.calories,
      caffeine_mg: drink.caffeine_mg,
      sodium_mg: drink.sodium_mg,
      source_db: "manual",
    })
      .then(function () {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        toast(drink.name + " logged.");
        loadMeals();
      })
      .catch(function () { toast("Couldn't log that drink. Try again.", "error"); });
  }

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await Promise.all([
        loadMeals(),
        loadSubstances(),
        api.frequentMeals().then(d => setFrequentMeals(Array.isArray(d) ? d : [])).catch(() => {}),
        api.recipes().then((d: Recipe[]) => setRecipes(Array.isArray(d) ? d : [])).catch(() => {}),
      ]);
    } finally {
      setRefreshing(false);
    }
  }

  function handleLogRecipe(recipe: Recipe) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    api.addMeal({
      name: recipe.name,
      meal_type: mealType,
      carbs_g: recipe.carbs_g,
      sugar_g: recipe.sugar_g,
      calories: recipe.calories,
      caffeine_mg: null,
      sodium_mg: null,
      source_db: "recipe",
    })
      .then(function () {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        toast("Meal logged.");
        loadMeals();
      })
      .catch(function () { toast("Couldn't log that recipe. Try again.", "error"); });
  }

  function handleEditRecipe(recipe: Recipe) {
    setEditingRecipe(recipe);
    setShowRecipeBuilder(true);
  }

  function handleSavePending(values: MacroValues) {
    if (!pendingFood) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSearchError(null);

    // Save correction if this came from a barcode scan and the user changed any value
    const barcode = pendingFood.barcode;
    if (barcode && pendingFood.source_db !== "manual" && pendingFood.source_db !== "user_correction") {
      const changed =
        values.name !== pendingFood.name ||
        values.carbs_g !== pendingFood.carbs_g ||
        values.calories !== pendingFood.calories ||
        values.sugar_g !== pendingFood.sugar_g ||
        values.caffeine_mg !== pendingFood.caffeine_mg;
      if (changed) {
        invalidateBarcodeCache(barcode);
        api.saveBarcodeCorrection(barcode, {
          name: values.name,
          carbs_g: values.carbs_g,
          calories: values.calories,
          sugar_g: values.sugar_g,
          caffeine_mg: values.caffeine_mg,
        }).catch(function () {});
      }
    }

    const todayDuplicate = meals.find(
      (m) => m.name.toLowerCase().trim() === (values.name ?? "").toLowerCase().trim()
    );
    if (todayDuplicate) {
      Alert.alert(
        "Already logged today",
        `You already logged "${values.name}" today. Add it again?`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Log again", onPress: () => doAddMeal(values) },
        ]
      );
      return;
    }
    doAddMeal(values);
  }

  function doAddMeal(values: MacroValues) {
    if (!pendingFood) return;
    api.addMeal({
      meal_type: mealType,
      source_food_id: pendingFood.source_food_id,
      source_db: pendingFood.source_db ?? "manual",
      name: values.name,
      carbs_g: values.carbs_g,
      sugar_g: values.sugar_g,
      calories: values.calories,
      caffeine_mg: values.caffeine_mg,
      sodium_mg: values.sodium_mg,
    })
      .then(function () {
        setPendingFood(null);
        setSearchQuery("");
        setSearchResults([]);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        toast("Meal logged.");
        loadMeals();
        const h = new Date().getHours();
        const periodKey = h >= 4 && h < 11 ? "breakfast" : h >= 11 && h < 15 ? "lunch" : h >= 17 && h < 23 ? "dinner" : null;
        if (periodKey) notifee.cancelNotification(`meal-reminder-${periodKey}`).catch(() => {});
      })
      .catch(function () { setSearchError("Your meal wasn't saved. Try again — nothing was lost."); });
  }

  function handleOpenEdit(meal: Meal) {
    setEditingMealId(meal.id);
    if (expandedMealId === meal.id) setExpandedMealId(null);
  }

  function handleSaveEdit(mealId: string, values: MacroValues) {
    api.updateMeal(mealId, values)
      .then(function () { setEditingMealId(null); loadMeals(); })
      .catch(function () { toast("Couldn't save that change. Try again.", "error"); });
  }

  function handleDeleteMeal(meal: Meal) {
    if (undoMeal) clearTimeout(undoMeal.timer);
    if (expandedMealId === meal.id) setExpandedMealId(null);
    if (editingMealId === meal.id) setEditingMealId(null);
    setMeals((prev) => prev.filter((m) => m.id !== meal.id));
    const timer = setTimeout(async () => {
      setUndoMeal(null);
      try { await api.deleteMeal(meal.id); }
      catch (e: any) { setMealsError(e.message || "Failed to delete meal"); loadMeals(); }
    }, 5000);
    setUndoMeal({ type: "meal", data: meal, timer });
  }

  const swipeableRefs = useRef<Record<string, Swipeable | null>>({});

  function renderMealRightActions(meal: Meal) {
    return (
      <Pressable
        onPress={function () {
          swipeableRefs.current[meal.id]?.close();
          handleDeleteMeal(meal);
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

  // ── Substance handlers ────────────────────────────────────────────────────

  const subDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const subSearchSeqRef = useRef(0);

  function handleSubSearch(query?: string) {
    const q = (query ?? subQuery).trim();
    if (!q) return;
    const seq = ++subSearchSeqRef.current;
    setSubSearching(true);
    setSubSearchError(null);
    setPendingSub(null);
    api.searchSubstances(q, "alcohol")
      .then(function (data: SubstanceResult[]) {
        if (seq !== subSearchSeqRef.current) return;
        setSubResults(Array.isArray(data) ? data : []);
      })
      .catch(function (e: Error) {
        if (seq !== subSearchSeqRef.current) return;
        setSubSearchError(e.message || "Search failed");
      })
      .finally(function () {
        if (seq === subSearchSeqRef.current) setSubSearching(false);
      });
  }

  function handleSubQueryChange(text: string) {
    setSubQuery(text);
    if (subDebounceRef.current) clearTimeout(subDebounceRef.current);
    if (!text.trim()) { setSubResults([]); return; }
    subDebounceRef.current = setTimeout(function () { handleSubSearch(text); }, 450);
  }

  function handleSelectSubResult(result: SubstanceResult) {
    setSubResults([]);
    setPendingSub({
      name: result.name,
      substance_type: "alcohol",
      caffeine_mg: result.caffeine_mg ?? null,
      abv_percent: result.abv_percent ?? null,
      volume_ml: null,
      source_food_id: result.source_food_id,
      source_db: result.source_db,
      barcode: result.barcode,
      original_caffeine_mg: result.caffeine_mg ?? null,
      original_abv_percent: result.abv_percent ?? null,
    });
  }

  function handleLogSubstance(values: SubstancePending) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Save correction if barcode-scanned and user changed the substance value
    const barcode = values.barcode;
    if (barcode && values.source_db !== "manual" && values.source_db !== "user_correction") {
      const cafChanged = values.caffeine_mg !== values.original_caffeine_mg;
      const abvChanged = values.abv_percent !== values.original_abv_percent;
      if (cafChanged || abvChanged) {
        invalidateBarcodeCache(barcode);
        api.saveBarcodeCorrection(barcode, {
          name: values.name,
          caffeine_mg: values.caffeine_mg,
          abv_percent: values.abv_percent,
        }).catch(function () {});
      }
    }

    api.logSubstance({
      substance_type: values.substance_type,
      name: values.name,
      caffeine_mg: values.caffeine_mg,
      abv_percent: values.abv_percent,
      volume_ml: values.volume_ml,
      source_db: values.source_db ?? "manual",
    })
      .then(function () {
        setPendingSub(null);
        setSubQuery("");
        setSubResults([]);
        loadSubstances();
      })
      .catch(function (e: Error) { setSubSearchError(e.message || "Failed to log"); });
  }

  function handleDeleteSubstance(entry: SubstanceEntry) {
    if (undoMeal) clearTimeout(undoMeal.timer);
    setSubEntries((prev) => prev.filter((e) => e.id !== entry.id));
    const timer = setTimeout(async () => {
      setUndoMeal(null);
      try { await api.deleteSubstance(entry.id); }
      catch { loadSubstances(); }
    }, 4000);
    setUndoMeal({ type: "substance", data: entry, timer });
  }

  function handleUndoMealDelete() {
    if (!undoMeal) return;
    clearTimeout(undoMeal.timer);
    if (undoMeal.type === "meal") {
      setMeals((prev) => [...prev, undoMeal.data as Meal]);
    } else {
      setSubEntries((prev) => [...prev, undoMeal.data as SubstanceEntry]);
    }
    setUndoMeal(null);
  }

  function handleToggleGlucose(meal: Meal) {
    if (editingMealId === meal.id) return;
    if (expandedMealId === meal.id) { setExpandedMealId(null); return; }
    setExpandedMealId(meal.id);
    if (glucoseData[meal.id] !== undefined) return;

    setLoadingGlucose(function (prev) { return Object.assign({}, prev, { [meal.id]: true }); });
    api.mealGlucoseResponse(meal.id)
      .then(function (data) {
        const readings: GlucoseReading[] = Array.isArray(data)
          ? data : Array.isArray(data?.readings) ? data.readings : [];
        setGlucoseData(function (prev) { return Object.assign({}, prev, { [meal.id]: readings }); });
      })
      .catch(function (e: Error) {
        setGlucoseErrors(function (prev) { return Object.assign({}, prev, { [meal.id]: e.message || "Failed to load glucose data" }); });
      })
      .finally(function () {
        setLoadingGlucose(function (prev) { return Object.assign({}, prev, { [meal.id]: false }); });
      });
  }

  const totals = meals.length > 0 ? {
    calories: meals.some(function (m) { return m.calories != null; })
      ? Math.round(meals.reduce(function (s, m) { return s + (Number(m.calories) || 0); }, 0)) : null,
    carbs: meals.some(function (m) { return m.carbs_g != null; })
      ? Math.round(meals.reduce(function (s, m) { return s + (Number(m.carbs_g) || 0); }, 0)) : null,
    sugar: meals.some(function (m) { return m.sugar_g != null; })
      ? Math.round(meals.reduce(function (s, m) { return s + (Number(m.sugar_g) || 0); }, 0)) : null,
    caffeine: meals.some(function (m) { return m.caffeine_mg != null; })
      ? Math.round(meals.reduce(function (s, m) { return s + (Number(m.caffeine_mg) || 0); }, 0)) : null,
    sodium: meals.some(function (m) { return m.sodium_mg != null; })
      ? Math.round(meals.reduce(function (s, m) { return s + (Number(m.sodium_mg) || 0); }, 0)) : null,
  } : null;

  return (
    <View style={{ flex: 1 }}>
    <LinearGradient colors={[theme.page, theme.gradientEnd]} style={{ flex: 1 }}>
    <ScreenBackground pageId="meals" />
    <ScrollView
      ref={scrollViewRef}
      style={{ backgroundColor: "transparent" }}
      contentContainerStyle={[styles.content, tourPadding > 0 && { paddingBottom: tourPadding }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.teal.bar} colors={[theme.teal.bar]} />}
      scrollEventThrottle={16}
      onScroll={(e) => { scrollOffsetRef.current = e.nativeEvent.contentOffset.y; }}
    >
      {showTooltip && (
        <TooltipBubble
          message="Log meals, drinks, and snacks here. Tap + to add by name, scan a barcode, or pick from your frequent items. Swipe or hold entries to edit or delete."
          onDismiss={() => setShowTooltip(false)}
        />
      )}
      {/* Section editor pencil */}
      <View style={{ flexDirection: "row", justifyContent: "flex-end", marginBottom: 4 }}>
        <Pressable onPress={() => setShowSectionEditor(true)} hitSlop={10} accessibilityLabel="Customize Meals screen">
          <Ionicons name="pencil-outline" size={17} color={theme.textSoft} />
        </Pressable>
      </View>
      {/* Totals strip */}
      {totals !== null && (
        <View style={styles.totalsRow}>
          {totals.calories !== null ? (
            <View style={[styles.totalBlock, { backgroundColor: theme.berry.solid }]}>
              <Text style={[styles.totalBlockLabel, { color: onSolid(theme.berry.solid) }]}>CAL</Text>
              <Text style={[styles.totalBlockValue, { color: onSolid(theme.berry.solid) }]} numberOfLines={1} adjustsFontSizeToFit>{totals.calories}</Text>
            </View>
          ) : null}
          {totals.carbs !== null ? (
            <View style={[styles.totalBlock, { backgroundColor: theme.teal.solid }]}>
              <Text style={[styles.totalBlockLabel, { color: onSolid(theme.teal.solid) }]}>CARBS</Text>
              <Text style={[styles.totalBlockValue, { color: onSolid(theme.teal.solid) }]} numberOfLines={1} adjustsFontSizeToFit>{totals.carbs}g</Text>
            </View>
          ) : null}
          {totals.sugar !== null ? (
            <View style={[styles.totalBlock, { backgroundColor: theme.coral.solid }]}>
              <Text style={[styles.totalBlockLabel, { color: onSolid(theme.coral.solid) }]}>SUGAR</Text>
              <Text style={[styles.totalBlockValue, { color: onSolid(theme.coral.solid) }]} numberOfLines={1} adjustsFontSizeToFit>{totals.sugar}g</Text>
            </View>
          ) : null}
          {totals.sodium !== null ? (
            <View style={[styles.totalBlock, { backgroundColor: theme.amber.solid }]}>
              <Text style={[styles.totalBlockLabel, { color: onSolid(theme.amber.solid) }]}>SODIUM</Text>
              <Text style={[styles.totalBlockValue, { color: onSolid(theme.amber.solid) }]} numberOfLines={1} adjustsFontSizeToFit>{totals.sodium}mg</Text>
            </View>
          ) : null}
          {totals.caffeine !== null ? (
            <View style={[styles.totalBlock, { backgroundColor: theme.violet.solid }]}>
              <Text style={[styles.totalBlockLabel, { color: onSolid(theme.violet.solid) }]}>CAFFEINE</Text>
              <Text style={[styles.totalBlockValue, { color: onSolid(theme.violet.solid) }]} numberOfLines={1} adjustsFontSizeToFit>{totals.caffeine}mg</Text>
            </View>
          ) : null}
        </View>
      )}

      {/* Log a meal card */}
      <View ref={tourLogRef}>
      <ShadowCard size="card" bg={theme.coral.tint} accent={theme.coral.solid} rotate={-0.5} cardId="meal_log">
        <Text style={[styles.cardTitle, { color: theme.textStrong }]}>Log a meal</Text>

        {/* Frequent meals + recipes */}
        {/* Quick drinks row — always visible */}
        <View style={styles.frequentSection}>
          <Text style={[styles.sectionLabel, { color: theme.textSoft }]}>DRINKS</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.frequentRow}>
            {QUICK_DRINKS.map(function (drink) {
              return (
                <Pressable
                  key={drink.name}
                  onPress={function () { handleQuickDrink(drink); }}
                  style={[styles.frequentChip, { backgroundColor: theme.teal.tint }]}
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

        {!hiddenSections.includes('your_usual') && ((frequentMeals.length > 0 || recipes.length > 0) ? (
          <View style={styles.frequentSection}>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
              <Text style={[styles.sectionLabel, { color: theme.textSoft, flex: 1, marginBottom: 0 }]}>YOUR USUAL</Text>
              <Pressable
                onPress={function () { setEditingRecipe(null); setShowRecipeBuilder(true); }}
                style={[styles.secondaryBtn, { paddingVertical: 4 }]}
              >
                <Ionicons name="bookmark-outline" size={12} color={ink} />
                <Text style={styles.secondaryBtnText}>+ RECIPE</Text>
              </Pressable>
            </View>
            {(function () {
              const highSpikeMeal = frequentMeals.reduce<{ name: string; spike: number } | null>(function (best, m) {
                const s = impactScores[m.name];
                if (s == null || s <= 40) return best;
                if (!best || s > best.spike) return { name: m.name, spike: s };
                return best;
              }, null);
              return highSpikeMeal ? (
                <View style={{ backgroundColor: "#fef3c7", borderRadius: 12, borderWidth: 1.5, borderColor: "#f59e0b", padding: 8, marginBottom: 8, flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={{ fontSize: 11, color: "#92400e" }}>
                    {highSpikeMeal.name + " has averaged a +" + highSpikeMeal.spike + " mg/dL rise across recent logs"}
                  </Text>
                </View>
              ) : null;
            })()}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.frequentRow}>
              {recipes.map(function (recipe) {
                if (!recipeScales.current.has(recipe.id)) {
                  recipeScales.current.set(recipe.id, new Animated.Value(1));
                }
                const recipeScale = recipeScales.current.get(recipe.id)!;
                return (
                  <Animated.View key={recipe.id} style={{ transform: [{ scale: recipeScale }] }}>
                    <Pressable
                      onPress={function () { handleLogRecipe(recipe); }}
                      onLongPress={function () { handleEditRecipe(recipe); }}
                      onPressIn={function () {
                        Animated.spring(recipeScale, { toValue: 0.96, useNativeDriver: true, speed: 50, bounciness: 0 }).start();
                      }}
                      onPressOut={function () {
                        Animated.spring(recipeScale, { toValue: 1, useNativeDriver: true, speed: 50, bounciness: 4 }).start();
                      }}
                      style={[styles.frequentChip, { backgroundColor: theme.teal.tint }]}
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
                if (!chipScales.current.has(chipKey)) {
                  chipScales.current.set(chipKey, new Animated.Value(1));
                }
                const chipScale = chipScales.current.get(chipKey)!;
                return (
                  <Animated.View key={meal.source_food_id ?? meal.name + i} style={{ transform: [{ scale: chipScale }] }}>
                    <Pressable
                      onPress={function () { Haptics.selectionAsync(); handleSelectFrequent(meal); }}
                      onLongPress={function () {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        Alert.alert(
                          "Hide from suggestions?",
                          `"${meal.name}" won't appear in your usuals.`,
                          [
                            { text: "Cancel", style: "cancel" },
                            {
                              text: "Hide",
                              style: "destructive",
                              onPress: async function () {
                                try {
                                  const raw = await AsyncStorage.getItem("ripple_hidden_frequent");
                                  const arr: string[] = raw ? JSON.parse(raw) : [];
                                  if (!arr.includes(meal.name)) arr.push(meal.name);
                                  await AsyncStorage.setItem("ripple_hidden_frequent", JSON.stringify(arr));
                                } catch (_) {}
                                setHiddenFrequent(function (prev) {
                                  const next = new Set(prev);
                                  next.add(meal.name);
                                  return next;
                                });
                                setFrequentMeals(function (prev) { return prev.filter(function (m) { return m.name !== meal.name; }); });
                              },
                            },
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
                    >
                      <Text style={{ color: cc.fg, fontSize: 13, fontWeight: "700" }} numberOfLines={1}>{meal.name}</Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 3, flexWrap: "wrap" }}>
                        {spike != null && badgeBg != null && spike > 30 ? (
                          <View
                            style={{ backgroundColor: badgeBg, borderRadius: 10, paddingHorizontal: 5, paddingVertical: 2 }}
                            accessibilityLabel={"averages a " + spike + " milligrams per deciliter glucose rise"}
                          >
                            <Text style={{ color: "#fff", fontSize: 10, fontWeight: "800" }}>↑{spike} mg/dL</Text>
                          </View>
                        ) : null}
                        {(meal.calories != null || meal.carbs_g != null) ? (
                          <Text style={{ color: cc.sub, fontSize: 11 }} numberOfLines={1}>
                            {meal.calories != null ? meal.calories + " cal" : meal.carbs_g + "g carbs"}
                          </Text>
                        ) : null}
                      </View>
                    </Pressable>
                  </Animated.View>
                );
              })}
            </ScrollView>
          </View>
        ) : (
          <Pressable
            onPress={function () { setEditingRecipe(null); setShowRecipeBuilder(true); }}
            style={[styles.secondaryBtn, { alignSelf: "flex-start", marginBottom: 8 }]}
          >
            <Ionicons name="bookmark-outline" size={12} color={ink} />
            <Text style={styles.secondaryBtnText}>+ SAVE A RECIPE</Text>
          </Pressable>
        ))}

        {/* Meal type selector */}
        <View style={styles.chipRow}>
          {MEAL_TYPES.map(function (type) {
            const selected = mealType === type;
            return (
              <Pressable
                key={type}
                onPress={function () { Haptics.selectionAsync(); setMealType(type); }}
                style={[
                  styles.typeChip,
                  { backgroundColor: selected ? ink : card },
                ]}
              >
                <Text style={{ color: selected ? "#ffffff" : ink, fontSize: 11, fontWeight: "800", letterSpacing: 0.3 }}>
                  {type.toUpperCase()}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Search field */}
        <View style={styles.searchRow}>
          <TextInput
            placeholder="search food..."
            value={searchQuery}
            onChangeText={handleFoodQueryChange}
            onSubmitEditing={() => handleSearch()}
            style={[styles.textInput, { color: theme.textStrong, flex: 1 }]}
            placeholderTextColor={theme.textSoft}
          />
          <Pressable style={[styles.actionBtn, { backgroundColor: theme.coral.solid }]} onPress={() => handleSearch()}>
            {searching ? (
              <LoadingIndicator color={onSolid(theme.coral.solid)} size="small" />
            ) : (
              <Text style={[styles.actionBtnText, { color: onSolid(theme.coral.solid) }]}>SEARCH</Text>
            )}
          </Pressable>
        </View>

        <View style={[styles.belowSearchRow, { flexWrap: "wrap" }]}>
          <Pressable
            onPress={function () { setScannerVisible(true); }}
            style={styles.secondaryBtn}
          >
            <Ionicons name="barcode-outline" size={15} color={ink} />
            <Text style={styles.secondaryBtnText}>SCAN BARCODE</Text>
          </Pressable>
          <Pressable
            onPress={function () { setPhotoScannerVisible(true); }}
            style={styles.secondaryBtn}
          >
            <Ionicons name="camera-outline" size={15} color={ink} />
            <Text style={styles.secondaryBtnText}>SCAN A PHOTO</Text>
          </Pressable>
          <Pressable
            onPress={function () {
              setPendingFood({ name: "", carbs_g: null, sugar_g: null, calories: null, caffeine_mg: null, sodium_mg: null, source_db: "manual" });
              setSearchResults([]);
            }}
            style={styles.secondaryBtn}
            hitSlop={8}
          >
            <Text style={styles.secondaryBtnText}>+ ADD MANUALLY</Text>
          </Pressable>
        </View>

        {searchError ? (
          <Text style={{ color: theme.coral.sub, fontSize: 12, marginTop: 6 }}>{searchError}</Text>
        ) : null}

        {pendingFood ? (
          <MacroEditForm
            initial={pendingFood}
            saveLabel="Log it"
            onSave={handleSavePending}
            onCancel={function () { setPendingFood(null); }}
          />
        ) : searchResults.length > 0 ? (
          <View style={{ marginTop: 12, gap: 8 }}>
            {searchResults.map(function (food, i) {
              const nutrition = formatNutrition(food.carbs_g, food.sugar_g, food.calories, food.caffeine_mg, food.sodium_mg);
              return (
                <Pressable
                  key={food.source_food_id ?? String(i)}
                  onPress={function () { handleSelectFood(food); }}
                  style={[styles.resultRow, { borderColor: ink }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.textStrong, fontSize: 13, fontWeight: "600" }} numberOfLines={1}>{food.name}</Text>
                    {nutrition ? <Text style={{ color: theme.textSoft, fontSize: 11, marginTop: 2 }}>{nutrition}</Text> : null}
                  </View>
                  <Ionicons name="create-outline" size={18} color={theme.coral.sub} />
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </ShadowCard>
      </View>

      {/* Alcohol */}
      {!hiddenSections.includes('booze') && (
      <ShadowCard size="card" bg={theme.purple.tint} accent={theme.purple.solid}>
        <Text style={[styles.cardTitle, { color: theme.textStrong }]}>Alcohol</Text>

        {subTotals.standard_drinks > 0 && (
          <View style={[styles.totalBlock, { backgroundColor: theme.purple.solid, marginBottom: 10 }]}>
            <Text style={[styles.totalBlockLabel, { color: onSolid(theme.purple.solid) }]}>STD DRINKS TODAY</Text>
            <Text style={[styles.totalBlockValue, { color: onSolid(theme.purple.solid) }]}>{subTotals.standard_drinks}</Text>
          </View>
        )}

        <View style={styles.searchRow}>
          <TextInput
            placeholder="search beer, wine, spirits..."
            value={subQuery}
            onChangeText={handleSubQueryChange}
            onSubmitEditing={() => handleSubSearch()}
            style={[styles.textInput, { color: theme.textStrong, flex: 1 }]}
            placeholderTextColor={theme.textSoft}
          />
          <Pressable
            style={[styles.actionBtn, { backgroundColor: theme.purple.solid }]}
            onPress={() => handleSubSearch()}
          >
            {subSearching ? (
              <LoadingIndicator color={onSolid(theme.purple.solid)} size="small" />
            ) : (
              <Text style={[styles.actionBtnText, { color: onSolid(theme.purple.solid) }]}>SEARCH</Text>
            )}
          </Pressable>
        </View>

        <View style={[styles.belowSearchRow, { marginBottom: 4 }]}>
          <Pressable onPress={function () { setSubScannerVisible(true); }} style={styles.secondaryBtn}>
            <Ionicons name="barcode-outline" size={15} color={ink} />
            <Text style={styles.secondaryBtnText}>SCAN BARCODE</Text>
          </Pressable>
          <Pressable
            onPress={function () {
              setPendingSub({ name: "", substance_type: "alcohol", caffeine_mg: null, abv_percent: null, volume_ml: null, source_db: "manual" });
              setSubResults([]);
            }}
            style={styles.secondaryBtn}
          >
            <Text style={styles.secondaryBtnText}>+ ADD MANUALLY</Text>
          </Pressable>
        </View>

        {subSearchError ? <Text style={{ color: theme.purple.sub, fontSize: 12, marginTop: 4 }}>{subSearchError}</Text> : null}

        {!pendingSub && subResults.length > 0 && (
          <View style={{ marginTop: 8, gap: 8 }}>
            {subResults.map(function (r, i) {
              return (
                <Pressable
                  key={r.source_food_id ?? String(i)}
                  onPress={function () { handleSelectSubResult(r); }}
                  style={[styles.resultRow, { borderColor: ink }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.textStrong, fontSize: 13, fontWeight: "600" }} numberOfLines={1}>{r.name}</Text>
                    {r.abv_percent != null ? <Text style={{ color: theme.textSoft, fontSize: 11, marginTop: 2 }}>{r.abv_percent}% ABV</Text> : null}
                  </View>
                  <Ionicons name="create-outline" size={18} color={theme.purple.solid} />
                </Pressable>
              );
            })}
          </View>
        )}

        {pendingSub ? (
          <AlcoholForm
            initial={pendingSub}
            onSave={handleLogSubstance}
            onCancel={function () { setPendingSub(null); }}
            theme={theme}
          />
        ) : null}

        {subLoading ? (
          <LoadingIndicator style={{ marginTop: 8 }} />
        ) : subEntries.filter(e => e.substance_type === "alcohol").length > 0 ? (
          <View style={{ marginTop: 10, gap: 6 }}>
            <Text style={[styles.sectionLabel, { color: theme.textSoft }]}>TODAY</Text>
            {subEntries.filter(e => e.substance_type === "alcohol").map(function (entry) {
              const detail = entry.abv_percent != null && entry.volume_ml != null
                ? entry.abv_percent + "% · " + entry.volume_ml + "mL"
                : "alcohol";
              return (
                <View key={entry.id} style={[styles.resultRow, { borderColor: ink }]}>
                  <IconBadge name="wine-outline" color={onSolid(theme.purple.solid)} bgColor={theme.purple.solid} size={14} containerSize={32} borderRadius={8} />
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={{ color: theme.textStrong, fontSize: 13, fontWeight: "600" }} numberOfLines={1}>{entry.name || "Alcohol"}</Text>
                    <Text style={{ color: theme.textSoft, fontSize: 11, marginTop: 1 }}>{detail}</Text>
                  </View>
                  <Pressable onPress={function () { handleDeleteSubstance(entry); }} hitSlop={8}>
                    <Ionicons name="trash-outline" size={15} color={theme.coral.solid} />
                  </Pressable>
                </View>
              );
            })}
          </View>
        ) : null}
      </ShadowCard>
      )}

      {/* Today's meals list */}
      <View ref={tourHistoryRef}>
      <ShadowCard size="card" bg={theme.coral.tint} accent={theme.coral.solid} cardId="food_report">
        <Text style={[styles.cardTitle, { color: theme.textStrong }]}>Today's meals</Text>

        {mealsError ? (
          <Text style={{ color: theme.coral.sub, fontSize: 12, marginTop: 6 }}>{mealsError}</Text>
        ) : null}

        {loadingMeals ? (
          <LoadingIndicator style={{ marginTop: 10 }} />
        ) : meals.length === 0 ? (
          <MealsEmptyState onPress={() => Haptics.selectionAsync()} />
        ) : (
          meals.map(function (meal) {
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

            return (
              <Swipeable
                key={meal.id}
                ref={function (r) { swipeableRefs.current[meal.id] = r; }}
                renderRightActions={function () { return renderMealRightActions(meal); }}
                overshootRight={false}
                friction={2}
              >
                <Animated.View style={{ transform: [{ scale: mealScale }] }}>
                <View style={[styles.mealCard, { borderColor: ink, backgroundColor: mealTintColor(meal.meal_type, theme) }]}>
                  <View style={styles.mealContent}>
                    {/* Colored icon tile */}
                    <IconBadge name="restaurant" color={onSolid(mealColor)} bgColor={mealColor} size={16} containerSize={40} borderRadius={12} />

                    <Pressable
                      style={styles.mealMain}
                      onPress={function () { handleToggleGlucose(meal); }}
                      onPressIn={function () { Animated.spring(mealScale, { toValue: 0.98, useNativeDriver: true, speed: 300, bounciness: 4 }).start(); }}
                      onPressOut={function () { Animated.spring(mealScale, { toValue: 1, useNativeDriver: true, speed: 300, bounciness: 4 }).start(); }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: theme.textStrong, fontSize: 13, fontWeight: "700" }} numberOfLines={1}>
                          {meal.name}
                        </Text>
                        <Text style={{ color: theme.textSoft, fontSize: 10, fontWeight: "800", letterSpacing: 0.4, marginTop: 1 }}>
                          {meal.meal_type.toUpperCase()}
                        </Text>
                        {nutrition ? (
                          <Text style={{ color: theme.textSoft, fontSize: 11, marginTop: 2 }}>{nutrition}</Text>
                        ) : null}
                      </View>
                      <Ionicons
                        name={isExpanded && !isEditing ? "chevron-up" : "pulse"}
                        size={15}
                        color={theme.berry.sub}
                        style={{ marginLeft: 8 }}
                      />
                    </Pressable>

                    <Pressable onPress={function () { handleOpenEdit(meal); }} style={styles.iconBtn} hitSlop={8}>
                      <Ionicons name="pencil-outline" size={15} color={isEditing ? theme.coral.solid : theme.textSoft} />
                    </Pressable>
                    <Pressable onPress={function () { handleDeleteMeal(meal); }} style={styles.iconBtn} hitSlop={8}>
                      <Ionicons name="trash-outline" size={15} color={theme.coral.solid} />
                    </Pressable>
                  </View>

                  {isEditing ? (
                    <View style={[styles.glucosePanel, { borderTopColor: theme.cardBorder }]}>
                      <MacroEditForm
                        initial={{ name: meal.name, carbs_g: meal.carbs_g, sugar_g: meal.sugar_g, calories: meal.calories, caffeine_mg: meal.caffeine_mg, sodium_mg: meal.sodium_mg }}
                        saveLabel="Save"
                        onSave={function (values) { handleSaveEdit(meal.id, values); }}
                        onCancel={function () { setEditingMealId(null); }}
                      />
                    </View>
                  ) : isExpanded ? (
                    <View style={[styles.glucosePanel, { borderTopColor: theme.cardBorder }]}>
                      {isLoadingG ? (
                        <LoadingIndicator style={{ marginVertical: 10 }} />
                      ) : gError ? (
                        <Text style={{ color: theme.coral.sub, fontSize: 12 }}>{gError}</Text>
                      ) : (
                        <MiniGlucoseChart readings={readings} mealLoggedAt={meal.logged_at ?? null} />
                      )}
                    </View>
                  ) : null}
                </View>
                </Animated.View>
              </Swipeable>
            );
          })
        )}
      </ShadowCard>
      </View>

      {/* Food Report card — only renders when we have enough data */}
      {foodReport.length >= 3 && (function () {
        const sorted = [...foodReport].sort((a, b) => b.avg_spike - a.avg_spike);
        const spiky = sorted.slice(0, 5);
        const stable = [...foodReport].sort((a, b) => a.avg_spike - b.avg_spike).slice(0, 5).filter(s => s.avg_spike <= 30);
        const maxSpike = spiky[0]?.avg_spike ?? 1;
        return (
          <ShadowCard size="card" bg={theme.card} accent={theme.berry.solid} rotate={0.4} cardId="glucose_panel">
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <Ionicons name="analytics-outline" size={18} color={theme.berry.solid} />
              <Text style={[styles.cardTitle, { color: theme.textStrong, marginBottom: 0 }]}>Food Report</Text>
            </View>

            {/* Highest spiking */}
            <Text style={[styles.sectionLabel, { color: theme.coral.sub, marginBottom: 8 }]}>SPIKES GLUCOSE MOST</Text>
            <View style={{ gap: 8, marginBottom: 16 }}>
              {spiky.map(function (item, i) {
                const barW = Math.max(6, Math.round((item.avg_spike / maxSpike) * 100));
                const isHigh = item.avg_spike > 50;
                const barColor = isHigh ? theme.coral.solid : item.avg_spike > 25 ? theme.amber?.solid ?? "#f59e0b" : theme.teal.solid;
                return (
                  <View key={item.meal_name} style={{ gap: 4 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}>
                        <Text style={{ color: theme.textSoft, fontSize: 10, fontWeight: "800", width: 14 }}>{i + 1}</Text>
                        <Text style={{ color: theme.textStrong, fontSize: 13, fontWeight: "700", flex: 1 }} numberOfLines={1}>{item.meal_name}</Text>
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        <Text style={{ color: barColor, fontSize: 13, fontWeight: "900" }}>+{item.avg_spike}</Text>
                        <Text style={{ color: theme.textSoft, fontSize: 10 }}>mg/dL</Text>
                        <Text style={{ color: theme.textSoft, fontSize: 10, marginLeft: 4 }}>×{item.sample_count}</Text>
                      </View>
                    </View>
                    <View style={{ height: 5, backgroundColor: theme.cardBorder, borderRadius: 3, overflow: "hidden" }}>
                      <View style={{ height: 5, width: barW + "%", backgroundColor: barColor, borderRadius: 3 }} />
                    </View>
                  </View>
                );
              })}
            </View>

            {/* Most stable */}
            {stable.length > 0 && (
              <>
                <Text style={[styles.sectionLabel, { color: theme.teal.sub, marginBottom: 8 }]}>STAYS STABLE</Text>
                <View style={{ gap: 6 }}>
                  {stable.map(function (item, i) {
                    return (
                      <View key={item.meal_name} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Ionicons name="checkmark-circle" size={14} color={theme.teal.solid} />
                        <Text style={{ color: theme.textStrong, fontSize: 13, fontWeight: "700", flex: 1 }} numberOfLines={1}>{item.meal_name}</Text>
                        <Text style={{ color: theme.teal.solid, fontSize: 12, fontWeight: "800" }}>+{item.avg_spike}</Text>
                        <Text style={{ color: theme.textSoft, fontSize: 10 }}>mg/dL</Text>
                        <Text style={{ color: theme.textSoft, fontSize: 10, marginLeft: 2 }}>×{item.sample_count}</Text>
                      </View>
                    );
                  })}
                </View>
              </>
            )}

            <Text style={{ color: theme.textSoft, fontSize: 10, marginTop: 14, lineHeight: 14 }}>
              Average glucose rise 45–105 min after eating. Based on {foodReport.length} foods across your history.
            </Text>
          </ShadowCard>
        );
      })()}

      <BarcodeScannerModal
        visible={scannerVisible}
        onClose={function () { setScannerVisible(false); }}
        onResult={function (food) { handleSelectFood(food); }}
      />
      <BarcodeScannerModal
        visible={subScannerVisible}
        onClose={function () { setSubScannerVisible(false); }}
        mode="alcohol"
        onSubstanceResult={function (substance) { handleSelectSubResult(substance); }}
        onManual={function () {
          setPendingSub({ name: "", substance_type: "alcohol", caffeine_mg: null, abv_percent: null, volume_ml: null, source_db: "manual" });
        }}
      />
      <PhotoScannerModal
        visible={photoScannerVisible}
        onClose={function () { setPhotoScannerVisible(false); }}
        onResult={function (food) { handleSelectFood(food); }}
      />
      <RecipeBuilderModal
        visible={showRecipeBuilder}
        onClose={function () { setShowRecipeBuilder(false); setEditingRecipe(null); }}
        onSaved={function (r) {
          setRecipes(function (prev) { return [...prev.filter(function (x) { return x.id !== r.id; }), r]; });
          setShowRecipeBuilder(false);
          setEditingRecipe(null);
        }}
        existing={editingRecipe ?? undefined}
      />
      <SectionEditorModal
        visible={showSectionEditor}
        title="Customize Meals"
        sections={MEALS_SECTIONS}
        hidden={hiddenSections}
        onSave={handleSaveSections}
        onCancel={() => setShowSectionEditor(false)}
      />
    </ScrollView>
    </LinearGradient>
    {undoMeal && (
      <UndoBanner
        message={undoMeal.type === "meal" ? `"${(undoMeal.data as Meal).name}" removed` : `"${(undoMeal.data as SubstanceEntry).name}" removed`}
        onUndo={handleUndoMealDelete}
        theme={theme}
      />
    )}
    <FeatureTour steps={MEALS_TOUR} visible={showTour} onDone={() => setShowTour(false)} scrollRef={scrollViewRef} scrollY={scrollOffsetRef.current} onExtraPadding={setTourPadding} />
    </View>
  );
}

function makeStyles(ink: string, card: string, border: string) {
  return StyleSheet.create({
  content: { padding: 16, gap: 12 },

  // Totals strip
  totalsRow: { flexDirection: "row", gap: 8 },
  totalBlock: {
    flex: 1,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: ink,
    padding: 10,
    shadowColor: "rgba(60,40,20,0.1)",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.10,
    shadowRadius: 12,
    elevation: 3,
  },
  totalBlockLabel: { fontSize: 9, fontWeight: "800", letterSpacing: 0.6, marginBottom: 4 },
  totalBlockValue: { fontSize: 20, fontWeight: "800" },

  // Card
  card: {
    borderRadius: 22,
    borderWidth: 2,
    borderColor: border,
    padding: 14,
    ...coloredShadow("#E8654E"),
  },
  cardTitle: { fontSize: 19, fontWeight: "900", letterSpacing: -0.5, marginBottom: 8 },

  sectionLabel: { fontSize: 9, fontWeight: "800", letterSpacing: 0.7, marginBottom: 6 },

  frequentSection: { marginBottom: 8 },
  frequentRow: { gap: 8, paddingBottom: 2 },
  frequentChip: {
    borderWidth: 2,
    borderColor: ink,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: 150,
    shadowColor: "rgba(60,40,20,0.1)",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 2,
  },

  chipRow: { flexDirection: "row", gap: 6, marginBottom: 10, flexWrap: "wrap" },
  typeChip: {
    borderWidth: 2,
    borderColor: ink,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    shadowColor: "rgba(60,40,20,0.1)",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 2,
  },

  searchRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
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

  belowSearchRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 2,
    borderColor: ink,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: card,
    shadowColor: "rgba(60,40,20,0.1)",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 2,
  },
  secondaryBtnText: { color: ink, fontSize: 10, fontWeight: "800", letterSpacing: 0.4 },

  resultRow: {
    flexDirection: "row",
    gap: 10,
    borderWidth: 2,
    borderRadius: 16,
    padding: 10,
    alignItems: "center",
    backgroundColor: card,
    shadowColor: "rgba(60,40,20,0.1)",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 2,
  },

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

  // Meal row card
  mealCard: {
    marginTop: 10,
    borderWidth: 2,
    borderRadius: 22,
    overflow: "hidden",
    shadowColor: "rgba(60,40,20,0.1)",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
  },
  mealContent: { flexDirection: "row", alignItems: "flex-start", padding: 10 },
  mealIconTile: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: ink,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    shadowColor: "rgba(60,40,20,0.1)",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 2,
    flexShrink: 0,
  },
  mealMain: { flex: 1, flexDirection: "row", alignItems: "flex-start" },
  iconBtn: { padding: 6, marginLeft: 2 },
  glucosePanel: { borderTopWidth: 1, marginHorizontal: 10, paddingTop: 10, paddingBottom: 10 },
  });
}
