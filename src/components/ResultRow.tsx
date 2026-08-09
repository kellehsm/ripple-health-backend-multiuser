import React, { ReactNode } from "react";
import { View, Text, Pressable, Animated, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { IconBadge } from "./IconBadge";
import { layeredShadow } from "../theme/styleUtils";
import { useTheme } from "../theme/ThemeContext";
import { usePressScale } from "../hooks/usePressScale";

type Props = {
  title: string;
  subtitle?: string;
  onPress?: () => void;
  onLongPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  // Left slot: either an IconBadge config or a custom node.
  badge?: {
    icon: keyof typeof import("@expo/vector-icons/build/Ionicons").default.glyphMap;
    iconColor: string;
    bgColor: string;
    size?: number;
    containerSize?: number;
    borderRadius?: number;
  };
  leftSlot?: ReactNode;
  // Right slot: default is a chevron/edit icon; can supply custom.
  rightIcon?: {
    name: keyof typeof import("@expo/vector-icons/build/Ionicons").default.glyphMap;
    color: string;
    size?: number;
    onPress?: () => void;
    accessibilityLabel?: string;
  };
  rightSlot?: ReactNode;
};

export function ResultRow(props: Props) {
  const { theme } = useTheme();
  const isDark = !!theme.isDark;
  const { scale, onPressIn, onPressOut } = usePressScale("card");
  const ink = theme.ink;

  const content = (
    <>
      {props.leftSlot ??
        (props.badge ? (
          <IconBadge
            name={props.badge.icon as any}
            color={props.badge.iconColor}
            bgColor={props.badge.bgColor}
            size={props.badge.size ?? 14}
            containerSize={props.badge.containerSize ?? 32}
            borderRadius={props.badge.borderRadius ?? 8}
          />
        ) : null)}
      <View style={{ flex: 1, marginLeft: props.leftSlot || props.badge ? 8 : 0 }}>
        <Text
          style={{ color: theme.textStrong, fontSize: 13, fontWeight: "600" }}
          numberOfLines={1}
          allowFontScaling
          maxFontSizeMultiplier={1.3}
        >
          {props.title}
        </Text>
        {props.subtitle ? (
          <Text
            style={{ color: theme.textSoft, fontSize: 11, marginTop: 2 }}
            numberOfLines={1}
            allowFontScaling
            maxFontSizeMultiplier={1.3}
          >
            {props.subtitle}
          </Text>
        ) : null}
      </View>
      {props.rightSlot ??
        (props.rightIcon ? (
          <Pressable
            onPress={props.rightIcon.onPress}
            hitSlop={8}
            accessibilityRole={props.rightIcon.onPress ? "button" : undefined}
            accessibilityLabel={props.rightIcon.accessibilityLabel}
          >
            <Ionicons name={props.rightIcon.name} size={props.rightIcon.size ?? 18} color={props.rightIcon.color} />
          </Pressable>
        ) : null)}
    </>
  );

  const rowStyle = [styles.row, { borderColor: ink, backgroundColor: theme.card, ...layeredShadow("card", isDark) }];

  if (!props.onPress && !props.onLongPress) {
    return (
      <View style={rowStyle} accessible accessibilityLabel={props.accessibilityLabel}>
        {content}
      </View>
    );
  }

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={props.onPress}
        onLongPress={props.onLongPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={rowStyle}
        accessibilityRole="button"
        accessibilityLabel={props.accessibilityLabel}
        accessibilityHint={props.accessibilityHint}
      >
        {content}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 10,
    borderWidth: 2,
    borderRadius: 16,
    padding: 10,
    alignItems: "center",
  },
});
