import React from "react";
import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LoadingIndicator } from "./LoadingIndicator";
import { useTheme } from "../theme/ThemeContext";
import { onSolid } from "../theme/colorUtils";
import { layeredShadow } from "../theme/styleUtils";

type SecondaryAction = {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  accessibilityLabel?: string;
};

type Props = {
  placeholder: string;
  query: string;
  onQueryChange: (q: string) => void;
  onSubmit: () => void;
  searching: boolean;
  accentColor: string;        // theme.coral.solid, theme.purple.solid, etc.
  actions: SecondaryAction[]; // barcode, photo, manual, etc.
  error?: string | null;
  errorColor?: string;
};

export function SearchScanBar({
  placeholder, query, onQueryChange, onSubmit, searching, accentColor, actions, error, errorColor,
}: Props) {
  const { theme, isDark } = useTheme();
  const ink = theme.ink;
  return (
    <View>
      <View style={styles.searchRow}>
        <TextInput
          placeholder={placeholder}
          value={query}
          onChangeText={onQueryChange}
          onSubmitEditing={onSubmit}
          style={[styles.textInput, { color: theme.textStrong, flex: 1, borderColor: ink, backgroundColor: theme.card }]}
          placeholderTextColor={theme.textSoft}
          returnKeyType="search"
          accessibilityLabel={placeholder}
        />
        <Pressable
          style={[styles.actionBtn, { backgroundColor: accentColor, borderColor: ink, ...layeredShadow("card", isDark) }]}
          onPress={onSubmit}
          accessibilityRole="button"
          accessibilityLabel="Search"
          accessibilityState={{ busy: searching }}
        >
          {searching ? (
            <LoadingIndicator color={onSolid(accentColor)} size="small" />
          ) : (
            <Text style={[styles.actionBtnText, { color: onSolid(accentColor) }]}>SEARCH</Text>
          )}
        </Pressable>
      </View>

      <View style={styles.belowRow}>
        {actions.map((a, i) => (
          <Pressable
            key={i}
            onPress={a.onPress}
            style={[styles.secondaryBtn, { borderColor: ink, backgroundColor: theme.card, ...layeredShadow("card", isDark) }]}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={a.accessibilityLabel ?? a.label}
          >
            {a.icon ? <Ionicons name={a.icon} size={15} color={ink} /> : null}
            <Text style={[styles.secondaryBtnText, { color: ink }]}>{a.label}</Text>
          </Pressable>
        ))}
      </View>

      {error ? (
        <Text style={{ color: errorColor ?? theme.coral.sub, fontSize: 12, marginTop: 6 }}>{error}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  searchRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  textInput: {
    borderWidth: 2,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    minHeight: 44,
  },
  actionBtn: {
    borderWidth: 2,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  actionBtnText: { fontSize: 12, fontWeight: "800", letterSpacing: 0.4 },
  belowRow: { flexDirection: "row", gap: 8, marginTop: 8, flexWrap: "wrap" },
  secondaryBtn: {
    flexDirection: "row",
    gap: 4,
    alignItems: "center",
    borderWidth: 2,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minHeight: 36,
  },
  secondaryBtnText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.4 },
});
