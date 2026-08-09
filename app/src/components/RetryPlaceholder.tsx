/**
 * Inline retry — sits INSIDE a screen when a specific card/section failed
 * to load, so the rest of the screen still works.
 */

import React from "react";
import { View, StyleSheet } from "react-native";
import { ScaledText } from "./ScaledText";
import { Button } from "./Button";
import { useTheme } from "../theme/ThemeContext";

interface Props {
  message?: string;
  onRetry: () => void;
  compact?: boolean;
}

export function RetryPlaceholder({ message = "Couldn't load this", onRetry, compact = false }: Props) {
  const { theme } = useTheme();
  return (
    <View style={[styles.wrap, { borderColor: theme.cardBorder ?? theme.ink + "22", paddingVertical: compact ? 16 : 28 }]}>
      <ScaledText size={13} color={theme.textSoft} center>{message}</ScaledText>
      <Button label="Retry" variant="ghost" size="sm" onPress={onRetry} hapticFeedback="tap" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: "dashed",
  },
});
