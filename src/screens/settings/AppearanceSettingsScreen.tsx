import React, { useRef, useState, useCallback } from "react";
import { ScrollView, View, Text, Pressable, Switch, StyleSheet, PanResponder } from "react-native";
import * as Haptics from "expo-haptics";
import { useTheme } from "../../theme/ThemeContext";
import { useAppSettings, CARD_OPACITY_MIN, CARD_OPACITY_MAX } from "../../theme/AppSettingsContext";
import { PALETTES, PALETTE_GROUPS } from "../../theme/palettes";
import { useStrings } from "../../strings/StringsContext";
import {
  FONT_FAMILY_KEYS, FONT_FAMILY_LABELS, FONT_SCALE_KEYS, FONT_SCALE_LABELS,
  FontFamilyKey, FontScalePreset,
} from "../../theme/fontSystem";

// ─── Opacity slider ────────────────────────────────────────────────────────────

interface OpacitySliderProps {
  value: number;
  onChange: (v: number) => void;
  trackColor: string;
  thumbColor: string;
  borderColor: string;
  trackBgColor: string;
}

function OpacitySlider({ value, onChange, trackColor, thumbColor, borderColor, trackBgColor }: OpacitySliderProps) {
  const [trackWidth, setTrackWidth] = useState(1);
  const trackWidthRef = useRef(1);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const onLayout = useCallback((e: { nativeEvent: { layout: { width: number } } }) => {
    const w = e.nativeEvent.layout.width;
    trackWidthRef.current = w;
    setTrackWidth(w);
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        const fraction = Math.max(0, Math.min(1, e.nativeEvent.locationX / trackWidthRef.current));
        const raw = CARD_OPACITY_MIN + fraction * (CARD_OPACITY_MAX - CARD_OPACITY_MIN);
        onChangeRef.current(Math.round(Math.max(CARD_OPACITY_MIN, Math.min(CARD_OPACITY_MAX, raw)) * 100) / 100);
      },
      onPanResponderMove: (e) => {
        const fraction = Math.max(0, Math.min(1, e.nativeEvent.locationX / trackWidthRef.current));
        const raw = CARD_OPACITY_MIN + fraction * (CARD_OPACITY_MAX - CARD_OPACITY_MIN);
        onChangeRef.current(Math.round(Math.max(CARD_OPACITY_MIN, Math.min(CARD_OPACITY_MAX, raw)) * 100) / 100);
      },
      onPanResponderRelease: () => Haptics.selectionAsync(),
    })
  ).current;

  const fillFraction = (value - CARD_OPACITY_MIN) / (CARD_OPACITY_MAX - CARD_OPACITY_MIN);
  const thumbLeft = fillFraction * trackWidth - THUMB_SIZE / 2;

  return (
    <View
      onLayout={onLayout}
      style={styles.sliderTrack}
      {...panResponder.panHandlers}
    >
      {/* Track background */}
      <View style={[styles.sliderRail, { backgroundColor: trackBgColor }]}>
        {/* Filled portion */}
        <View style={[styles.sliderFill, { width: `${fillFraction * 100}%`, backgroundColor: trackColor }]} />
      </View>
      {/* Thumb */}
      <View
        pointerEvents="none"
        style={[
          styles.sliderThumb,
          { left: thumbLeft, backgroundColor: thumbColor, borderColor },
        ]}
      />
    </View>
  );
}

const THUMB_SIZE = 26;

// ─── Main screen ──────────────────────────────────────────────────────────────

export function AppearanceSettingsScreen() {
  const { theme, paletteId, setPalette } = useTheme();
  const {
    shadowsEnabled, setShadowsEnabled,
    fontFamily, fontSizeScale, setFontFamily, setFontSizeScale,
    cardOpacity, cardOpacityManualOverride, setCardOpacity, resetCardOpacity,
  } = useAppSettings();
  const s = useStrings();

  const themeDefault = PALETTES[paletteId]?.defaultCardOpacity ?? 1.0;

  return (
    <ScrollView style={{ backgroundColor: theme.page }} contentContainerStyle={styles.content}>

      {/* ── Theme ──────────────────────────────────────────────────── */}
      <Text style={[styles.groupLabel, { color: theme.textSoft }]}>{s.appearance_theme_title}</Text>
      <Text style={[styles.sectionDesc, { color: theme.textSoft }]}>
        {s.appearance_theme_desc}
      </Text>

      {Object.entries(PALETTE_GROUPS).map(([groupName, ids]) => (
        <View key={groupName} style={{ gap: 8 }}>
          <Text style={[styles.subGroupLabel, { color: theme.textSoft }]}>
            {groupName.toUpperCase()}
          </Text>

          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            {ids.map((id, index) => {
              const p = PALETTES[id];
              const isActive = paletteId === id;
              const isLast = index === ids.length - 1;
              return (
                <View key={id}>
                  <Pressable
                    onPress={() => { Haptics.selectionAsync(); setPalette(id); }}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: isActive }}
                    style={({ pressed }) => [
                      styles.paletteRow,
                      isActive && { backgroundColor: theme.teal.tint ?? theme.page },
                      pressed && !isActive && { backgroundColor: theme.cardBorder + "60" },
                    ]}
                  >
                    <View style={{ flexDirection: "row", gap: 4, marginRight: 12 }}>
                      {[p.page, p.teal.solid, p.coral.solid, p.violet.solid].map((color, i) => (
                        <View
                          key={i}
                          style={{
                            width: 14,
                            height: 14,
                            borderRadius: 7,
                            backgroundColor: color,
                            borderWidth: 0.5,
                            borderColor: "rgba(0,0,0,0.1)",
                          }}
                        />
                      ))}
                    </View>
                    <Text
                      style={[
                        styles.paletteName,
                        { color: isActive ? theme.teal.fg : theme.textStrong },
                      ]}
                      numberOfLines={1}
                    >
                      {p.name}
                    </Text>
                    {isActive ? (
                      <Text style={[styles.checkmark, { color: theme.teal.solid }]}>✓</Text>
                    ) : (
                      <View style={styles.checkPlaceholder} />
                    )}
                  </Pressable>
                  {!isLast && (
                    <View style={[styles.divider, { backgroundColor: theme.cardBorder }]} />
                  )}
                </View>
              );
            })}
          </View>
        </View>
      ))}

      {/* ── Shadows ────────────────────────────────────────────────── */}
      <Text style={[styles.groupLabel, { color: theme.textSoft, marginTop: 20 }]}>{s.appearance_shadows_title}</Text>
      <Text style={[styles.sectionDesc, { color: theme.textSoft }]}>
        {s.appearance_shadows_desc}
      </Text>
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <View style={styles.settingRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.settingLabel, { color: theme.textStrong }]}>{s.appearance_shadows_row_label}</Text>
            <Text style={[styles.settingDesc, { color: theme.textSoft }]}>
              {shadowsEnabled ? s.appearance_shadows_enabled_desc : s.appearance_shadows_disabled_desc}
            </Text>
          </View>
          <Switch
            value={shadowsEnabled}
            onValueChange={setShadowsEnabled}
            trackColor={{ true: theme.teal.solid, false: theme.cardBorder }}
            thumbColor="#ffffff"
          />
        </View>
      </View>

      {/* ── Card opacity ───────────────────────────────────────────── */}
      <Text style={[styles.groupLabel, { color: theme.textSoft, marginTop: 20 }]}>
        {s.appearance_opacity_title}
      </Text>
      <Text style={[styles.sectionDesc, { color: theme.textSoft }]}>
        {s.appearance_opacity_desc}
      </Text>
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder, padding: 16 }]}>
        {/* Value row */}
        <View style={styles.opacityValueRow}>
          <Text style={[styles.opacityValueLabel, { color: theme.textStrong }]}>
            {Math.round(cardOpacity * 100)}%
          </Text>
          {cardOpacityManualOverride && (
            <Pressable
              onPress={() => { Haptics.selectionAsync(); resetCardOpacity(); }}
              style={[styles.resetButton, { borderColor: theme.cardBorder }]}
            >
              <Text style={[styles.resetButtonText, { color: theme.textSoft }]}>
                {s.appearance_opacity_reset_label}
              </Text>
            </Pressable>
          )}
        </View>

        {/* Slider */}
        <OpacitySlider
          value={cardOpacity}
          onChange={setCardOpacity}
          trackColor={theme.teal.solid}
          thumbColor={theme.card}
          borderColor={theme.teal.solid}
          trackBgColor={theme.cardBorder}
        />

        {/* Range labels */}
        <View style={styles.opacityRangeRow}>
          <Text style={[styles.opacityRangeLabel, { color: theme.textSoft }]}>
            {Math.round(CARD_OPACITY_MIN * 100)}%
          </Text>
          {themeDefault < 1.0 && (
            <Text style={[styles.opacityRangeLabel, { color: theme.textSoft }]}>
              Theme default: {Math.round(themeDefault * 100)}%
            </Text>
          )}
          <Text style={[styles.opacityRangeLabel, { color: theme.textSoft }]}>
            {Math.round(CARD_OPACITY_MAX * 100)}%
          </Text>
        </View>
      </View>

      {/* ── Font family ─────────────────────────────────────────────── */}
      <Text style={[styles.groupLabel, { color: theme.textSoft, marginTop: 20 }]}>
        {s.appearance_font_family_title}
      </Text>
      <Text style={[styles.sectionDesc, { color: theme.textSoft }]}>
        {s.appearance_font_family_desc}
      </Text>
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        {FONT_FAMILY_KEYS.map((key, index) => {
          const active = (fontFamily ?? 'System') === key;
          const isLast = index === FONT_FAMILY_KEYS.length - 1;
          return (
            <View key={key}>
              <Pressable
                onPress={() => { Haptics.selectionAsync(); setFontFamily(key as FontFamilyKey); }}
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
                style={({ pressed }) => [
                  styles.paletteRow,
                  active && { backgroundColor: theme.teal.tint },
                  pressed && !active && { backgroundColor: theme.cardBorder + "60" },
                ]}
              >
                <Text style={[styles.paletteName, { color: active ? theme.teal.fg : theme.textStrong }]}>
                  {FONT_FAMILY_LABELS[key as FontFamilyKey]}
                </Text>
                {active
                  ? <Text style={[styles.checkmark, { color: theme.teal.solid }]}>✓</Text>
                  : <View style={styles.checkPlaceholder} />}
              </Pressable>
              {!isLast && <View style={[styles.divider, { backgroundColor: theme.cardBorder }]} />}
            </View>
          );
        })}
      </View>

      {/* ── Font size scale ────────────────────────────────────────── */}
      <Text style={[styles.groupLabel, { color: theme.textSoft, marginTop: 20 }]}>
        {s.appearance_font_scale_title}
      </Text>
      <Text style={[styles.sectionDesc, { color: theme.textSoft }]}>
        {s.appearance_font_scale_desc}
      </Text>
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder, padding: 14 }]}>
        <View style={styles.opacityRow}>
          {FONT_SCALE_KEYS.map((key) => {
            const active = (fontSizeScale ?? 'default') === key;
            return (
              <Pressable
                key={key}
                onPress={() => { Haptics.selectionAsync(); setFontSizeScale(key as FontScalePreset); }}
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
                style={[
                  styles.opacityPill,
                  { backgroundColor: active ? theme.teal.solid : theme.page, borderColor: active ? theme.teal.solid : theme.cardBorder },
                ]}
              >
                <Text style={[styles.opacityLabel, { color: active ? '#ffffff' : theme.textSoft }]}>
                  {FONT_SCALE_LABELS[key as FontScalePreset]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  groupLabel: { fontSize: 9, fontWeight: "900", letterSpacing: 0.6, marginTop: 4, marginBottom: 2 },
  subGroupLabel: { fontSize: 9, fontWeight: "900", letterSpacing: 0.6, marginTop: 4 },
  sectionDesc: { fontSize: 12, lineHeight: 17, marginBottom: 4 },
  card: {
    borderRadius: 22,
    borderWidth: 2,
    overflow: "hidden",
  },
  paletteRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  paletteName: { flex: 1, fontSize: 14, fontWeight: "600" },
  checkmark: { fontSize: 18, fontWeight: "700", width: 22, textAlign: "center" },
  checkPlaceholder: { width: 22, height: 22 },
  divider: { height: 1, marginHorizontal: 16 },

  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  settingLabel: { fontSize: 14, fontWeight: "600", lineHeight: 19 },
  settingDesc: { fontSize: 12, lineHeight: 17, marginTop: 2 },

  opacityRow: { flexDirection: "row", gap: 8 },
  opacityPill: {
    flex: 1,
    borderWidth: 2,
    borderRadius: 12,
    paddingVertical: 9,
    alignItems: "center",
  },
  opacityLabel: { fontSize: 13, fontWeight: "700" },
  opacityHint: { fontSize: 11, lineHeight: 16, marginTop: 10, textAlign: "center" },

  // Opacity slider styles
  opacityValueRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  opacityValueLabel: { fontSize: 22, fontWeight: "900", letterSpacing: -0.5 },
  resetButton: {
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  resetButtonText: { fontSize: 11, fontWeight: "600" },

  sliderTrack: {
    height: THUMB_SIZE + 8,
    justifyContent: "center",
  },
  sliderRail: {
    height: 5,
    borderRadius: 3,
    overflow: "hidden",
  },
  sliderFill: {
    height: "100%",
    borderRadius: 3,
  },
  sliderThumb: {
    position: "absolute",
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    borderWidth: 2.5,
    top: 4,
  },

  opacityRangeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
  },
  opacityRangeLabel: { fontSize: 10, fontWeight: "600" },
});
