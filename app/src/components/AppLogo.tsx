import React from "react";
import Svg, { Circle, G, Path } from "react-native-svg";

type Props = { size?: number };

export function AppLogo({ size = 100 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 280 280">
      {/* rings — vivid, matching droplet quadrant colors */}
      <Circle cx="140" cy="140" r="130" fill="none" stroke="#7B3FBF" strokeWidth="7.0" />
      <Circle cx="140" cy="140" r="105" fill="none" stroke="#E8654E" strokeWidth="7.0" />
      <Circle cx="140" cy="140" r="80"  fill="none" stroke="#3FA0A6" strokeWidth="7.5" />

      {/* droplet: translate(20,37) places bounding-box center (local 120,103) at canvas center (140,140) */}
      <G transform="translate(20,37)">
        <Path d="M120 40 C97 68 76 95 76 120 L120 120 Z" fill="#3FA0A6" />
        <Path d="M120 40 C143 68 164 95 164 120 L120 120 Z" fill="#E8654E" />
        <Path d="M76 120 C76 146 95 166 120 166 L120 120 Z" fill="#7B3FBF" />
        <Path d="M164 120 C164 146 145 166 120 166 L120 120 Z" fill="#A62A50" />
        <Path
          d="M120 40 C97 68 76 95 76 120 C76 146 95 166 120 166 C145 166 164 146 164 120 C164 95 143 68 120 40 Z"
          fill="none"
          stroke="#111111"
          strokeWidth="3.2"
        />
        <Path
          d="M82 120 L103 120 L108 103 L124 146 L134 120 L158 120"
          stroke="#111111"
          strokeWidth="4.6"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </G>
    </Svg>
  );
}
