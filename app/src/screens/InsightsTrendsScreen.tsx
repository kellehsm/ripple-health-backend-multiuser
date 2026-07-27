import React, { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { InsightsScreen } from "./InsightsScreen";
import { TrendsScreen } from "./TrendsScreen";

export function InsightsTrendsScreen({ route }: any) {
  const { theme } = useTheme();
  const initialTab: "insights" | "trends" = route?.params?.tab ?? "insights";
  const [tab, setTab] = useState<"insights" | "trends">(initialTab);

  const tabBtn = (id: "insights" | "trends", label: string) => {
    const active = tab === id;
    return (
      <Pressable
        key={id}
        onPress={() => setTab(id)}
        style={{
          flex: 1,
          paddingVertical: 8,
          alignItems: "center",
          borderBottomWidth: 2.5,
          borderBottomColor: active ? theme.ink : "transparent",
        }}
      >
        <Text style={{ fontSize: 13, fontWeight: "900", color: active ? theme.textStrong : theme.textSoft }}>
          {label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.page }}>
      {/* Top tab bar */}
      <View style={{ flexDirection: "row", borderBottomWidth: 1.5, borderBottomColor: theme.cardBorder }}>
        {tabBtn("insights", "💡 Insights")}
        {tabBtn("trends", "📈 Trends")}
      </View>

      {/* Content — conditionally mount each screen */}
      {tab === "insights" && (
        <View style={{ flex: 1 }}>
          <InsightsScreen />
        </View>
      )}
      {tab === "trends" && (
        <View style={{ flex: 1 }}>
          <TrendsScreen />
        </View>
      )}
    </View>
  );
}
