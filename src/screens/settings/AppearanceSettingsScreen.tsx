import React, { useRef, useState, useCallback } from "react";
import { ScrollView, View, Text, Pressable, Switch, StyleSheet, PanResponder, Modal, TouchableWithoutFeedback } from "react-native";
import * as Haptics from "expo-haptics";
import { useTheme } from "../../theme/ThemeContext";
import { useAppSettings, CARD_OPACITY_MIN, CARD_OPACITY_MAX } from "../../theme/AppSettingsContext";
import { PALETTES, PALETTE_GROUPS } from "../../theme/palettes";
import { useStrings } from "../../strings/StringsContext";
import {
  FONT_FAMILY_KEYS, FONT_FAMILY_LABELS, FONT_SCALE_KEYS, FONT_SCALE_LABELS,
  FontFamilyKey, FontScalePreset,
} from "../../theme/fontSystem";
import {
  OVERVIEW_TEMPLATE, WELLNESS_TEMPLATE, MEALS_TEMPLATE, LIFE_TEMPLATE,
  FINANCE_TEMPLATE, HEALTH_TAB_TEMPLATE,
} from "../../theme/pageTemplates";

// ─── Per-object items ─────────────────────────────────────────────────────────

type ObjectEntry = { id: string; label: string; screen: string };

const OBJECT_ENTRIES: ObjectEntry[] = [
  ...OVERVIEW_TEMPLATE.tiles.map(t => ({ id: t.id, label: t.label, screen: "Home" })),
  ...OVERVIEW_TEMPLATE.cards.map(c => ({ id: c.id, label: c.label, screen: "Home" })),
  ...WELLNESS_TEMPLATE.cards.map(c => ({ id: c.id, label: c.label, screen: "Health" })),
  ...MEALS_TEMPLATE.tiles.map(t => ({ id: t.id, label: t.label, screen: "Meals" })),
  ...MEALS_TEMPLATE.cards.map(c => ({ id: c.id, label: c.label, screen: "Meals" })),
  ...LIFE_TEMPLATE.cards.map(c => ({ id: c.id, label: c.label, screen: "Life" })),
  ...FINANCE_TEMPLATE.cards.map(c => ({ id: c.id, label: c.label, screen: "Finance" })),
  ...HEALTH_TAB_TEMPLATE.cards.map(c => ({ id: c.id, label: c.label, screen: "Med/Cycle" })),
];

// Group by screen
const OBJECT_GROUPS: Record<string, ObjectEntry[]> = {};
for (const entry of OBJECT_ENTRIES) {
  if (!OBJECT_GROUPS[entry.screen]) OBJECT_GROUPS[entry.screen] = [];
  OBJECT_GROUPS[entry.screen].push(entry);
}

// ─── Per-object popup (Modal) ─────────────────────────────────────────────────

interface ObjectPopupProps {
  entry: ObjectEntry | null;
  globalOpacity: number;
  onClose: () => void;
}

function ObjectPopup({ entry, globalOpacity, onClose }: ObjectPopupProps) {
  const { theme } = useTheme();
  const { perObjectOpacity, perObjectGlassBlur, setObjectOpacity, resetObjectOpacity, setObjectGlassBlur } = useAppSettings();
  if (!entry) return null;

  const isCustom = perObjectOpacity[entry.id] !== undefined;
  const value = isCustom ? perObjectOpacity[entry.id] : globalOpacity;
  const glassEnabled = perObjectGlassBlur[entry.id] ?? false;

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={advStyles.popupOverlay}>
          <TouchableWithoutFeedback>
            <View style={[advStyles.popup, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
              {/* Title */}
              <View style={advStyles.popupHeader}>
                <Text style={[advStyles.popupTitle, { color: theme.textStrong }]}>{entry.label}</Text>
                <Text style={[advStyles.popupScreen, { color: theme.textSoft }]}>{entry.screen}</Text>
              </View>

              <View style={[styles.divider, { backgroundColor: theme.cardBorder, marginHorizontal: 0, marginBottom: 16 }]} />

              {/* Opacity slider */}
              <View style={advStyles.panelRow}>
                <Text style={[advStyles.panelLabel, { color: theme.textSoft }]}>Opacity</Text>
                <Text style={[advStyles.panelValue, { color: theme.textStrong }]}>{Math.round(value * 100)}%</Text>
              </View>
              <OpacitySlider
                value={value}
                onChange={(v) => setObjectOpacity(entry.id, v)}
                trackColor={theme.teal.solid}
                thumbColor={theme.card}
                borderColor={theme.teal.solid}
                trackBgColor={theme.cardBorder}
              />

              {/* Glass blur toggle */}
              <View style={[advStyles.panelRow, { marginTop: 18 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[advStyles.panelLabel, { color: theme.textSoft }]}>Glass blur</Text>
                  <Text style={[advStyles.panelHint, { color: theme.textSoft }]}>Activates after next build</Text>
                </View>
                <Switch
                  value={glassEnabled}
                  onValueChange={(v) => { setObjectGlassBlur(entry.id, v); Haptics.selectionAsync(); }}
                  trackColor={{ true: theme.teal.solid, false: theme.cardBorder }}
                  thumbColor="#ffffff"
                />
              </View>

              {/* Footer actions */}
              <View style={advStyles.popupFooter}>
                {isCustom && (
                  <Pressable
                    onPress={() => { resetObjectOpacity(entry.id); Haptics.selectionAsync(); }}
                    style={[advStyles.resetLink, { borderColor: theme.cardBorder }]}
                  >
                    <Text style={[advStyles.resetLinkText, { color: theme.textSoft }]}>Reset to global</Text>
                  </Pressable>
                )}
                <Pressable
                  onPress={onClose}
                  style={[advStyles.doneBtn, { backgroundColor: theme.teal.solid }]}
                >
                  <Text style={advStyles.doneBtnText}>Done</Text>
                </Pressable>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

// ─── Advanced theme menu ──────────────────────────────────────────────────────

function AdvancedThemeMenu({ cardOpacity, theme }: { cardOpacity: number; theme: import("../../theme/theme").Theme }) {
  const [open, setOpen] = useState(false);
  const [activeEntry, setActiveEntry] = useState<ObjectEntry | null>(null);
  const { perObjectOpacity } = useAppSettings();

  return (
    <View style={[advStyles.advCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
      {/* Header row */}
      <Pressable
        onPress={() => { setOpen(o => !o); Haptics.selectionAsync(); }}
        style={({ pressed }) => [
          styles.paletteRow,
          pressed && { backgroundColor: theme.cardBorder + "40" },
        ]}
      >
        <Text style={[styles.paletteName, { color: theme.textStrong }]}>Advanced</Text>
        <Text style={{ color: theme.textSoft, fontSize: 11 }}>{open ? "▲" : "▼"}</Text>
      </Pressable>

      {open && (
        <View>
          <View style={[styles.divider, { backgroundColor: theme.cardBorder }]} />
          <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 }}>
            <Text style={{ fontSize: 11, color: theme.textSoft, lineHeight: 16 }}>
              Tap any card or tile to fine-tune its opacity and glass blur independently.
            </Text>
          </View>
          {Object.entries(OBJECT_GROUPS).map(([screenName, entries]) => (
            <View key={screenName}>
              <Text style={[styles.subGroupLabel, { color: theme.textSoft, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 2 }]}>
                {screenName.toUpperCase()}
              </Text>
              {entries.map((entry, index) => {
                const isLast = index === entries.length - 1;
                const isCustom = perObjectOpacity[entry.id] !== undefined;
                const displayVal = isCustom ? perObjectOpacity[entry.id] : cardOpacity;
                return (
                  <View key={entry.id}>
                    <Pressable
                      onPress={() => { setActiveEntry(entry); Haptics.selectionAsync(); }}
                      style={({ pressed }) => [
                        advStyles.objectRow,
                        pressed && { backgroundColor: theme.cardBorder + "40" },
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[advStyles.objectLabel, { color: theme.textStrong }]}>{entry.label}</Text>
                        <Text style={[advStyles.objectSub, { color: isCustom ? theme.teal.solid : theme.textSoft }]}>
                          {isCustom ? "Custom" : "Global"}: {Math.round(displayVal * 100)}%
                        </Text>
                      </View>
                      <Text style={{ color: theme.textSoft, fontSize: 12 }}>›</Text>
                    </Pressable>
                    {!isLast && <View style={[styles.divider, { backgroundColor: theme.cardBorder }]} />}
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      )}

      {/* Popup — one at a time */}
      <ObjectPopup
        entry={activeEntry}
        globalOpacity={cardOpacity}
        onClose={() => setActiveEntry(null)}
      />
    </View>
  );
}

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

      {/* ── Advanced (inside theme section) ────────────────────────── */}
      <AdvancedThemeMenu cardOpacity={cardOpacity} theme={theme} />

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

const advStyles = StyleSheet.create({
  advCard: {
    borderRadius: 22,
    borderWidth: 2,
    marginTop: 4,
  },
  objectRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  objectLabel: { fontSize: 13, fontWeight: "600" },
  objectSub: { fontSize: 11, marginTop: 1 },
  panelRow: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  panelLabel: { flex: 1, fontSize: 12, fontWeight: "600" },
  panelValue: { fontSize: 14, fontWeight: "700" },
  panelHint: { fontSize: 10, marginTop: 1 },
  resetLink: {
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  resetLinkText: { fontSize: 12, fontWeight: "600" },
  // Popup modal
  popupOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  popup: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 22,
    borderWidth: 2,
    padding: 20,
  },
  popupHeader: { marginBottom: 12 },
  popupTitle: { fontSize: 17, fontWeight: "800" },
  popupScreen: { fontSize: 11, marginTop: 2 },
  popupFooter: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 10,
    marginTop: 20,
  },
  doneBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 12,
  },
  doneBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
