/**
 * overview/InsightsPreviewCard.tsx
 * The "Insights" preview card on the home dashboard.
 * Renders a horizontal swipeable carousel with pagination dots and auto-advance.
 */
import React, { useRef, useState, useEffect } from "react";
import { View, Text, ScrollView, Pressable, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../theme/ThemeContext";
import { onSolid } from "../../theme/colorUtils";
import { ShadowCard } from "../../components/ShadowCard";
import { SkeletonBox } from "./shared";
import { FONT_SIZES } from "../../theme/tokens";
import { type Insight } from "../../components/InsightCard";

interface Props {
  loading: boolean;
  insights: string[];
  tourInsightsRef: React.RefObject<View | null>;
  allInsights?: Insight[];
  onSeeAll?: () => void;
}

export function InsightsPreviewCard({ loading, insights, tourInsightsRef, allInsights, onSeeAll }: Props) {
  const { theme } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  // card padding is 14 on each side (28 total), outer padding is 32 total
  const contentWidth = screenWidth - 60;

  const [currentIdx, setCurrentIdx] = useState(0);
  const carouselRef = useRef<ScrollView>(null);
  const autoAdvanceRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(function () {
    if (insights.length <= 1) return;
    autoAdvanceRef.current = setInterval(function () {
      setCurrentIdx(function (prev) {
        const next = (prev + 1) % insights.length;
        carouselRef.current?.scrollTo({ x: next * contentWidth, animated: true });
        return next;
      });
    }, 5000);
    return function () {
      if (autoAdvanceRef.current) clearInterval(autoAdvanceRef.current);
    };
  }, [insights.length, contentWidth]);

  if (loading) {
    return (
      <ShadowCard size="card">
        <SkeletonBox style={{ height: 18, width: "40%", marginBottom: 12 }} />
        <SkeletonBox style={{ height: 14, width: "90%", marginBottom: 8 }} />
        <SkeletonBox style={{ height: 14, width: "75%" }} />
      </ShadowCard>
    );
  }

  if (insights.length === 0) return null;

  return (
    <View ref={tourInsightsRef}>
      <ShadowCard size="card" accent={theme.violet.solid} cardId="insights_preview">
        {/* Header row */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{
              width: 26, height: 26, borderRadius: 12, borderWidth: 2,
              borderColor: theme.ink, alignItems: "center", justifyContent: "center",
              backgroundColor: theme.violet.solid,
            }}>
              <Ionicons name="bulb-outline" size={14} color={onSolid(theme.violet.solid)} />
            </View>
            <Text style={{ fontSize: FONT_SIZES.subheading, fontWeight: "900", letterSpacing: -0.5, color: theme.textStrong }}>Insights</Text>
          </View>
          {onSeeAll && (
            <Pressable onPress={onSeeAll} accessibilityRole="button" accessibilityLabel="See all insights" hitSlop={10}>
              <Text style={{ fontSize: FONT_SIZES.caption, color: theme.teal.solid, fontWeight: "700" }}>See all →</Text>
            </Pressable>
          )}
        </View>

        {/* Carousel */}
        <ScrollView
          ref={carouselRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onMomentumScrollEnd={function (e) {
            const idx = Math.round(e.nativeEvent.contentOffset.x / contentWidth);
            setCurrentIdx(idx);
            // reset auto-advance timer on manual swipe
            if (autoAdvanceRef.current) clearInterval(autoAdvanceRef.current);
            if (insights.length > 1) {
              autoAdvanceRef.current = setInterval(function () {
                setCurrentIdx(function (prev) {
                  const next = (prev + 1) % insights.length;
                  carouselRef.current?.scrollTo({ x: next * contentWidth, animated: true });
                  return next;
                });
              }, 5000);
            }
          }}
          style={{ width: contentWidth }}
        >
          {insights.map(function (obs, i) {
            return (
              <View key={i} style={{ width: contentWidth, justifyContent: "center", minHeight: 48 }}>
                <Text style={{ color: theme.textStrong, fontSize: FONT_SIZES.body, lineHeight: 20, fontWeight: "600" }}>
                  {obs}
                </Text>
              </View>
            );
          })}
        </ScrollView>

        {/* Pagination dots */}
        {insights.length > 1 && (
          <View style={{ flexDirection: "row", justifyContent: "center", gap: 5, marginTop: 10 }}>
            {insights.map(function (_, i) {
              return (
                <View
                  key={i}
                  style={{
                    width: i === currentIdx ? 16 : 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: i === currentIdx ? theme.violet.solid : theme.violet.tint,
                  }}
                />
              );
            })}
          </View>
        )}
      </ShadowCard>
    </View>
  );
}
