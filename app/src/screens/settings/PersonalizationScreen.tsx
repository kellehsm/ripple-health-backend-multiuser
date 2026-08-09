/**
 * Personalization settings — density, color-blind mode, haptics, time-of-day
 * theme shift, per-metric color overrides.
 *
 * Sits under Settings → Personalization.
 */

import React from "react";
import { View, ScrollView, StyleSheet, Pressable, Switch } from "react-native";
import { useTheme } from "../../theme/ThemeContext";
import { useAppSettings, Density, ColorBlindMode } from "../../theme/AppSettingsContext";
import { ScaledText } from "../../components/ScaledText";
import { RipplePressable } from "../../components/RipplePressable";
import { SPACING, RADIUS } from "../../theme/tokens";
import { IconVariant } from "../../components/IconVariant";
import { haptics } from "../../lib/haptics";

const DENSITY_OPTIONS: { key: Density; label: string; hint: string }[] = [
  { key: "compact",     label: "Compact",     hint: "More on screen" },
  { key: "comfortable", label: "Comfortable", hint: "Default" },
  { key: "spacious",    label: "Spacious",    hint: "Easier to read" },
];

const CB_OPTIONS: { key: ColorBlindMode; label: string }[] = [
  { key: "none",         label: "None" },
  { key: "protanopia",   label: "Protanopia (red-blind)" },
  { key: "deuteranopia", label: "Deuteranopia (green-blind)" },
  { key: "tritanopia",   label: "Tritanopia (blue-blind)" },
];

const METRICS: { key: string; label: string; defaultColor: string }[] = [
  { key: "steps",    label: "Steps",    defaultColor: "#3FA0A6" },
  { key: "sleep",    label: "Sleep",    defaultColor: "#7B7BC7" },
  { key: "mood",     label: "Mood",     defaultColor: "#B084D8" },
  { key: "glucose",  label: "Glucose",  defaultColor: "#A62A50" },
  { key: "water",    label: "Water",    defaultColor: "#4A90D9" },
  { key: "meals",    label: "Meals",    defaultColor: "#E8654E" },
  { key: "spending", label: "Spending", defaultColor: "#7B3FBF" },
];

const COLOR_SWATCHES = ["#3FA0A6", "#E8654E", "#7B3FBF", "#A62A50", "#B084D8", "#4A90D9", "#7B7BC7", "#D89B4A", "#6BA84F", "#C74B7A"];

export function PersonalizationScreen() {
  const { theme } = useTheme();
  const s = useAppSettings();
  const styles = makeStyles(theme.page, theme.textSoft);

  return (
    <ScrollView style={{ backgroundColor: theme.page }} contentContainerStyle={styles.content}>
      <ScaledText size={22} weight="900" color={theme.textStrong}>Personalization</ScaledText>

      {/* Density */}
      <View style={styles.section}>
        <ScaledText size={11} weight="900" color={theme.textSoft} style={styles.label}>DENSITY</ScaledText>
        <View style={styles.row}>
          {DENSITY_OPTIONS.map(opt => (
            <RipplePressable
              key={opt.key}
              onPress={() => s.setDensity(opt.key)}
              hapticFeedback="tap"
              style={[styles.chip, { borderColor: theme.ink, backgroundColor: s.density === opt.key ? theme.ink : "transparent" }]}
            >
              <ScaledText size={13} weight="700" color={s.density === opt.key ? theme.page : theme.textStrong}>{opt.label}</ScaledText>
              <ScaledText size={10} color={s.density === opt.key ? theme.page : theme.textSoft}>{opt.hint}</ScaledText>
            </RipplePressable>
          ))}
        </View>
      </View>

      {/* Color-blind mode */}
      <View style={styles.section}>
        <ScaledText size={11} weight="900" color={theme.textSoft} style={styles.label}>COLOR-BLIND MODE</ScaledText>
        {CB_OPTIONS.map(opt => (
          <Pressable
            key={opt.key}
            onPress={() => { haptics.tap(); s.setColorBlindMode(opt.key); }}
            style={[styles.rowItem, { borderColor: theme.cardBorder }]}
            accessibilityRole="radio"
            accessibilityState={{ selected: s.colorBlindMode === opt.key }}
          >
            <ScaledText size={14} color={theme.textStrong}>{opt.label}</ScaledText>
            {s.colorBlindMode === opt.key && <IconVariant name="check" state="active" size={18} />}
          </Pressable>
        ))}
      </View>

      {/* Haptics toggle */}
      <View style={styles.section}>
        <View style={[styles.rowItem, { borderColor: theme.cardBorder }]}>
          <View style={{ flex: 1 }}>
            <ScaledText size={14} weight="700" color={theme.textStrong}>Haptic feedback</ScaledText>
            <ScaledText size={11} color={theme.textSoft}>Tactile response for taps and successes</ScaledText>
          </View>
          <Switch value={s.hapticsEnabled} onValueChange={s.setHapticsEnabled} />
        </View>
      </View>

      {/* Time-of-day theme shift */}
      <View style={styles.section}>
        <View style={[styles.rowItem, { borderColor: theme.cardBorder }]}>
          <View style={{ flex: 1 }}>
            <ScaledText size={14} weight="700" color={theme.textStrong}>Time-of-day tint</ScaledText>
            <ScaledText size={11} color={theme.textSoft}>Warm at sunset, cool at night</ScaledText>
          </View>
          <Switch value={s.timeOfDayThemeShift} onValueChange={s.setTimeOfDayThemeShift} />
        </View>
      </View>

      {/* Per-metric color overrides */}
      <View style={styles.section}>
        <ScaledText size={11} weight="900" color={theme.textSoft} style={styles.label}>METRIC COLORS</ScaledText>
        {METRICS.map(m => {
          const current = s.metricColorOverrides[m.key] ?? m.defaultColor;
          return (
            <View key={m.key} style={[styles.metricRow, { borderColor: theme.cardBorder }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                <View style={[styles.swatch, { backgroundColor: current, borderColor: theme.ink }]} />
                <ScaledText size={14} weight="600" color={theme.textStrong}>{m.label}</ScaledText>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                {COLOR_SWATCHES.map(c => (
                  <Pressable
                    key={c}
                    onPress={() => { haptics.tap(); s.setMetricColorOverride(m.key, c === m.defaultColor ? null : c); }}
                    style={[styles.swatchDot, { backgroundColor: c, borderColor: current === c ? theme.ink : "transparent" }]}
                    accessibilityLabel={`Set ${m.label} to ${c}`}
                  />
                ))}
                <Pressable
                  onPress={() => { haptics.tap(); s.setMetricColorOverride(m.key, null); }}
                  style={[styles.swatchDot, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
                  accessibilityLabel={`Reset ${m.label} to default`}
                >
                  <IconVariant name="close" size={12} state="muted" />
                </Pressable>
              </ScrollView>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

function makeStyles(_page: string, _textSoft: string) {
  return StyleSheet.create({
    content:   { padding: SPACING.lg, gap: SPACING.lg },
    section:   { gap: SPACING.sm },
    label:     { letterSpacing: 0.6, textTransform: "uppercase" },
    row:       { flexDirection: "row", gap: SPACING.sm },
    chip:      { flex: 1, paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1.5, alignItems: "center", gap: 2 },
    rowItem:   { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: SPACING.md, paddingHorizontal: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1, marginBottom: SPACING.xs },
    metricRow: { flexDirection: "row", alignItems: "center", paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1, marginBottom: SPACING.xs, gap: 10 },
    swatch:    { width: 22, height: 22, borderRadius: 11, borderWidth: 1 },
    swatchDot: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  });
}
