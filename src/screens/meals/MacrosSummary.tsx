/**
 * MacrosSummary — totals strip + macro donut card for MealsScreen.
 */
import React from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { ShadowCard } from "../../components/ShadowCard";
import { onSolid } from "../../theme/colorUtils";
import { FONT_SIZES } from "../../theme/tokens";
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
      {/* Totals strip — horizontal scroll so chips never clip */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingRight: 4 }}
          style={{ flex: 1 }}
          bounces={false}
        >
          {totals.calories !== null ? (
            <View style={[chipStyle, { backgroundColor: theme.berry.solid }]} accessibilityLabel={`Calories today ${totals.calories}`}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <Ionicons name="flame" size={13} color={onSolid(theme.berry.solid)} />
                <Text style={[labelStyle, { color: onSolid(theme.berry.solid) }]}>CAL</Text>
              </View>
              <Text style={[valueStyle, { color: onSolid(theme.berry.solid) }]} numberOfLines={1}>{totals.calories}</Text>
            </View>
          ) : null}
          {totals.carbs !== null ? (
            <View style={[chipStyle, { backgroundColor: theme.teal.solid }]} accessibilityLabel={`Carbs ${totals.carbs} grams`}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <Ionicons name="nutrition-outline" size={13} color={onSolid(theme.teal.solid)} />
                <Text style={[labelStyle, { color: onSolid(theme.teal.solid) }]}>CARBS</Text>
              </View>
              <Text style={[valueStyle, { color: onSolid(theme.teal.solid) }]} numberOfLines={1}>{totals.carbs}g</Text>
            </View>
          ) : null}
          {totals.sugar !== null ? (
            <View style={[chipStyle, { backgroundColor: theme.coral.solid }]} accessibilityLabel={`Sugar ${totals.sugar} grams`}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <Ionicons name="ice-cream-outline" size={13} color={onSolid(theme.coral.solid)} />
                <Text style={[labelStyle, { color: onSolid(theme.coral.solid) }]}>SUGAR</Text>
              </View>
              <Text style={[valueStyle, { color: onSolid(theme.coral.solid) }]} numberOfLines={1}>{totals.sugar}g</Text>
            </View>
          ) : null}
          {totals.sodium !== null ? (
            <View style={[chipStyle, { backgroundColor: theme.amber.solid }]} accessibilityLabel={`Sodium ${totals.sodium} milligrams`}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <Ionicons name="water-outline" size={13} color={onSolid(theme.amber.solid)} />
                <Text style={[labelStyle, { color: onSolid(theme.amber.solid) }]}>NA</Text>
              </View>
              <Text style={[valueStyle, { color: onSolid(theme.amber.solid) }]} numberOfLines={1}>{totals.sodium}mg</Text>
            </View>
          ) : null}
          {totals.caffeine !== null ? (
            <View style={[chipStyle, { backgroundColor: theme.violet.solid }]} accessibilityLabel={`Caffeine ${totals.caffeine} milligrams`}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <Ionicons name="flash-outline" size={13} color={onSolid(theme.violet.solid)} />
                <Text style={[labelStyle, { color: onSolid(theme.violet.solid) }]}>CAF</Text>
              </View>
              <Text style={[valueStyle, { color: onSolid(theme.violet.solid) }]} numberOfLines={1}>{totals.caffeine}mg</Text>
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
              <Text style={{ fontSize: FONT_SIZES.subheading, fontWeight: "700", color: theme.textStrong, marginBottom: 2 }}>Today's macros</Text>
              {totals.carbs !== null && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: theme.teal.solid }} />
                  <Text style={{ fontSize: FONT_SIZES.body, color: theme.textSoft }}>Carbs</Text>
                  <Text style={{ fontSize: FONT_SIZES.body, fontWeight: "700", color: theme.textStrong, marginLeft: "auto" }}>{totals.carbs}g</Text>
                </View>
              )}
              {totals.sugar !== null && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: theme.coral.solid }} />
                  <Text style={{ fontSize: FONT_SIZES.body, color: theme.textSoft }}>Sugar</Text>
                  <Text style={{ fontSize: FONT_SIZES.body, fontWeight: "700", color: theme.textStrong, marginLeft: "auto" }}>{totals.sugar}g</Text>
                </View>
              )}
              {totals.caffeine !== null && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: theme.violet.solid }} />
                  <Text style={{ fontSize: FONT_SIZES.body, color: theme.textSoft }}>Caffeine</Text>
                  <Text style={{ fontSize: FONT_SIZES.body, fontWeight: "700", color: theme.textStrong, marginLeft: "auto" }}>{totals.caffeine}mg</Text>
                </View>
              )}
              <Text style={{ fontSize: FONT_SIZES.caption, color: theme.textSoft, marginTop: 4 }}>Tap ring for legend</Text>
            </View>
          </View>
        </ShadowCard>
      )}
    </>
  );
}

// ─── Local styles (inline so no StyleSheet dependency needed) ─────────────────

const chipStyle = {
  borderRadius: 18,
  borderWidth: 2,
  borderColor: "rgba(0,0,0,0.12)",
  paddingHorizontal: 12,
  paddingVertical: 8,
  minWidth: 64,
  shadowColor: "rgba(60,40,20,0.1)",
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.10,
  shadowRadius: 10,
  elevation: 3,
} as const;

const labelStyle = { fontSize: FONT_SIZES.micro, fontWeight: "800" as const, letterSpacing: 0.6 };
const valueStyle = { fontSize: 18, fontWeight: "800" as const, marginTop: 2 };
