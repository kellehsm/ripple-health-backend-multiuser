import React from "react";
import { StyleProp, ViewStyle } from "react-native";
import { RippleLoader } from "./RippleLoader";

// Legacy wrapper — all callers get the branded RippleLoader.
// The `color` prop is no longer applied (four-quadrant design is always used).
// `size="small"` → compact pulsing droplet (no rings, fits inline/buttons)
// `size="large"` → full loader with expanding ripple rings

interface LoadingIndicatorProps {
  size?: "small" | "large";
  color?: string;
  style?: StyleProp<ViewStyle>;
}

export function LoadingIndicator({ size = "small", style }: LoadingIndicatorProps) {
  return <RippleLoader size={size} style={style} />;
}
