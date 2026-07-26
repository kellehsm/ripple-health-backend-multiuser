import React from "react";
import Svg, { Circle, G, Path } from "react-native-svg";

type Props = { size?: number };

export function AppLogo({ size = 100 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 280 280">
      {/* rings rendered behind the droplet */}
      <Circle cx="140" cy="140" r="130" fill="none" stroke="#B092D9" strokeWidth="2.2" opacity="0.35" />
      <Circle cx="140" cy="140" r="105" fill="none" stroke="#F2A28C" strokeWidth="2.2" opacity="0.45" />
      <Circle cx="140" cy="140" r="80" fill="none" stroke="#8ED4D8" strokeWidth="2.4" opacity="0.6" />

      {/* droplet: translate(20,37) places bounding-box center (local 120,103) at canvas center (140,140) */}
      <G transform="translate(20,37)">
        <Path d="M120 40 C97 68 76 95 76 120 L120 120 Z" fill="#8ED4D8" />
        <Path d="M120 40 C143 68 164 95 164 120 L120 120 Z" fill="#F2A28C" />
        <Path d="M76 120 C76 146 95 166 120 166 L120 120 Z" fill="#B092D9" />
        <Path d="M164 120 C164 146 145 166 120 166 L120 120 Z" fill="#CE7A92" />
        <Path
          d="M120 40 C97 68 76 95 76 120 C76 146 95 166 120 166 C145 166 164 146 164 120 C164 95 143 68 120 40 Z"
          fill="none"
          stroke="#111111"
          strokeWidth="3.2"
        />
        <Path
          d="M76 120 L103 120 L108 103 L124 146 L134 120 L164 120"
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
