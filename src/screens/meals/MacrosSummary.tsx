/**
 * MacrosSummary — totals strip + macro donut card for MealsScreen.
 */
import React from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { ShadowCard } from "../../components/ShadowCard";
import { onSolid } from "../../theme/colorUtils";
import { MacroDonut } from "./MealCards";

// ─── Types ────────────────────────────────────────────────────────────────────

export type MacroTotals = {
  calories: number | null;
  carbs: number | null;
  sugar: number | null;
  caffeine: number | null;
  sodium: number | null;
};

export type MacrosSummaryProps = {
  theme: any;
  totals: MacroTotals;
  foodReport: Array<{ meal_name: string; avg_spike: number; sample_count: number }>;
  cardTitleStyle: any;
  onOpenFoodReport: () => void;
};

// ─── MacrosSummary ────────────────────────────────────────────────────────────

export function MacrosSummary({ theme, totals, foodReport, cardTitleStyle, onOpenFoodReport }: MacrosSummaryProps) {
  return (
    <>
      {/* Totals strip */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 8 }} style={{ flex: 1 }}>
          {totals.calories !== null ? (
            <View style={[chipStyle, { backgroundColor: theme.berry.solid, flexDirection: "row", alignItems: "center", gap: 6 }]} accessibilityLabel={`Calories today ${totals.calories}`}>
              <Ionicons name="flame" size={14} color={onSolid(theme.berry.solid)} />
              <Text style={[labelStyle, { color: onSolid(theme.berry.solid) }]} allowFontScaling maxFontSizeMultiplier={1.3}>CAL</Text>
              <Text style={[valueStyle, { color: onSolid(theme.berry.solid), marginLeft: 4 }]} numberOfLines={1} adjustsFontSizeToFit allowFontScaling maxFontSizeMultiplier={1.3}>{totals.calories}</Text>
            </View>
          ) : null}
          {totals.carbs !== null ? (
            <View style={[chipStyle, { backgroundColor: theme.teal.solid, flexDirection: "row", alignItems: "center", gap: 6 }]} accessibilityLabel={`Carbs ${totals.carbs} grams`}>
              <Ionicons name="nutrition-outline" size={14} color={onSolid(theme.teal.solid)} />
              <Text style={[labelStyle, { color: onSolid(theme.teal.solid) }]} allowFontScaling maxFontSizeMultiplier={1.3}>CARBS</Text>
              <Text style={[valueStyle, { color: onSolid(theme.teal.solid), marginLeft: 4 }]} numberOfLines={1} adjustsFontSizeToFit allowFontScaling maxFontSizeMultiplier={1.3}>{totals.carbs}g</Text>
            </View>
          ) : null}
          {totals.sugar !== null ? (
            <View style={[chipStyle, { backgroundColor: theme.coral.solid, flexDirection: "row", alignItems: "center", gap: 6 }]} accessibilityLabel={`Sugar ${totals.sugar} grams`}>
              <Ionicons name="ice-cream-outline" size={14} color={onSolid(theme.coral.solid)} />
              <Text style={[labelStyle, { color: onSolid(theme.coral.solid) }]} allowFontScaling maxFontSizeMultiplier={1.3}>SUGAR</Text>
              <Text style={[valueStyle, { color: onSolid(theme.coral.solid), marginLeft: 4 }]} numberOfLines={1} adjustsFontSizeToFit allowFontScaling maxFontSizeMultiplier={1.3}>{totals.sugar}g</Text>
            </View>
          ) : null}
          {totals.sodium !== null ? (
            <View style={[chipStyle, { backgroundColor: theme.amber.solid, flexDirection: "row", alignItems: "center", gap: 6 }]} accessibilityLabel={`Sodium ${totals.sodium} milligrams`}>
              <Ionicons name="water-outline" size={14} color={onSolid(theme.amber.solid)} />
              <Text style={[labelStyle, { color: onSolid(theme.amber.solid) }]} allowFontScaling maxFontSizeMultiplier={1.3}>SODIUM</Text>
              <Text style={[valueStyle, { color: onSolid(theme.amber.solid), marginLeft: 4 }]} numberOfLines={1} adjustsFontSizeToFit allowFontScaling maxFontSizeMultiplier={1.3}>{totals.sodium}mg</Text>
            </View>
          ) : null}
          {totals.caffeine !== null ? (
            <View style={[chipStyle, { backgroundColor: theme.violet.solid, flexDirection: "row", alignItems: "center", gap: 6 }]} accessibilityLabel={`Caffeine ${totals.caffeine} milligrams`}>
              <Ionicons name="flash-outline" size={14} color={onSolid(theme.violet.solid)} />
              <Text style={[labelStyle, { color: onSolid(theme.violet.solid) }]} allowFontScaling maxFontSizeMultiplier={1.3}>CAFFEINE</Text>
              <Text style={[valueStyle, { color: onSolid(theme.violet.solid), marginLeft: 4 }]} numberOfLines={1} adjustsFontSizeToFit allowFontScaling maxFontSizeMultiplier={1.3}>{totals.caffeine}mg</Text>
            </View>
          ) : null}
        </ScrollView>
        {foodReport.length >= 3 ? (
          <Pressable
            onPress={function () { Haptics.selectionAsync(); onOpenFoodReport(); }}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Open food impact insights"
            style={{ padding: 8, borderRadius: 12, borderWidth: 1.5, borderColor: theme.berry.solid, backgroundColor: theme.berry.tint }}
          >
            <Ionicons name="analytics-outline" size={18} color={theme.berry.solid} />
          </Pressable>
        ) : null}
      </View>

      {/* Macro donut card */}
      {(totals.carbs !== null || totals.sugar !== null || totals.caffeine !== null) && (
        <ShadowCard size="card" cardId="macro_donut">
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <MacroDonut
              carbs={totals.carbs}
              sugar={totals.sugar}
              caffeine={totals.caffeine}
              calories={totals.calories}
              carbColor={theme.teal.solid}
              sugarColor={theme.coral.solid}
              caffeineColor={theme.violet.solid}
            />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={[cardTitleStyle, { color: theme.textStrong, marginBottom: 2 }]}>Today's macros</Text>
              {totals.carbs !== null && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: theme.teal.solid }} />
                  <Text style={{ fontSize: 12, color: theme.textSoft }}>Carbs</Text>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: theme.textStrong, marginLeft: "auto" }}>{totals.carbs}g</Text>
                </View>
              )}
              {totals.sugar !== null && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: theme.coral.solid }} />
                  <Text style={{ fontSize: 12, color: theme.textSoft }}>Sugar</Text>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: theme.textStrong, marginLeft: "auto" }}>{totals.sugar}g</Text>
                </View>
              )}
              {totals.caffeine !== null && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: theme.violet.solid }} />
                  <Text style={{ fontSize: 12, color: theme.textSoft }}>Caffeine</Text>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: theme.textStrong, marginLeft: "auto" }}>{totals.caffeine}mg</Text>
                </View>
              )}
              <Text style={{ fontSize: 10, color: theme.textSoft, marginTop: 4 }}>Tap ring for legend</Text>
            </View>
          </View>
        </ShadowCard>
      )}
    </>
  );
}

// ─── Local styles (inline so no StyleSheet dependency needed) ─────────────────

const chipStyle = {
  flex: 1,
  borderRadius: 22,
  borderWidth: 2,
  borderColor: "rgba(0,0,0,0.12)",
  padding: 10,
  shadowColor: "rgba(60,40,20,0.1)",
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.10,
  shadowRadius: 12,
  elevation: 3,
} as const;

const labelStyle = { fontSize: 9, fontWeight: "800" as const, letterSpacing: 0.6, marginBottom: 0 };
const valueStyle = { fontSize: 20, fontWeight: "800" as const };
