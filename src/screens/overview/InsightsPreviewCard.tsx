/**
 * overview/InsightsPreviewCard.tsx
 * The "Insights" preview card on the home dashboard.
 * Extracted from OverviewScreen.tsx — no logic changes.
 */
import React from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../theme/ThemeContext";
import { onSolid } from "../../theme/colorUtils";
import { ShadowCard } from "../../components/ShadowCard";
import { SkeletonBox } from "./shared";
import { FONT_SIZES } from "../../theme/tokens";

interface Props {
  loading: boolean;
  insights: string[];
  tourInsightsRef: React.RefObject<View | null>;
}

export function InsightsPreviewCard({ loading, insights, tourInsightsRef }: Props) {
  const { theme } = useTheme();

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
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <View style={{
            width: 26, height: 26, borderRadius: 12, borderWidth: 2,
            borderColor: theme.ink, alignItems: "center", justifyContent: "center",
            backgroundColor: theme.violet.solid,
          }}>
            <Ionicons name="bulb-outline" size={14} color={onSolid(theme.violet.solid)} />
          </View>
          <Text style={{ fontSize: FONT_SIZES.subheading, fontWeight: "900", letterSpacing: -0.5, color: theme.textStrong }}>Insights</Text>
        </View>
        {insights.map((obs, i) => (
          <View key={i} style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 5 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, marginTop: 6, flexShrink: 0, backgroundColor: theme.violet.solid }} />
            <Text style={{ color: theme.textStrong, fontSize: FONT_SIZES.body, lineHeight: 20, flex: 1, fontWeight: "600" }}>{obs}</Text>
          </View>
        ))}
      </ShadowCard>
    </View>
  );
}
