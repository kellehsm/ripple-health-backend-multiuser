import React, { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ScreenBackground } from "../components/ScreenBackground";
import { useTheme } from "../theme/ThemeContext";
import { FONT_SIZES } from "../theme/tokens";
import { InsightsScreen } from "./InsightsScreen";
import { TrendsScreen } from "./TrendsScreen";

export function InsightsTrendsScreen({ route }: any) {
  const { theme } = useTheme();
  const initialTab: "insights" | "trends" = route?.params?.tab ?? "insights";
  const [tab, setTab] = useState<"insights" | "trends">(initialTab);

  const TAB_META: Record<"insights" | "trends", { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
    insights: { label: "Insights", icon: "bulb-outline" },
    trends: { label: "Trends", icon: "trending-up-outline" },
  };

  const tabBtn = (id: "insights" | "trends") => {
    const active = tab === id;
    const { label, icon } = TAB_META[id];
    return (
      <Pressable
        key={id}
        onPress={() => setTab(id)}
        accessibilityRole="tab"
        accessibilityState={{ selected: tab === id }}
        style={{
          flex: 1,
          paddingVertical: 8,
          alignItems: "center",
          flexDirection: "row",
          justifyContent: "center",
          gap: 5,
          borderBottomWidth: 2.5,
          borderBottomColor: active ? theme.teal.solid : "transparent",
        }}
      >
        <Ionicons name={icon} size={15} color={active ? theme.textStrong : theme.textSoft} />
        <Text style={{ fontSize: FONT_SIZES.label, fontWeight: "900", color: active ? theme.textStrong : theme.textSoft }}>
          {label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.page }}>
      <ScreenBackground pageId="insights_trends" />
      {/* Top tab bar */}
      <View style={{ flexDirection: "row", borderBottomWidth: 1.5, borderBottomColor: theme.cardBorder }}>
        {tabBtn("insights")}
        {tabBtn("trends")}
      </View>

      {/* Both screens stay mounted; only visibility changes to preserve scroll position */}
      <View style={{ flex: 1, display: tab === "insights" ? "flex" : "none" }}>
        <InsightsScreen />
      </View>
      <View style={{ flex: 1, display: tab === "trends" ? "flex" : "none" }}>
        <TrendsScreen />
      </View>
    </View>
  );
}
