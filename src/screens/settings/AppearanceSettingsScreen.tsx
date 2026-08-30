import React, { useRef, useState, useCallback } from "react";
import { ScrollView, View, Text, Pressable, Switch, StyleSheet, PanResponder, Modal, TouchableWithoutFeedback, Image, Alert } from "react-native";
import * as Haptics from "expo-haptics";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../theme/ThemeContext";
import { useAppSettings, CARD_OPACITY_MIN, CARD_OPACITY_MAX } from "../../theme/AppSettingsContext";
import { PALETTES, PALETTE_GROUPS, THEME_FAMILIES } from "../../theme/palettes";
import { useStrings } from "../../strings/StringsContext";
import { pickAndStoreImage, deleteStoredImage } from "../../lib/pickBackgroundImage";
import {
  FONT_FAMILY_KEYS, FONT_FAMILY_LABELS, FONT_SCALE_KEYS, FONT_SCALE_LABELS,
  FontFamilyKey, FontScalePreset,
} from "../../theme/fontSystem";
import {
  PAGE_TEMPLATES,
  OVERVIEW_TEMPLATE, WELLNESS_TEMPLATE, MEALS_TEMPLATE, LIFE_TEMPLATE,
  FINANCE_TEMPLATE, HEALTH_TAB_TEMPLATE,
} from "../../theme/pageTemplates";
import { ThemePreviewFrame } from "./ThemePreviewFrame";
import { ScreenBackground } from "../../components/ScreenBackground";

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
  const {
    perObjectOpacity, perObjectGlassBlur, setObjectOpacity, resetObjectOpacity, setObjectGlassBlur,
    elementBgImages, setElementBgImage, removeElementBgImage,
  } = useAppSettings();
  if (!entry) return null;

  const isCustom = perObjectOpacity[entry.id] !== undefined;
  const value = isCustom ? perObjectOpacity[entry.id] : globalOpacity;
  const glassEnabled = perObjectGlassBlur[entry.id] ?? false;
  const bgImage = elementBgImages[entry.id];

  const handlePickImage = async () => {
    try {
      const uri = await pickAndStoreImage(entry.id);
      if (!uri) return;
      if (bgImage) deleteStoredImage(bgImage.uri);
      setElementBgImage(entry.id, { uri, opacity: bgImage?.opacity ?? 0.85 });
      Haptics.selectionAsync();
    } catch {
      Alert.alert("Couldn't load image", "Try a different photo.");
    }
  };

  const handleRemoveImage = () => {
    if (bgImage) deleteStoredImage(bgImage.uri);
    removeElementBgImage(entry.id);
    Haptics.selectionAsync();
  };

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

              {/* Background image */}
              <View style={[advStyles.panelRow, { marginTop: 18 }]}>
                <Text style={[advStyles.panelLabel, { color: theme.textSoft }]}>Background image</Text>
              </View>
              {bgImage ? (
                <View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                    <Image
                      source={{ uri: bgImage.uri }}
                      style={{ width: 64, height: 44, borderRadius: 10, borderWidth: 1.5, borderColor: theme.cardBorder }}
                    />
                    <Pressable onPress={handlePickImage} style={[advStyles.resetLink, { borderColor: theme.cardBorder }]}>
                      <Text style={[advStyles.resetLinkText, { color: theme.textStrong }]}>Replace</Text>
                    </Pressable>
                    <Pressable onPress={handleRemoveImage} style={[advStyles.resetLink, { borderColor: theme.cardBorder }]}>
                      <Text style={[advStyles.resetLinkText, { color: theme.danger }]}>Remove</Text>
                    </Pressable>
                  </View>
                  <View style={[advStyles.panelRow, { marginTop: 12 }]}>
                    <Text style={[advStyles.panelLabel, { color: theme.textSoft }]}>Image strength</Text>
                    <Text style={[advStyles.panelValue, { color: theme.textStrong }]}>
                      {Math.round((bgImage.opacity ?? 0.85) * 100)}%
                    </Text>
                  </View>
                  <OpacitySlider
                    value={bgImage.opacity ?? 0.85}
                    onChange={(v) => setElementBgImage(entry.id, { ...bgImage, opacity: v })}
                    trackColor={theme.violet.solid}
                    thumbColor={theme.card}
                    borderColor={theme.violet.solid}
                    trackBgColor={theme.cardBorder}
                  />
                </View>
              ) : (
                <Pressable
                  onPress={handlePickImage}
                  style={[advStyles.pickImageBtn, { borderColor: theme.cardBorder }]}
                >
                  <Ionicons name="image-outline" size={18} color={theme.teal.solid} />
                  <Text style={[advStyles.resetLinkText, { color: theme.textStrong }]}>Choose a photo</Text>
                </Pressable>
              )}

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

// ─── Page background popup + section ─────────────────────────────────────────

function PageBgPopup({ page, onClose }: { page: { pageId: string; pageName: string } | null; onClose: () => void }) {
  const { theme } = useTheme();
  const { elementBgImages, setElementBgImage, removeElementBgImage } = useAppSettings();
  if (!page) return null;

  const bgImage = elementBgImages[page.pageId];

  const handlePickImage = async () => {
    try {
      const uri = await pickAndStoreImage(page.pageId);
      if (!uri) return;
      if (bgImage) deleteStoredImage(bgImage.uri);
      setElementBgImage(page.pageId, { uri, opacity: bgImage?.opacity ?? 0.85 });
      Haptics.selectionAsync();
    } catch {
      Alert.alert("Couldn't load image", "Try a different photo.");
    }
  };

  const handleRemoveImage = () => {
    if (bgImage) deleteStoredImage(bgImage.uri);
    removeElementBgImage(page.pageId);
    Haptics.selectionAsync();
  };

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={advStyles.popupOverlay}>
          <TouchableWithoutFeedback>
            <View style={[advStyles.popup, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
              <View style={advStyles.popupHeader}>
                <Text style={[advStyles.popupTitle, { color: theme.textStrong }]}>{page.pageName}</Text>
                <Text style={[advStyles.popupScreen, { color: theme.textSoft }]}>Page background</Text>
              </View>

              <View style={[styles.divider, { backgroundColor: theme.cardBorder, marginHorizontal: 0, marginBottom: 16 }]} />

              {bgImage ? (
                <View>
                  <Image
                    source={{ uri: bgImage.uri }}
                    style={{ width: "100%", height: 120, borderRadius: 14, borderWidth: 1.5, borderColor: theme.cardBorder }}
                    resizeMode="cover"
                  />
                  <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                    <Pressable onPress={handlePickImage} style={[advStyles.resetLink, { borderColor: theme.cardBorder }]}>
                      <Text style={[advStyles.resetLinkText, { color: theme.textStrong }]}>Replace</Text>
                    </Pressable>
                    <Pressable onPress={handleRemoveImage} style={[advStyles.resetLink, { borderColor: theme.cardBorder }]}>
                      <Text style={[advStyles.resetLinkText, { color: theme.danger }]}>Remove</Text>
                    </Pressable>
                  </View>
                  <View style={[advStyles.panelRow, { marginTop: 14 }]}>
                    <Text style={[advStyles.panelLabel, { color: theme.textSoft }]}>Image strength</Text>
                    <Text style={[advStyles.panelValue, { color: theme.textStrong }]}>
                      {Math.round((bgImage.opacity ?? 0.85) * 100)}%
                    </Text>
                  </View>
                  <OpacitySlider
                    value={bgImage.opacity ?? 0.85}
                    onChange={(v) => setElementBgImage(page.pageId, { ...bgImage, opacity: v })}
                    trackColor={theme.violet.solid}
                    thumbColor={theme.card}
                    borderColor={theme.violet.solid}
                    trackBgColor={theme.cardBorder}
                  />
                </View>
              ) : (
                <Pressable
                  onPress={handlePickImage}
                  style={[advStyles.pickImageBtn, { borderColor: theme.cardBorder }]}
                >
                  <Ionicons name="image-outline" size={18} color={theme.teal.solid} />
                  <Text style={[advStyles.resetLinkText, { color: theme.textStrong }]}>Choose a photo</Text>
                </Pressable>
              )}

              <View style={advStyles.popupFooter}>
                <Pressable onPress={onClose} style={[advStyles.doneBtn, { backgroundColor: theme.teal.solid }]}>
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

function PageBackgroundsSection({ theme }: { theme: import("../../theme/theme").Theme }) {
  const [open, setOpen] = useState(false);
  const [activePage, setActivePage] = useState<{ pageId: string; pageName: string } | null>(null);
  const { elementBgImages } = useAppSettings();
  const pages = Object.values(PAGE_TEMPLATES);

  return (
    <View style={[advStyles.advCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
      <Pressable
        onPress={() => { setOpen(o => !o); Haptics.selectionAsync(); }}
        style={({ pressed }) => [
          styles.paletteRow,
          pressed && { backgroundColor: theme.cardBorder + "40" },
        ]}
      >
        <Ionicons name="image-outline" size={18} color={theme.teal.solid} style={{ marginRight: 10 }} />
        <Text style={[styles.paletteName, { color: theme.textStrong }]}>Page backgrounds</Text>
        <Text style={{ color: theme.textSoft, fontSize: 11 }}>{open ? "▲" : "▼"}</Text>
      </Pressable>

      {open && (
        <View>
          <View style={[styles.divider, { backgroundColor: theme.cardBorder }]} />
          <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 }}>
            <Text style={{ fontSize: 11, color: theme.textSoft, lineHeight: 16 }}>
              Set a photo behind any page. Your image replaces the theme's scenery for that page.
            </Text>
          </View>
          {pages.map((page, index) => {
            const isLast = index === pages.length - 1;
            const hasImage = elementBgImages[page.pageId] !== undefined;
            return (
              <View key={page.pageId}>
                <Pressable
                  onPress={() => { setActivePage(page); Haptics.selectionAsync(); }}
                  style={({ pressed }) => [
                    advStyles.objectRow,
                    pressed && { backgroundColor: theme.cardBorder + "40" },
                  ]}
                >
                  {hasImage && (
                    <Image
                      source={{ uri: elementBgImages[page.pageId].uri }}
                      style={{ width: 36, height: 26, borderRadius: 6, marginRight: 10, borderWidth: 1, borderColor: theme.cardBorder }}
                    />
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={[advStyles.objectLabel, { color: theme.textStrong }]}>{page.pageName}</Text>
                    <Text style={[advStyles.objectSub, { color: hasImage ? theme.teal.solid : theme.textSoft }]}>
                      {hasImage ? "Custom photo" : "Theme scenery"}
                    </Text>
                  </View>
                  <Text style={{ color: theme.textSoft, fontSize: 12 }}>›</Text>
                </Pressable>
                {!isLast && <View style={[styles.divider, { backgroundColor: theme.cardBorder }]} />}
              </View>
            );
          })}
        </View>
      )}

      <PageBgPopup page={activePage} onClose={() => setActivePage(null)} />
    </View>
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

function FamilyCard({ familyId }: { familyId: string }) {
  const { theme, family, mode, setFamily } = useTheme();
  const fam = THEME_FAMILIES.find((f) => f.id === familyId)!;
  const light = PALETTES[fam.light];
  const dark = PALETTES[fam.dark];
  // Preview the variant that matches the current mode
  const preview = mode === "dark" ? dark : light;
  const isActive = family.id === fam.id;

  const swatches = [preview.page, preview.card, preview.teal.solid, preview.coral.solid, preview.amber.solid, preview.violet.solid, preview.berry.solid];

  return (
    <Pressable
      onPress={() => { Haptics.selectionAsync(); setFamily(fam.id); }}
      accessibilityRole="radio"
      accessibilityState={{ checked: isActive }}
      style={[
        famStyles.card,
        {
          backgroundColor: preview.card,
          borderColor: isActive ? theme.primary : preview.cardBorder,
          borderWidth: isActive ? 3 : 1.5,
        },
      ]}
    >
      <View style={famStyles.swatchStrip}>
        {swatches.map((c, i) => (
          <View key={i} style={[famStyles.swatchSegment, { backgroundColor: c }]} />
        ))}
      </View>
      <View style={famStyles.nameRow}>
        <Text style={[famStyles.name, { color: preview.textStrong }]}>{fam.name}</Text>
        {isActive
          ? <Ionicons name="checkmark-circle" size={20} color={theme.primary} />
          : <View style={{ width: 20, height: 20 }} />}
      </View>
      <Text style={[famStyles.tagline, { color: preview.textSoft }]} numberOfLines={1}>
        {fam.tagline}
      </Text>
    </Pressable>
  );
}

const PREMIUM_TAGLINES: Record<string, string> = {
  "cozy-cat": "Warm cream & marmalade — with adorable cat companions",
};

function PremiumThemeCard({ id }: { id: string }) {
  const { theme, paletteId, setPalette } = useTheme();
  const p = PALETTES[id];
  const isActive = paletteId === id;
  const swatches = [p.page, p.card, p.teal.solid, p.coral.solid, p.amber.solid, p.violet.solid, p.berry.solid];

  return (
    <Pressable
      onPress={() => { Haptics.selectionAsync(); setPalette(id); }}
      accessibilityRole="radio"
      accessibilityState={{ checked: isActive }}
      style={[
        famStyles.card,
        {
          backgroundColor: p.card,
          borderColor: isActive ? theme.primary : p.cardBorder,
          borderWidth: isActive ? 3 : 1.5,
        },
      ]}
    >
      <View style={famStyles.swatchStrip}>
        {swatches.map((c, i) => (
          <View key={i} style={[famStyles.swatchSegment, { backgroundColor: c }]} />
        ))}
      </View>
      <View style={famStyles.nameRow}>
        <Text style={[famStyles.name, { color: p.textStrong }]}>{p.name}</Text>
        {isActive
          ? <Ionicons name="checkmark-circle" size={20} color={theme.primary} />
          : <View style={{ width: 20, height: 20 }} />}
      </View>
      <Text style={[famStyles.tagline, { color: p.textSoft }]} numberOfLines={1}>
        {PREMIUM_TAGLINES[id] ?? ""}
      </Text>
    </Pressable>
  );
}

const famStyles = StyleSheet.create({
  card: { borderRadius: 22, overflow: "hidden", marginBottom: 10 },
  swatchStrip: { flexDirection: "row", height: 48 },
  swatchSegment: { flex: 1 },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 2,
  },
  name: { fontSize: 15, fontWeight: "800", flex: 1, marginRight: 6 },
  tagline: { fontSize: 11, paddingHorizontal: 14, paddingBottom: 12, lineHeight: 15 },
});

export function AppearanceSettingsScreen() {
  const navigation = useNavigation<any>();
  const { theme, paletteId, mode, setMode } = useTheme();
  const {
    shadowsEnabled, setShadowsEnabled,
    cardOutlineColor, setCardOutlineColor,
    fontFamily, fontSizeScale, setFontFamily, setFontSizeScale,
    cardOpacity, cardOpacityManualOverride, setCardOpacity, resetCardOpacity,
  } = useAppSettings();
  const s = useStrings();

  const themeDefault = PALETTES[paletteId]?.defaultCardOpacity ?? 1.0;

  return (
    <View style={{ flex: 1, backgroundColor: theme.page }}>
      <ScreenBackground pageId="settings_appearance" />
    <ScrollView style={{ backgroundColor: "transparent" }} contentContainerStyle={styles.content}>

      {/* ── Live Preview ───────────────────────────────────────────── */}
      <Text style={[styles.groupLabel, { color: theme.textSoft }]}>LIVE PREVIEW</Text>
      <Text style={[styles.sectionDesc, { color: theme.textSoft }]}>
        Tap any card, tile, or the page background to edit that element directly.
      </Text>
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder, paddingTop: 12, paddingBottom: 8 }]}>
        <ThemePreviewFrame />
      </View>

      {/* ── Light / dark mode ──────────────────────────────────────── */}
      <Text style={[styles.groupLabel, { color: theme.textSoft }]}>APPEARANCE MODE</Text>
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder, padding: 14 }]}>
        <View style={styles.opacityRow}>
          {(["light", "dark"] as const).map((m) => {
            const active = mode === m;
            return (
              <Pressable
                key={m}
                onPress={() => { Haptics.selectionAsync(); setMode(m); }}
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
                style={[
                  styles.opacityPill,
                  { backgroundColor: active ? theme.primary : theme.page, borderColor: active ? theme.primary : theme.cardBorder, flexDirection: "row", justifyContent: "center", gap: 6 },
                ]}
              >
                <Ionicons name={m === "light" ? "sunny" : "moon"} size={15} color={active ? "#ffffff" : theme.textSoft} />
                <Text style={[styles.opacityLabel, { color: active ? "#ffffff" : theme.textSoft }]}>
                  {m === "light" ? "Light" : "Dark"}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* ── Theme families ─────────────────────────────────────────── */}
      <Text style={[styles.groupLabel, { color: theme.textSoft, marginTop: 8 }]}>{s.appearance_theme_title}</Text>
      <Text style={[styles.sectionDesc, { color: theme.textSoft }]}>
        Every theme comes as a matched pair — pick a family and the light/dark switch keeps your look.
      </Text>
      <View>
        {THEME_FAMILIES.map((f) => (
          <FamilyCard key={f.id} familyId={f.id} />
        ))}
      </View>

      {/* ── Premium themes ─────────────────────────────────────────── */}
      <Text style={[styles.groupLabel, { color: theme.textSoft, marginTop: 8 }]}>✦ PREMIUM</Text>
      <View>
        {(PALETTE_GROUPS["Premium"] ?? []).map((id) => (
          <PremiumThemeCard key={id} id={id} />
        ))}
      </View>

      {/* ── Page backgrounds ───────────────────────────────────────── */}
      <Text style={[styles.groupLabel, { color: theme.textSoft, marginTop: 8 }]}>PERSONAL TOUCHES</Text>
      <PageBackgroundsSection theme={theme} />

      {/* ── Advanced (inside theme section) ────────────────────────── */}
      <AdvancedThemeMenu cardOpacity={cardOpacity} theme={theme} />

      {/* ── Card outline color ─────────────────────────────────────── */}
      <Text style={[styles.groupLabel, { color: theme.textSoft, marginTop: 20 }]}>CARD OUTLINE</Text>
      <Text style={[styles.sectionDesc, { color: theme.textSoft }]}>
        Fallback border color for cards that don't have their own accent (glucose stays berry, steps stays teal, etc.). "Auto" uses the theme's default outline.
      </Text>
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder, padding: 12 }]}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          {(() => {
            const swatches: Array<{ label: string; value: string | null }> = [
              { label: "Auto",   value: null },
              { label: "Ink",    value: theme.ink },
              { label: "Teal",   value: theme.teal.solid },
              { label: "Coral",  value: theme.coral.solid },
              { label: "Purple", value: theme.purple.solid },
              { label: "Berry",  value: theme.berry.solid },
              { label: "Amber",  value: theme.amber?.solid ?? "#f59e0b" },
              { label: "Blue",   value: theme.blue.solid },
            ];
            return swatches.map(({ label, value }) => {
              const selected = cardOutlineColor === value;
              return (
                <Pressable
                  key={label}
                  onPress={() => setCardOutlineColor(value)}
                  accessibilityRole="button"
                  accessibilityLabel={`${label} card outline${selected ? ", selected" : ""}`}
                  accessibilityState={{ selected }}
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 14,
                    borderWidth: selected ? 4 : 2,
                    borderColor: theme.ink,
                    backgroundColor: value ?? "transparent",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {value === null && (
                    <Text style={{ color: theme.textSoft, fontSize: 10, fontWeight: "900" }}>AUTO</Text>
                  )}
                  {selected && value !== null && (
                    <Text style={{ color: "#ffffff", fontSize: 18, fontWeight: "900" }}>✓</Text>
                  )}
                </Pressable>
              );
            });
          })()}
        </View>
      </View>

      {/* ── Shadows (advanced) ────────────────────────────────────── */}
      <Text style={[styles.groupLabel, { color: theme.textSoft, marginTop: 20 }]}>{s.appearance_shadows_title}</Text>
      <Text style={[styles.sectionDesc, { color: theme.textSoft }]}>
        Shadows are off by default now — the design uses thick contrasting outlines instead. Turn back on if you preferred the layered-shadow look.
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

      {/* ── Card image splitter ─────────────────────────────────── */}
      <Text style={[styles.groupLabel, { color: theme.textSoft, marginTop: 20 }]}>CARD BACKGROUNDS</Text>
      <Text style={[styles.sectionDesc, { color: theme.textSoft }]}>
        Split a photo across all your Home dashboard cards to create a mosaic wallpaper effect.
      </Text>
      <Pressable
        onPress={() => navigation.navigate("CardImageSplitter")}
        style={[styles.card, styles.navRow, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
      >
        <Ionicons name="images-outline" size={20} color={theme.teal.solid} style={{ marginRight: 12 }} />
        <Text style={[styles.paletteName, { color: theme.textStrong }]}>Split Image to Cards</Text>
        <Ionicons name="chevron-forward" size={18} color={theme.textSoft} />
      </Pressable>

    </ScrollView>
    </View>
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
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
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
  pickImageBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderRadius: 12,
    paddingVertical: 12,
  },
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
