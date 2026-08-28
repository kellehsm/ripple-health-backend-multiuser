import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useTabPreferences } from "../hooks/useTabPreferences";
import { FeatureIntroSheet } from "../components/FeatureIntroSheet";
import { useFeatureIntro } from "../onboarding/useFeatureIntro";
import { findIntro } from "../onboarding/featureIntros";
import {
  ScrollView,
  View,
  Pressable,
  StyleSheet,
  Alert,
  RefreshControl,
  Animated,
  LayoutAnimation,
  Platform,
  UIManager,
  KeyboardAvoidingView,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import notifee from "../lib/notifeeSafe";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { coloredShadow } from "../theme/styleUtils";
import { api } from "../api/client";
import { TodaysMeals } from "./meals/TodaysMeals";
import { MacrosSummary } from "./meals/MacrosSummary";
import { AlcoholSection } from "./meals/AlcoholSection";
import { LogMealCard } from "./meals/LogMealCard";
import { FoodReportModal } from "./meals/FoodReportModal";

import { BarcodeScannerModal } from "../components/BarcodeScannerModal";
import { PhotoScannerModal } from "../components/PhotoScannerModal";
import { invalidateBarcodeCache } from "../utils/barcodeCache";
import { RecipeBuilderModal, Recipe } from "../components/RecipeBuilderModal";
import { toast } from "../lib/toast";
import { UndoBanner } from "../components/UndoBanner";
import { TooltipBubble } from "../components/TooltipBubble";
import { hasSeenTooltip, markTooltipSeen } from "../utils/tooltipSeen";
import { SectionEditorModal } from "../components/SectionEditorModal";
import { FeatureTour, TourStep } from "../components/FeatureTour";
import { ScreenBackground } from "../components/ScreenBackground";
import { MEALS_SECTIONS } from "../constants";
import {
  type SubstanceResult,
  type SubstancePending,
  type SubstanceEntry,
  type SubstanceTotals,
} from "../types/substances";
import { type MacroValues } from "../components/MacroEditForm";
import { formatDateLocal } from "../utils/dateUtils";

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
  servings?: number | null;
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
  servings?: number | null;
};

type GlucoseReading = {
  recorded_at: string;
  mg_dl: number;
};

const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

export function MealsScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<any>();
  const { preferences, loading: prefsLoading } = useTabPreferences();
  const mealsIntro = findIntro("meals")!;
  const [introVisible, dismissIntro] = useFeatureIntro(mealsIntro.key);
  const ink = theme.ink;
  const card = theme.card;
  const styles = useMemo(() => makeStyles(ink, card, theme.cardBorder, theme.coral.solid), [ink, card, theme.cardBorder, theme.coral.solid]);

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
  const [collapsedGroups, setCollapsedGroups] = useState<Set<MealType>>(() => new Set());
  const [alcoholCollapsed, setAlcoholCollapsed] = useState(true);
  const [showFoodReport, setShowFoodReport] = useState(false);

  const [scannerVisible, setScannerVisible] = useState(false);
  const [subScannerVisible, setSubScannerVisible] = useState(false);
  const [photoScannerVisible, setPhotoScannerVisible] = useState(false);
  const [photoScannerFromGallery, setPhotoScannerFromGallery] = useState(false);
  const [pendingFood, setPendingFood] = useState<PendingFood | null>(null);
  const [mealTypePickerVisible, setMealTypePickerVisible] = useState(false);
  const [addSheetVisible, setAddSheetVisible] = useState(false);
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

  // Servings prompt modal state
  const [servingsPromptName, setServingsPromptName] = useState<string | null>(null);
  const [servingsInput, setServingsInput] = useState("1");

  type UndoMeal =
    | { type: "meal"; data: Meal; timer: ReturnType<typeof setTimeout> }
    | { type: "substance"; data: SubstanceEntry; timer: ReturnType<typeof setTimeout> };
  const [undoMeal, setUndoMeal] = useState<UndoMeal | null>(null);

  const mealsLoadedRef = useRef(false);
  const loadMeals = useCallback(function () {
    const today = formatDateLocal(new Date());
    if (!mealsLoadedRef.current) setLoadingMeals(true);
    setMealsError(null);
    return api.meals(today)
      .then(function (data: Meal[]) {
        if (mealsLoadedRef.current) {
          if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
            UIManager.setLayoutAnimationEnabledExperimental(true);
          }
          LayoutAnimation.configureNext(LayoutAnimation.create(220, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity));
        }
        mealsLoadedRef.current = true; setMeals(Array.isArray(data) ? data : []);
      })
      .catch(function (e: Error) { setMealsError(e.message || "Failed to load meals"); })
      .finally(function () { setLoadingMeals(false); });
  }, []);

  const subsLoadedRef = useRef(false);
  const alcoholAutoExpandedRef = useRef(false);
  const loadSubstances = useCallback(function () {
    const today = formatDateLocal(new Date());
    if (!subsLoadedRef.current) setSubLoading(true);
    return api.substancesToday(today)
      .then(function (data: { entries: SubstanceEntry[]; totals: SubstanceTotals }) {
        subsLoadedRef.current = true;
        setSubEntries(Array.isArray(data?.entries) ? data.entries : []);
        if (data?.totals) {
          setSubTotals(data.totals);
          if (Number(data.totals.standard_drinks) > 0 && !alcoholAutoExpandedRef.current) {
            alcoholAutoExpandedRef.current = true;
            setAlcoholCollapsed(false);
          }
        }
      })
      .catch(function () {})
      .finally(function () { setSubLoading(false); });
  }, []);

  useEffect(function () {
    loadMeals();
    loadSubstances();
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

  const firstFocusRef = useRef(true);
  useFocusEffect(useCallback(function () {
    if (firstFocusRef.current) { firstFocusRef.current = false; return; }
    let cancelled = false;
    const today = formatDateLocal(new Date());
    api.meals(today)
      .then(function (data: Meal[]) {
        if (cancelled) return;
        mealsLoadedRef.current = true;
        setMeals(Array.isArray(data) ? data : []);
      })
      .catch(function (e: Error) { if (!cancelled) setMealsError(e.message || "Failed to load meals"); })
      .finally(function () { if (!cancelled) setLoadingMeals(false); });
    api.substancesToday(today)
      .then(function (data: { entries: SubstanceEntry[]; totals: SubstanceTotals }) {
        if (cancelled) return;
        subsLoadedRef.current = true;
        setSubEntries(Array.isArray(data?.entries) ? data.entries : []);
        if (data?.totals) {
          setSubTotals(data.totals);
          if (Number(data.totals.standard_drinks) > 0 && !alcoholAutoExpandedRef.current) {
            alcoholAutoExpandedRef.current = true;
            setAlcoholCollapsed(false);
          }
        }
      })
      .catch(function () {})
      .finally(function () { if (!cancelled) setSubLoading(false); });
    return function () { cancelled = true; };
  }, [loadMeals, loadSubstances]));

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
    const timeoutId = setTimeout(function () {
      if (seq === foodSearchSeqRef.current) {
        setSearching(false);
        setSearchError("Search timed out. Check your connection and try again.");
      }
    }, 15000);
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
        clearTimeout(timeoutId);
        if (seq === foodSearchSeqRef.current) setSearching(false);
      });
  }

  function handleFoodQueryChange(text: string) {
    setSearchQuery(text);
    if (foodDebounceRef.current) clearTimeout(foodDebounceRef.current);
    if (!text.trim()) { setSearchResults([]); return; }
    foodDebounceRef.current = setTimeout(function () { handleSearch(text); }, 450);
  }

  async function handleLogMultipleFoods(foods: FoodResult[]) {
    let successCount = 0;
    for (const food of foods) {
      try {
        await api.addMeal({
          meal_type: mealType,
          source_food_id: food.source_food_id,
          source_db: food.source_db ?? "passio",
          name: food.name,
          carbs_g: food.carbs_g,
          sugar_g: food.sugar_g,
          calories: food.calories,
          caffeine_mg: food.caffeine_mg ?? null,
          sodium_mg: food.sodium_mg ?? null,
          servings: 1,
        });
        successCount++;
      } catch (_) {}
    }
    if (successCount > 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(function () {});
      toast(successCount === foods.length
        ? "Logged " + successCount + " item" + (successCount === 1 ? "" : "s")
        : "Logged " + successCount + " of " + foods.length + " — some failed");
      loadMeals();
    } else {
      toast("Couldn't log those items. Try again.", "error");
    }
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
    if (isLikelyDuplicate(meal.name)) {
      Alert.alert(
        "Log this twice?",
        `"${meal.name}" was already logged in the last 15 min. Add another?`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Yes, add another", onPress: () => openFrequentPending(meal) },
        ]
      );
      return;
    }
    openFrequentPending(meal);
  }

  const FREQ_SERVINGS_KEY = "ripple_frequent_servings";
  async function loadFrequentServings(name: string): Promise<number | null> {
    try {
      const raw = await AsyncStorage.getItem(FREQ_SERVINGS_KEY);
      const map: Record<string, number> = raw ? JSON.parse(raw) : {};
      const v = map[name];
      return typeof v === "number" && v > 0 ? v : null;
    } catch { return null; }
  }
  async function saveFrequentServings(name: string, servings: number) {
    try {
      const raw = await AsyncStorage.getItem(FREQ_SERVINGS_KEY);
      const map: Record<string, number> = raw ? JSON.parse(raw) : {};
      map[name] = servings;
      await AsyncStorage.setItem(FREQ_SERVINGS_KEY, JSON.stringify(map));
    } catch {}
  }
  function promptFrequentServings(name: string) {
    setServingsInput("1");
    setServingsPromptName(name);
  }
  async function saveServingsPrompt() {
    const v = parseFloat(servingsInput.trim());
    if (!isFinite(v) || v <= 0 || v > 10) {
      toast("Enter a number between 0.25 and 10.", "error");
      return;
    }
    await saveFrequentServings(servingsPromptName!, v);
    setServingsPromptName(null);
    toast("Default set to " + v + " serving" + (v === 1 ? "" : "s"));
  }

  function openFrequentPending(meal: FrequentMeal) {
    setSearchResults([]);
    setSearchQuery("");
    loadFrequentServings(meal.name).then((s) => {
      if (s != null && s !== 1) setPendingFood((cur) => cur ? { ...cur, servings: s } as any : cur);
    });
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

  function isLikelyDuplicate(name: string): boolean {
    const cutoff = Date.now() - 15 * 60 * 1000;
    const normalized = name.trim().toLowerCase();
    return meals.some((m) => {
      if (!m.logged_at) return false;
      if (m.name.trim().toLowerCase() !== normalized) return false;
      return new Date(m.logged_at).getTime() >= cutoff;
    });
  }

  function handleQuickDrink(drink: { name: string; calories: number | null; caffeine_mg: number | null; carbs_g: number | null; sugar_g: number | null; sodium_mg: number | null }) {
    if (isLikelyDuplicate(drink.name)) {
      Alert.alert(
        "Log this twice?",
        `"${drink.name}" was already logged in the last 15 min. Add another?`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Yes, add another", onPress: () => actuallyLogQuickDrink(drink) },
        ]
      );
      return;
    }
    actuallyLogQuickDrink(drink);
  }

  function actuallyLogQuickDrink(drink: { name: string; calories: number | null; caffeine_mg: number | null; carbs_g: number | null; sugar_g: number | null; sodium_mg: number | null }) {
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
      .then(function (res) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        if (res === null) {
          // Offline — write was queued; it won't appear in the list yet.
          toast("Saved — will sync when online.", "info");
          return;
        }
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
      .then(function (res) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        if (res === null) {
          // Offline — write was queued; it won't appear in the list yet.
          toast("Saved — will sync when online.", "info");
          return;
        }
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
      servings: values.servings ?? 1,
    })
      .then(function (res) {
        setPendingFood(null);
        setSearchQuery("");
        setSearchResults([]);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        if (res === null) {
          // Offline — write was queued; it won't appear in the list yet.
          toast("Saved — will sync when online.", "info");
          return;
        }
        toast("Meal logged.");
        setTimeout(function () {
          Alert.alert(
            "Add another?",
            "You can chain another item to this meal without going back through search.",
            [
              { text: "Done", style: "cancel" },
              { text: "Add another", onPress: function () { setAddSheetVisible(true); } },
            ]
          );
        }, 250);
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

  function handleAddServing(meal: Meal) {
    const current = Number(meal.servings) || 1;
    const next = Math.round((current + 1) * 4) / 4;
    setMeals(function (prev) { return prev.map(function (m) { return m.id === meal.id ? Object.assign({}, m, { servings: next }) : m; }); });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(function () {});
    api.updateMeal(meal.id, { servings: next })
      .then(function () { toast("Added a serving to " + meal.name); })
      .catch(function () {
        setMeals(function (prev) { return prev.map(function (m) { return m.id === meal.id ? Object.assign({}, m, { servings: current }) : m; }); });
        toast("Couldn't add a serving. Try again.", "error");
      });
  }

  const deleteTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  function handleDeleteMeal(meal: Meal) {
    if (expandedMealId === meal.id) setExpandedMealId(null);
    if (editingMealId === meal.id) setEditingMealId(null);
    setMeals((prev) => prev.filter((m) => m.id !== meal.id));
    const key = "meal:" + meal.id;
    const timer = setTimeout(async () => {
      deleteTimersRef.current.delete(key);
      setUndoMeal((cur) => (cur && cur.type === "meal" && cur.data.id === meal.id ? null : cur));
      try { await api.deleteMeal(meal.id); }
      catch (e: any) { setMealsError(e.message || "Failed to delete meal"); loadMeals(); }
    }, 5000);
    deleteTimersRef.current.set(key, timer);
    setUndoMeal({ type: "meal", data: meal, timer });
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
    const timeoutId = setTimeout(function () {
      if (seq === subSearchSeqRef.current) {
        setSubSearching(false);
        setSubSearchError("Search timed out. Check your connection and try again.");
      }
    }, 15000);
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
        clearTimeout(timeoutId);
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
    setSubEntries((prev) => prev.filter((e) => e.id !== entry.id));
    const key = "substance:" + entry.id;
    const timer = setTimeout(async () => {
      deleteTimersRef.current.delete(key);
      setUndoMeal((cur) => (cur && cur.type === "substance" && cur.data.id === entry.id ? null : cur));
      try { await api.deleteSubstance(entry.id); }
      catch { loadSubstances(); }
    }, 4000);
    deleteTimersRef.current.set(key, timer);
    setUndoMeal({ type: "substance", data: entry, timer });
  }

  function handleUndoMealDelete() {
    if (!undoMeal) return;
    clearTimeout(undoMeal.timer);
    deleteTimersRef.current.delete((undoMeal.type === "meal" ? "meal:" : "substance:") + undoMeal.data.id);
    if (undoMeal.type === "meal") {
      setMeals((prev) => [...prev, undoMeal.data as Meal]);
    } else {
      setSubEntries((prev) => [...prev, undoMeal.data as SubstanceEntry]);
    }
    setUndoMeal(null);
  }

  function handleToggleGlucose(meal: Meal) {
    if (editingMealId === meal.id) return;
    if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
    LayoutAnimation.configureNext(LayoutAnimation.create(
      220,
      LayoutAnimation.Types.easeInEaseOut,
      LayoutAnimation.Properties.opacity,
    ));
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

  async function handleHideFrequent(name: string) {
    try {
      const raw = await AsyncStorage.getItem("ripple_hidden_frequent");
      const arr: string[] = raw ? JSON.parse(raw) : [];
      if (!arr.includes(name)) arr.push(name);
      await AsyncStorage.setItem("ripple_hidden_frequent", JSON.stringify(arr));
    } catch (_) {}
    setHiddenFrequent(function (prev) {
      const next = new Set(prev);
      next.add(name);
      return next;
    });
    setFrequentMeals(function (prev) { return prev.filter(function (m) { return m.name !== name; }); });
  }

  // Nutrition columns are per-serving; totals multiply by servings (defaults to 1).
  const totals = meals.length > 0 ? {
    calories: meals.some(function (m) { return m.calories != null; })
      ? Math.round(meals.reduce(function (s, m) { return s + (Number(m.calories) || 0) * (Number(m.servings) || 1); }, 0)) : null,
    carbs: meals.some(function (m) { return m.carbs_g != null; })
      ? Math.round(meals.reduce(function (s, m) { return s + (Number(m.carbs_g) || 0) * (Number(m.servings) || 1); }, 0)) : null,
    sugar: meals.some(function (m) { return m.sugar_g != null; })
      ? Math.round(meals.reduce(function (s, m) { return s + (Number(m.sugar_g) || 0) * (Number(m.servings) || 1); }, 0)) : null,
    caffeine: meals.some(function (m) { return m.caffeine_mg != null; })
      ? Math.round(meals.reduce(function (s, m) { return s + (Number(m.caffeine_mg) || 0) * (Number(m.servings) || 1); }, 0)) : null,
    sodium: meals.some(function (m) { return m.sodium_mg != null; })
      ? Math.round(meals.reduce(function (s, m) { return s + (Number(m.sodium_mg) || 0) * (Number(m.servings) || 1); }, 0)) : null,
  } : null;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
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
      <View style={{ flexDirection: "row", justifyContent: "flex-end", marginBottom: 4 }}>
        <Pressable onPress={() => setShowSectionEditor(true)} hitSlop={14} accessibilityLabel="Customize Meals screen">
          <Ionicons name="pencil-outline" size={17} color={theme.textSoft} />
        </Pressable>
      </View>

      {totals !== null && (
        <MacrosSummary
          theme={theme}
          totals={totals}
          foodReport={foodReport}
          cardTitleStyle={styles.cardTitle}
          onOpenFoodReport={function () { setShowFoodReport(true); }}
        />
      )}

      <LogMealCard
        theme={theme}
        ink={ink}
        card={card}
        tourLogRef={tourLogRef}
        mealType={mealType}
        searchQuery={searchQuery}
        searchResults={searchResults}
        searching={searching}
        searchError={searchError}
        pendingFood={pendingFood}
        frequentMeals={frequentMeals}
        recipes={recipes}
        impactScores={impactScores}
        foodReport={foodReport}
        hiddenSections={hiddenSections}
        addSheetVisible={addSheetVisible}
        mealTypePickerVisible={mealTypePickerVisible}
        servingsPromptName={servingsPromptName}
        servingsInput={servingsInput}
        chipScales={chipScales}
        recipeScales={recipeScales}
        styles={{
          frequentSection: styles.frequentSection,
          sectionLabel: styles.sectionLabel,
          frequentRow: styles.frequentRow,
          frequentChip: styles.frequentChip,
          secondaryBtn: styles.secondaryBtn,
          secondaryBtnText: styles.secondaryBtnText,
          typePill: styles.typePill,
          cardTitle: styles.cardTitle,
          totalBlock: styles.totalBlock,
          totalBlockLabel: styles.totalBlockLabel,
          totalBlockValue: styles.totalBlockValue,
        }}
        onSearchQueryChange={handleFoodQueryChange}
        onSearch={handleSearch}
        onSelectFood={handleSelectFood}
        onSavePending={handleSavePending}
        onCancelPending={function () { setPendingFood(null); }}
        onSelectFrequent={handleSelectFrequent}
        onLogRecipe={handleLogRecipe}
        onEditRecipe={handleEditRecipe}
        onQuickDrink={handleQuickDrink}
        onPromptFrequentServings={promptFrequentServings}
        onHideFrequent={handleHideFrequent}
        onOpenRecipeBuilder={function () { setEditingRecipe(null); setShowRecipeBuilder(true); }}
        onOpenAddSheet={function () { setAddSheetVisible(true); }}
        onCloseAddSheet={function () { setAddSheetVisible(false); }}
        onOpenMealTypePicker={function () { setMealTypePickerVisible(true); }}
        onCloseMealTypePicker={function () { setMealTypePickerVisible(false); }}
        onSelectMealType={function (type) { setMealType(type); setMealTypePickerVisible(false); }}
        onCloseServingsPrompt={function () { setServingsPromptName(null); }}
        onServingsInputChange={setServingsInput}
        onSaveServingsPrompt={saveServingsPrompt}
        onOpenScanner={function () { setAddSheetVisible(false); setScannerVisible(true); }}
        onOpenPhotoScanner={function () { setAddSheetVisible(false); setPhotoScannerFromGallery(false); setPhotoScannerVisible(true); }}
        onOpenGalleryScanner={function () { setAddSheetVisible(false); setPhotoScannerFromGallery(true); setPhotoScannerVisible(true); }}
        onEnterManually={function () {
          setAddSheetVisible(false);
          setPendingFood({ name: "", carbs_g: null, sugar_g: null, calories: null, caffeine_mg: null, sodium_mg: null, source_db: "manual" });
          setSearchResults([]);
        }}
      />

      {/* Alcohol section */}
      {!hiddenSections.includes('booze') && (
        <AlcoholSection
          theme={theme}
          ink={ink}
          card={card}
          collapsed={alcoholCollapsed}
          subQuery={subQuery}
          subResults={subResults}
          subSearching={subSearching}
          subSearchError={subSearchError}
          pendingSub={pendingSub}
          subEntries={subEntries}
          subTotals={subTotals}
          subLoading={subLoading}
          totalBlockStyle={styles.totalBlock}
          totalBlockLabelStyle={styles.totalBlockLabel}
          totalBlockValueStyle={styles.totalBlockValue}
          sectionLabelStyle={styles.sectionLabel}
          onToggleCollapse={function () { setAlcoholCollapsed(v => !v); }}
          onSubQueryChange={handleSubQueryChange}
          onSubSearch={handleSubSearch}
          onOpenSubScanner={function () { setSubScannerVisible(true); }}
          onAddManually={function () {
            setPendingSub({ name: "", substance_type: "alcohol", caffeine_mg: null, abv_percent: null, volume_ml: null, source_db: "manual" });
            setSubResults([]);
          }}
          onSelectSubResult={handleSelectSubResult}
          onLogSubstance={handleLogSubstance}
          onCancelPendingSub={function () { setPendingSub(null); }}
          onDeleteSubstance={handleDeleteSubstance}
        />
      )}

      {/* Today's meals list */}
      <TodaysMeals
        theme={theme}
        ink={ink}
        meals={meals}
        loadingMeals={loadingMeals}
        mealsError={mealsError}
        collapsedGroups={collapsedGroups}
        expandedMealId={expandedMealId}
        editingMealId={editingMealId}
        glucoseData={glucoseData}
        loadingGlucose={loadingGlucose}
        glucoseErrors={glucoseErrors}
        tourHistoryRef={tourHistoryRef}
        cardStyles={{ cardTitle: styles.cardTitle, sectionLabel: styles.sectionLabel, mealCard: styles.mealCard, mealContent: styles.mealContent, mealMain: styles.mealMain, iconBtn: styles.iconBtn, glucosePanel: styles.glucosePanel }}
        onToggleGroup={function (groupType) {
          Haptics.selectionAsync();
          setCollapsedGroups(prev => {
            const next = new Set(prev);
            if (next.has(groupType)) next.delete(groupType); else next.add(groupType);
            return next;
          });
        }}
        onToggleGlucose={handleToggleGlucose}
        onOpenEdit={handleOpenEdit}
        onSaveEdit={handleSaveEdit}
        onCancelEdit={function () { setEditingMealId(null); }}
        onAddServing={handleAddServing}
        onDeleteMeal={handleDeleteMeal}
        onOpenLogMeal={function () {
          setPendingFood({ name: "", carbs_g: null, sugar_g: null, calories: null, caffeine_mg: null, sodium_mg: null, source_db: "manual" });
          setSearchResults([]);
          scrollViewRef.current?.scrollTo({ y: 0, animated: true });
        }}
        onRetryLoad={loadMeals}
      />

      <FoodReportModal
        theme={theme}
        visible={showFoodReport}
        foodReport={foodReport}
        cardTitleStyle={styles.cardTitle}
        sectionLabelStyle={styles.sectionLabel}
        onClose={function () { setShowFoodReport(false); }}
      />

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
        autoOpenGallery={photoScannerFromGallery}
        onClose={function () { setPhotoScannerVisible(false); }}
        onResult={function (food) { handleSelectFood(food); }}
        onResults={function (foods) { handleLogMultipleFoods(foods); }}
        onManualAdd={function () { setPendingFood({ name: "", carbs_g: null, sugar_g: null, calories: null, caffeine_mg: null, sodium_mg: null, source_food_id: undefined, source_db: "manual" }); }}
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
    <FeatureIntroSheet intro={mealsIntro} visible={introVisible} onClose={dismissIntro} />
    </View>
    </KeyboardAvoidingView>
  );
}

function makeStyles(ink: string, card: string, border: string, coral: string) {
  return StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 40 },

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

  card: {
    borderRadius: 22,
    borderWidth: 2,
    borderColor: border,
    padding: 14,
    ...coloredShadow(coral),
  },
  cardTitle: { fontSize: 16, fontWeight: "700", letterSpacing: -0.3, marginBottom: 8 },

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

  typePill: {
    flexDirection: "row", alignItems: "center", alignSelf: "flex-start",
    borderWidth: 2, borderRadius: 999,
    paddingHorizontal: 12, paddingVertical: 6, marginBottom: 8,
  },

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
  mealMain: { flex: 1, flexDirection: "row", alignItems: "flex-start" },
  iconBtn: { padding: 6, marginLeft: 2 },
  glucosePanel: { borderTopWidth: 1, marginHorizontal: 10, paddingTop: 10, paddingBottom: 10 },
  });
}
