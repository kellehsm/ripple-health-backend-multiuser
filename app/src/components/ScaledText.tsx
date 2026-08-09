/**
 * Density- and font-scale-aware Text component.
 *
 * Wraps <Text> so any size passed in is automatically scaled by:
 *   - the user's Density setting (compact / comfortable / spacious)
 *   - the OS Dynamic Type multiplier (capped at 1.6× to prevent blow-ups)
 *
 * Prefer this over raw <Text> anywhere the text is user-facing content
 * (not internal debug or fixed-position badges).
 */

import React from "react";
import { Text, TextProps, TextStyle, StyleSheet } from "react-native";
import { useDensity } from "../hooks/useDensity";

interface Props extends TextProps {
  size?: number;   // px @ 1.0×
  weight?: TextStyle["fontWeight"];
  color?: string;
  numberOfLines?: number;
  center?: boolean;
}

export function ScaledText({ size = 14, weight, color, style, center, ...rest }: Props) {
  const { text } = useDensity();
  const finalSize = text(size);
  return (
    <Text
      {...rest}
      style={[
        { fontSize: finalSize, lineHeight: Math.round(finalSize * 1.35) },
        weight ? { fontWeight: weight } : null,
        color ? { color } : null,
        center ? styles.center : null,
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({ center: { textAlign: "center" } });
