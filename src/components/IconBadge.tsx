import React from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface Props {
  name: string;
  color: string;       // icon color
  bgColor: string;     // container background
  size?: number;       // icon size (default 20)
  containerSize?: number;  // container size (default 36)
  borderRadius?: number;   // default 10
}

export function IconBadge({ name, color, bgColor, size = 20, containerSize = 36, borderRadius = 10 }: Props) {
  return (
    <View style={{
      width: containerSize, height: containerSize, borderRadius,
      backgroundColor: bgColor, alignItems: "center", justifyContent: "center",
    }}>
      <Ionicons name={name as any} size={size} color={color} />
    </View>
  );
}
