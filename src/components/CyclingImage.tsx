import React, { useEffect, useState } from "react";
import { Image, ImageStyle, StyleProp, Text, View } from "react-native";
import { useTheme } from "../theme/ThemeContext";

// Base URL for the free-exercise-db image set.
export const EXERCISE_IMAGE_BASE =
  "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/";

// Single canonical cycle speed (previously 1s in ExerciseCard, 2s in modals).
const CYCLE_INTERVAL_MS = 1000;

/**
 * Cycles through the provided exercise image list so the exercise animates.
 * Shared by ExerciseCard, ExerciseSearchModal, and WorkoutPlannerModal.
 * Falls back to a pastel activity-tint placeholder when no images exist.
 */
export function CyclingImage({
  images,
  style,
}: {
  images: string[];
  style: StyleProp<ImageStyle>;
}) {
  const [idx, setIdx] = useState(0);
  const { theme } = useTheme();

  useEffect(() => {
    if (images.length <= 1) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % images.length), CYCLE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [images.length]);

  if (images.length === 0 || !images[idx]) {
    return (
      <View
        style={[
          style,
          { backgroundColor: theme.teal.tint, alignItems: "center", justifyContent: "center" },
        ]}
      >
        <Text style={{ fontSize: 32 }}>🏋️</Text>
      </View>
    );
  }
  return <Image source={{ uri: EXERCISE_IMAGE_BASE + images[idx] }} style={style} resizeMode="cover" />;
}
