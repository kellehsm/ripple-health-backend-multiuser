/**
 * Decorative SVG scene backgrounds for each theme.
 * Each component renders at full W×H, absolute-positioned behind screen content.
 * Opacity is kept very low (0.06–0.12) so they never interfere with readability.
 */
import React from "react";
import { View, Image, StyleSheet, useWindowDimensions } from "react-native";
import { useTheme } from "../ThemeContext";
import { useBackgrounds } from "../BackgroundsContext";
import Svg, {
  Circle,
  Line,
  Path,
  Polygon,
  Rect,
  Defs,
  RadialGradient as SvgRadialGradient,
  Stop,
  G,
  Ellipse,
} from "react-native-svg";

// ─── Individual scene components ──────────────────────────────────────────────

/** Morning Mist: concentric ripple rings in warm teal + coral */
function MorningMistBg({ width, height }: { width: number; height: number }) {
  const cx = width * 0.8;
  const cy = height * 0.25;
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {[80, 140, 200, 260, 320, 380, 440].map((r, i) => (
        <Circle key={i} cx={cx} cy={cy} r={r}
          fill="none" stroke="#1A9870" strokeWidth={i % 2 === 0 ? 1.5 : 1}
          opacity={0.12 - i * 0.013}
        />
      ))}
      {[60, 110, 160, 210].map((r, i) => (
        <Circle key={i} cx={width * 0.15} cy={height * 0.75} r={r}
          fill="none" stroke="#C85C28" strokeWidth={1}
          opacity={0.08 - i * 0.015}
        />
      ))}
      <Circle cx={cx} cy={cy} r={28} fill="#1A9870" opacity={0.06} />
    </Svg>
  );
}

/** Pale Sage: botanical leaf/branch shapes in sage green */
function PaleSageBg({ width, height }: { width: number; height: number }) {
  const leaves = [
    { x: width * 0.75, y: height * 0.1, r: 60, a: -30 },
    { x: width * 0.85, y: height * 0.3, r: 45, a: 20 },
    { x: width * 0.65, y: height * 0.5, r: 70, a: -15 },
    { x: width * 0.1, y: height * 0.2, r: 50, a: 40 },
    { x: width * 0.2, y: height * 0.65, r: 55, a: -25 },
    { x: width * 0.8, y: height * 0.7, r: 40, a: 10 },
  ];
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {leaves.map((l, i) => {
        const rad = (l.a * Math.PI) / 180;
        const dx = Math.cos(rad) * l.r;
        const dy = Math.sin(rad) * l.r;
        const cpx = l.x + Math.cos(rad + Math.PI / 2) * l.r * 0.4;
        const cpy = l.y + Math.sin(rad + Math.PI / 2) * l.r * 0.4;
        return (
          <Path
            key={i}
            d={`M ${l.x} ${l.y} Q ${cpx} ${cpy} ${l.x + dx} ${l.y + dy} Q ${cpx - (cpx - l.x) * 2} ${cpy - (cpy - l.y) * 2} ${l.x} ${l.y} Z`}
            fill="#2E7A28"
            opacity={0.07}
          />
        );
      })}
      {/* Stem lines */}
      {leaves.map((l, i) => (
        <Line key={`s${i}`}
          x1={l.x} y1={l.y}
          x2={l.x + Math.cos((l.a * Math.PI) / 180) * l.r}
          y2={l.y + Math.sin((l.a * Math.PI) / 180) * l.r}
          stroke="#1E2C18" strokeWidth={0.8} opacity={0.06}
        />
      ))}
    </Svg>
  );
}

/** Blush Hour: overlapping soft circles in blush/coral */
function BlushHourBg({ width, height }: { width: number; height: number }) {
  const blobs = [
    { cx: width * 0.8, cy: height * 0.15, rx: 110, ry: 90, color: "#D87030" },
    { cx: width * 0.6, cy: height * 0.35, rx: 80, ry: 70, color: "#B03860" },
    { cx: width * 0.9, cy: height * 0.55, rx: 70, ry: 60, color: "#C09028" },
    { cx: width * 0.15, cy: height * 0.1, rx: 65, ry: 55, color: "#8860A8" },
    { cx: width * 0.25, cy: height * 0.7, rx: 90, ry: 75, color: "#D87030" },
    { cx: width * 0.5, cy: height * 0.85, rx: 75, ry: 60, color: "#B03860" },
  ];
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {blobs.map((b, i) => (
        <Ellipse key={i} cx={b.cx} cy={b.cy} rx={b.rx} ry={b.ry}
          fill={b.color} opacity={0.07}
        />
      ))}
    </Svg>
  );
}

/** Jewel Light: hexagonal lattice in sapphire/amethyst */
function JewelLightBg({ width, height }: { width: number; height: number }) {
  const hexPoints = (cx: number, cy: number, r: number) => {
    return Array.from({ length: 6 }, (_, i) => {
      const angle = (Math.PI / 3) * i - Math.PI / 6;
      return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
    }).join(" ");
  };
  const hexes: { cx: number; cy: number; r: number; color: string }[] = [];
  const cols = 5;
  const rows = 8;
  const r = 40;
  const hx = r * Math.sqrt(3);
  const hy = r * 1.5;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cx = col * hx + (row % 2 === 1 ? hx / 2 : 0) + width * 0.55;
      const cy = row * hy + height * 0.05;
      const colors = ["#1A5CB8", "#6028A0", "#C83060", "#1890C8"];
      hexes.push({ cx, cy, r, color: colors[(row + col) % 4] });
    }
  }
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {hexes.map((h, i) => (
        <Polygon key={i} points={hexPoints(h.cx, h.cy, h.r)}
          fill="none" stroke={h.color} strokeWidth={1}
          opacity={0.06}
        />
      ))}
    </Svg>
  );
}

/** Clean Slate: minimal dotted grid in gray */
function CleanSlateBg({ width, height }: { width: number; height: number }) {
  const dots: { x: number; y: number }[] = [];
  const spacing = 28;
  for (let x = spacing; x < width; x += spacing) {
    for (let y = spacing; y < height; y += spacing) {
      dots.push({ x, y });
    }
  }
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {dots.map((d, i) => (
        <Circle key={i} cx={d.x} cy={d.y} r={1.5}
          fill="#555555" opacity={0.07}
        />
      ))}
      {/* Accent lines */}
      <Line x1={0} y1={height * 0.33} x2={width} y2={height * 0.33}
        stroke="#007898" strokeWidth={0.8} opacity={0.06} />
      <Line x1={0} y1={height * 0.66} x2={width} y2={height * 0.66}
        stroke="#007898" strokeWidth={0.8} opacity={0.06} />
    </Svg>
  );
}

/** Obsidian: star field — scattered dots of varying sizes on deep black */
function ObsidianBg({ width, height }: { width: number; height: number }) {
  // Pseudo-random star positions (deterministic)
  const stars = Array.from({ length: 90 }, (_, i) => {
    const t = i * 137.508; // golden angle
    const r2 = (i / 90) * Math.sqrt(2) * Math.max(width, height);
    return {
      x: (width / 2) + Math.cos((t * Math.PI) / 180) * r2 * 0.7 * Math.random(),
      y: (height / 2) + Math.sin((t * Math.PI) / 180) * r2 * 0.7 * Math.random(),
      r: 0.5 + (i % 4) * 0.4,
      op: 0.05 + (i % 5) * 0.03,
    };
  });
  // Use fibonacci spiral for more natural distribution
  const fib = Array.from({ length: 120 }, (_, i) => {
    const angle = i * 2.39996; // golden angle in radians
    const rr = Math.sqrt(i / 120) * Math.max(width, height) * 0.7;
    return {
      x: width * 0.5 + Math.cos(angle) * rr,
      y: height * 0.45 + Math.sin(angle) * rr,
      r: 0.4 + (i % 5) * 0.25,
      op: 0.04 + (i % 6) * 0.02,
    };
  });
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {fib.map((s, i) => (
        <Circle key={i} cx={s.x} cy={s.y} r={s.r}
          fill="#F5F5F5" opacity={s.op}
        />
      ))}
      {/* Accent stars in jewel colors */}
      {[
        { x: width * 0.2, y: height * 0.15, r: 2.5, c: "#38D090" },
        { x: width * 0.75, y: height * 0.3, r: 2, c: "#E89840" },
        { x: width * 0.4, y: height * 0.6, r: 1.8, c: "#5098F0" },
        { x: width * 0.85, y: height * 0.7, r: 2.2, c: "#B068F0" },
      ].map((s, i) => (
        <Circle key={`a${i}`} cx={s.x} cy={s.y} r={s.r}
          fill={s.c} opacity={0.18}
        />
      ))}
    </Svg>
  );
}

/** Arctic: crystalline snowflake / ice geometric shapes */
function ArcticBg({ width, height }: { width: number; height: number }) {
  const flakes = [
    { cx: width * 0.75, cy: height * 0.12, size: 55 },
    { cx: width * 0.15, cy: height * 0.35, size: 40 },
    { cx: width * 0.85, cy: height * 0.55, size: 45 },
    { cx: width * 0.35, cy: height * 0.75, size: 35 },
    { cx: width * 0.6, cy: height * 0.9, size: 30 },
  ];
  const flakePaths = (cx: number, cy: number, size: number) => {
    const arms = 6;
    const paths: string[] = [];
    for (let i = 0; i < arms; i++) {
      const angle = (Math.PI / arms) * 2 * i;
      const ex = cx + Math.cos(angle) * size;
      const ey = cy + Math.sin(angle) * size;
      paths.push(`M ${cx} ${cy} L ${ex} ${ey}`);
      // Sub-branches
      for (const frac of [0.4, 0.65]) {
        const bx = cx + Math.cos(angle) * size * frac;
        const by = cy + Math.sin(angle) * size * frac;
        for (const ba of [angle + Math.PI / 3, angle - Math.PI / 3]) {
          const bex = bx + Math.cos(ba) * size * 0.28;
          const bey = by + Math.sin(ba) * size * 0.28;
          paths.push(`M ${bx} ${by} L ${bex} ${bey}`);
        }
      }
    }
    return paths;
  };
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {flakes.map((f, fi) =>
        flakePaths(f.cx, f.cy, f.size).map((p, pi) => (
          <Path key={`${fi}-${pi}`} d={p}
            stroke="#40D8C8" strokeWidth={1} opacity={0.09}
          />
        ))
      )}
      {/* Ice circle halos */}
      {flakes.map((f, i) => (
        <Circle key={`h${i}`} cx={f.cx} cy={f.cy} r={f.size * 1.1}
          fill="none" stroke="#60C8F8" strokeWidth={0.8}
          opacity={0.05} strokeDasharray="4,6"
        />
      ))}
    </Svg>
  );
}

/** Volcanic: diagonal flowing streaks like lava channels */
function VolcanicBg({ width, height }: { width: number; height: number }) {
  const streaks = [
    { x1: width * 0.85, y1: 0, x2: width * 0.3, y2: height, color: "#F08838" },
    { x1: width * 0.95, y1: 0, x2: width * 0.5, y2: height, color: "#F0A040" },
    { x1: width * 0.65, y1: 0, x2: width * 0.1, y2: height, color: "#F0C028" },
    { x1: width * 1.05, y1: height * 0.3, x2: width * 0.6, y2: height * 1.1, color: "#C070E0" },
    { x1: width * 0.45, y1: -height * 0.1, x2: -width * 0.05, y2: height * 0.8, color: "#F08838" },
  ];
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {streaks.map((s, i) => (
        <G key={i}>
          <Line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
            stroke={s.color} strokeWidth={2 + i * 0.5}
            opacity={0.06}
          />
          <Line x1={s.x1 + 8} y1={s.y1} x2={s.x2 + 8} y2={s.y2}
            stroke={s.color} strokeWidth={0.8}
            opacity={0.04}
          />
        </G>
      ))}
      {/* Ember glow spots */}
      {[
        { x: width * 0.8, y: height * 0.2 },
        { x: width * 0.55, y: height * 0.55 },
        { x: width * 0.15, y: height * 0.75 },
      ].map((e, i) => (
        <Circle key={`e${i}`} cx={e.x} cy={e.y} r={20 + i * 8}
          fill="#F08838" opacity={0.05}
        />
      ))}
    </Svg>
  );
}

/** Abyssal: scattered bioluminescent bubble circles */
function AbyssalBg({ width, height }: { width: number; height: number }) {
  const bubbles = [
    { cx: width * 0.7, cy: height * 0.08, r: 70, color: "#00F0C8" },
    { cx: width * 0.9, cy: height * 0.35, r: 45, color: "#20C8F8" },
    { cx: width * 0.15, cy: height * 0.2, r: 55, color: "#E8C840" },
    { cx: width * 0.5, cy: height * 0.6, r: 80, color: "#A060E8" },
    { cx: width * 0.85, cy: height * 0.7, r: 40, color: "#00F0C8" },
    { cx: width * 0.25, cy: height * 0.85, r: 60, color: "#20C8F8" },
    { cx: width * 0.6, cy: height * 0.92, r: 35, color: "#F07090" },
  ];
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {bubbles.map((b, i) => (
        <G key={i}>
          <Circle cx={b.cx} cy={b.cy} r={b.r}
            fill={b.color} opacity={0.05}
          />
          <Circle cx={b.cx} cy={b.cy} r={b.r}
            fill="none" stroke={b.color} strokeWidth={1}
            opacity={0.09}
          />
          {/* Inner highlight */}
          <Circle cx={b.cx - b.r * 0.2} cy={b.cy - b.r * 0.2} r={b.r * 0.12}
            fill={b.color} opacity={0.1}
          />
        </G>
      ))}
      {/* Rising bubble trail */}
      {Array.from({ length: 12 }, (_, i) => ({
        x: width * 0.05 + i * width * 0.085,
        y: height * (0.95 - i * 0.04),
        r: 3 + i * 1.5,
      })).map((b, i) => (
        <Circle key={`t${i}`} cx={b.x} cy={b.y} r={b.r}
          fill="none" stroke="#00F0C8" strokeWidth={0.6}
          opacity={0.06}
        />
      ))}
    </Svg>
  );
}

/** Nebula: diffuse cosmic dust clouds with circular gradient forms */
function NebulaBg({ width, height }: { width: number; height: number }) {
  const clouds = [
    { cx: width * 0.75, cy: height * 0.15, rx: 140, ry: 100, color: "#A080FF" },
    { cx: width * 0.2, cy: height * 0.45, rx: 120, ry: 90, color: "#40E0C0" },
    { cx: width * 0.85, cy: height * 0.65, rx: 100, ry: 80, color: "#FF5878" },
    { cx: width * 0.45, cy: height * 0.85, rx: 110, ry: 70, color: "#C090FF" },
  ];
  // Scattered stars
  const stars = Array.from({ length: 80 }, (_, i) => {
    const angle = i * 2.39996;
    const rr = Math.sqrt(i / 80) * Math.max(width, height) * 0.65;
    return {
      x: width * 0.5 + Math.cos(angle) * rr,
      y: height * 0.5 + Math.sin(angle) * rr,
      r: 0.4 + (i % 4) * 0.3,
    };
  });
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {clouds.map((c, i) => (
        <G key={i}>
          <Ellipse cx={c.cx} cy={c.cy} rx={c.rx} ry={c.ry}
            fill={c.color} opacity={0.06}
          />
          <Ellipse cx={c.cx} cy={c.cy} rx={c.rx * 0.6} ry={c.ry * 0.6}
            fill={c.color} opacity={0.04}
          />
        </G>
      ))}
      {stars.map((s, i) => (
        <Circle key={i} cx={s.x} cy={s.y} r={s.r}
          fill="#F0EEFF" opacity={0.08}
        />
      ))}
    </Svg>
  );
}

// ─── Registry ─────────────────────────────────────────────────────────────────

type BgComponent = React.ComponentType<{ width: number; height: number }>;

const BACKGROUND_REGISTRY: Record<string, BgComponent> = {
  "morning-mist": MorningMistBg,
  "pale-sage":    PaleSageBg,
  "blush-hour":   BlushHourBg,
  "jewel-light":  JewelLightBg,
  "clean-slate":  CleanSlateBg,
  "obsidian":     ObsidianBg,
  "arctic":       ArcticBg,
  "volcanic":     VolcanicBg,
  "abyssal":      AbyssalBg,
  "nebula":       NebulaBg,
};

// ─── ThemedBackground component ───────────────────────────────────────────────

interface ThemedBackgroundProps {
  pageId: string;
  /** Additional opacity multiplier (0–1). Default 1. */
  opacity?: number;
}

/**
 * Absolute-positioned background for the active theme + page.
 * Resolution order:
 *   1. theme.pageBackgrounds[pageId] — image or color override set by a premium theme
 *   2. BACKGROUND_REGISTRY[paletteId] — the decorative SVG scene for this palette
 *   3. Nothing (returns null)
 *
 * Place inside a View with position: "relative". The background fills 100% W × H.
 */
export function ThemedBackground({ pageId, opacity = 1 }: ThemedBackgroundProps) {
  const { width, height } = useWindowDimensions();
  const { paletteId } = useTheme();
  const { pageBackgrounds } = useBackgrounds();

  // Check for a per-page image override from BackgroundsContext
  const pageBg = pageBackgrounds[pageId];
  if (pageBg) {
    if (pageBg.type === "image" || pageBg.type === "uri") {
      const source = pageBg.type === "uri" ? { uri: pageBg.value } : pageBg.value;
      return (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity }]}>
          <Image source={source} resizeMode="cover" style={StyleSheet.absoluteFill} />
        </View>
      );
    }
    // color override — let the palette's page color handle it, just skip SVG
    return null;
  }

  // Fall back to the palette's SVG scene
  const BgScene = BACKGROUND_REGISTRY[paletteId];
  if (!BgScene) return null;
  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { opacity }]}
    >
      <BgScene width={width} height={height} />
    </View>
  );
}
