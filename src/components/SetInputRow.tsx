import React from "react";
import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { useTheme } from "../theme/ThemeContext";

type Props = {
  index: number;
  value: string;
  onChange: (v: string) => void;
  onRemove?: () => void; // omit if this set can't be removed
  placeholder?: string;
};

/**
 * One row of the sets-per-rep grid used in ExerciseSearchModal and
 * WorkoutPlannerModal. Kept as a primitive so per-set input styling stays
 * consistent when we later add features (RPE, weight per set, etc).
 */
export function SetInputRow({ index, value, onChange, onRemove, placeholder = "—" }: Props) {
  const { theme } = useTheme();
  const ink = theme.ink;
  return (
    <View style={styles.row}>
      <Text style={[styles.label, { color: theme.textSoft }]} allowFontScaling maxFontSizeMultiplier={1.3}>
        Set {index + 1}
      </Text>
      <View style={[styles.field, { backgroundColor: theme.card, borderColor: ink }]}>
        <TextInput
          style={[styles.input, { color: theme.textStrong }]}
          value={value}
          onChangeText={onChange}
          keyboardType="numeric"
          placeholder={placeholder}
          placeholderTextColor={theme.textSoft}
          accessibilityLabel={`Reps for set ${index + 1}`}
          maxFontSizeMultiplier={1.3}
        />
      </View>
      {onRemove ? (
        <Pressable
          onPress={onRemove}
          hitSlop={8}
          style={styles.remove}
          accessibilityRole="button"
          accessibilityLabel={`Remove set ${index + 1}`}
        >
          <Text style={{ color: theme.textSoft, fontSize: 18, lineHeight: 20 }}>×</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 },
  label: { width: 56, fontSize: 12, fontWeight: "700" },
  field: { flex: 1, borderWidth: 2, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  input: { fontSize: 15, fontWeight: "600", paddingVertical: 4 },
  remove: { padding: 6 },
});
