import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";

interface UndoBannerProps {
  message: string;
  onUndo: () => void;
  theme: any;
}

export function UndoBanner({ message, onUndo, theme }: UndoBannerProps) {
  return (
    <View style={[styles.banner, { backgroundColor: theme.card, borderColor: theme.ink }]}>
      <Text style={{ color: theme.textStrong, flex: 1, fontSize: 13 }}>{message}</Text>
      <Pressable onPress={onUndo} hitSlop={12}>
        <Text style={{ color: theme.teal.fg, fontWeight: "800", fontSize: 13 }}>UNDO</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    bottom: 16,
    left: 16,
    right: 16,
    borderRadius: 12,
    borderWidth: 2,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    zIndex: 100,
  },
});
