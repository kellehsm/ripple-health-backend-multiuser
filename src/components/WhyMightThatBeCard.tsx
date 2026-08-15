import React, { useCallback, useState } from "react";
import { View, Text } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { ShadowCard } from "./ShadowCard";
import { api } from "../api/client";

// Sits directly under WhatChangedCard on the Home tab. Renders 0–2 descriptive
// "something to notice" observations built server-side from N-of-last-M
// pattern counts. Never causal, never diagnostic — per CLAUDE.md correlation
// language rules. Returns null when there are no qualifying patterns.
export function WhyMightThatBeCard() {
  const { theme } = useTheme();
  const [notices, setNotices] = useState<{ text: string }[] | null>(null);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    api.whyMightThatBe()
      .then((d) => { if (!cancelled) setNotices(d?.notices ?? []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []));

  if (!notices || notices.length === 0) return null;

  const violet = (theme as any).violet ?? {};
  const accent = violet.solid ?? theme.teal.solid;

  return (
    <ShadowCard size="card" accent={accent} rotate={0.2} cardId="why_might_that_be">
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <Ionicons name="bulb-outline" size={16} color={accent} />
        <Text style={{ color: theme.textStrong, fontSize: 13, fontWeight: "800", letterSpacing: 0.4 }}>
          WHY MIGHT THAT BE
        </Text>
      </View>
      <View style={{ gap: 8 }}>
        {notices.map((n, i) => (
          <Text key={i} style={{ color: theme.textStrong, fontSize: 13, lineHeight: 19 }}>
            {n.text}
          </Text>
        ))}
      </View>
    </ShadowCard>
  );
}
