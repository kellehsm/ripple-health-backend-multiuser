import React from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";

type Props = {
  title: string;
  onClose?: () => void;
  right?: React.ReactNode; // optional trailing action (Save, Edit, etc.)
};

export function ModalHeader({ title, onClose, right }: Props) {
  const { theme } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
      <Text
        style={{ color: theme.textStrong, fontSize: 19, fontWeight: "900", letterSpacing: -0.5, flex: 1 }}
        allowFontScaling
        maxFontSizeMultiplier={1.4}
        accessibilityRole="header"
      >
        {title}
      </Text>
      {right}
      {onClose ? (
        <Pressable
          onPress={onClose}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Close ${title}`}
        >
          <Ionicons name="close" size={22} color={theme.textSoft} />
        </Pressable>
      ) : null}
    </View>
  );
}
