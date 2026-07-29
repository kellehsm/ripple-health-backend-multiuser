import React, { useRef } from "react";
import {
  Modal,
  SafeAreaView,
  ScrollView,
  View,
  Text,
  Pressable,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTheme } from "../theme/ThemeContext";
import { useCardBg } from "../theme/AppSettingsContext";
import { PALETTES, PALETTE_GROUPS } from "../theme/palettes";
import type { Theme } from "../theme/theme";

const BEST_FOR: Record<string, string> = {
  "morning-mist":   "Warm cream & soft greens — the classic default",
  "pale-sage":      "Botanical greens, terracotta & ochre — earthy calm",
  "blush-hour":     "Copper, tangerine & mauve — cozy warm pastels",
  "jewel-light":    "Sapphire, ruby & amethyst — crisp jewel contrast",
  "clean-slate":    "Pure grays & bold saturated accents — clean & modern",
  "obsidian":  "True black, emerald & amber jewels — OLED premium",
  "arctic":    "Ice-deep navy, frost cyan & arctic gold — sharp & crisp",
  "volcanic":  "Warm coal black, ember orange & lava — raw intensity",
  "abyssal":   "Deep ocean floor, bioluminescent cyan & seafloor coral",
  "nebula":    "Deep space, cosmic magenta & supernova gold — dramatic",
};

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function ThemePickerModal({ visible, onClose }: Props) {
  const { theme, paletteId, setPalette } = useTheme();
  const cardBg = useCardBg();
  const previousIdRef = useRef(paletteId);

  // Keep previousIdRef stable for the lifetime of this modal open; reset when
  // the modal opens again (visible transitions false→true).
  const isPreviewing = paletteId !== previousIdRef.current;

  // When the modal closes, reset so next open captures the new baseline.
  const handleClose = () => {
    previousIdRef.current = paletteId;
    onClose();
  };

  const handleSelectPalette = (id: string) => {
    setPalette(id);
    Haptics.selectionAsync();
  };

  const handleRevert = () => {
    setPalette(previousIdRef.current);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={handleClose}
      statusBarTranslucent
      onShow={() => { previousIdRef.current = paletteId; }}
    >
      <SafeAreaView style={[styles.root, { backgroundColor: theme.page }]}>
        <View style={[styles.header, { borderBottomColor: theme.cardBorder }]}>
          <Text style={[styles.headerTitle, { color: theme.textStrong }]}>Appearance</Text>
          <Pressable onPress={handleClose} style={styles.closeBtn} hitSlop={12}>
            <Ionicons name="close" size={22} color={theme.ink} />
          </Pressable>
        </View>

        {isPreviewing && (
          <View
            style={[
              styles.revertBar,
              {
                backgroundColor: (theme as any).amber?.tint ?? theme.card,
                borderBottomColor: theme.cardBorder,
              },
            ]}
          >
            <Text style={[styles.revertText, { color: theme.textStrong }]}>
              Previewing {PALETTES[paletteId]?.name ?? paletteId}
            </Text>
            <Pressable onPress={handleRevert} style={styles.revertBtn} hitSlop={8}>
              <Text style={[styles.revertBtnLabel, { color: theme.textStrong }]}>Revert</Text>
            </Pressable>
          </View>
        )}

        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          {Object.entries(PALETTE_GROUPS).map(([groupName, ids]) => (
            <View key={groupName} style={styles.group}>
              <Text style={[styles.groupLabel, { color: theme.textSoft }]}>
                {groupName.toUpperCase()}
              </Text>
              {ids.map((id) => {
                const p = PALETTES[id];
                return (
                  <ThemeRow
                    key={id}
                    palette={p}
                    selected={paletteId === id}
                    onPress={() => handleSelectPalette(id)}
                  />
                );
              })}
            </View>
          ))}

          {/* ── Premium section ─────────────────────────────────────────────── */}
          <View style={styles.group}>
            <Text style={[styles.groupLabel, { color: theme.textSoft }]}>
              ✦ PREMIUM
            </Text>
            <View style={[styles.premiumPlaceholder, { backgroundColor: cardBg, borderColor: theme.cardBorder }]}>
              <Ionicons name="lock-closed-outline" size={22} color={theme.textSoft} style={{ marginBottom: 8 }} />
              <Text style={[styles.premiumTitle, { color: theme.textStrong }]}>Premium Themes</Text>
              <Text style={[styles.premiumSub, { color: theme.textSoft }]}>
                Exclusive palettes — coming soon
              </Text>
            </View>
          </View>

          <View style={{ height: 32 }} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── Theme row ────────────────────────────────────────────────────────────────

type RowProps = {
  palette: Theme;
  selected: boolean;
  onPress: () => void;
};

function ThemeRow({ palette: p, selected, onPress }: RowProps) {
  // 7-color swatch: background, card surface, then 5 distinct accent roles
  const swatchColors = [
    p.page,
    p.card,
    p.teal.solid,
    p.coral.solid,
    p.amber.solid,
    p.berry.solid,
    p.violet.solid,
  ];

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityLabel={`${p.name} theme — ${BEST_FOR[p.id] ?? ""}`}
      accessibilityState={{ checked: selected }}
      style={[
        styles.row,
        {
          backgroundColor: p.card,
          borderColor: selected ? p.teal.solid : p.cardBorder,
          borderWidth: selected ? 2.5 : 1.5,
        },
      ]}
    >
      {/* Color swatch strip */}
      <View style={styles.swatchStrip}>
        {swatchColors.map((color, i) => (
          <View
            key={i}
            style={[
              styles.swatchSegment,
              { backgroundColor: color },
              i === 0 && styles.swatchLeft,
              i === swatchColors.length - 1 && styles.swatchRight,
            ]}
          />
        ))}
      </View>

      {/* Name + checkmark */}
      <View style={styles.nameRow}>
        <Text style={[styles.themeName, { color: p.textStrong }]} numberOfLines={1}>
          {p.name}
        </Text>
        {selected
          ? <Ionicons name="checkmark-circle" size={20} color={p.teal.solid} />
          : <View style={styles.checkPlaceholder} />
        }
      </View>

      {/* Description */}
      <Text style={[styles.description, { color: p.textSoft }]} numberOfLines={1}>
        {BEST_FOR[p.id] ?? ""}
      </Text>
    </Pressable>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 20, fontWeight: "900", letterSpacing: -0.8 },
  closeBtn: { padding: 4 },
  revertBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  revertText: { fontSize: 13, fontWeight: "600", flex: 1 },
  revertBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "rgba(0,0,0,0.18)",
  },
  revertBtnLabel: { fontSize: 13, fontWeight: "700" },
  scroll: { paddingHorizontal: 16, paddingTop: 20 },
  group: { marginBottom: 28 },
  groupLabel: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.6,
    marginBottom: 10,
    textTransform: "uppercase",
  },
  row: {
    borderRadius: 26,
    overflow: "hidden",
    marginBottom: 10,
  },
  swatchStrip: {
    flexDirection: "row",
    height: 56,
  },
  swatchSegment: {
    flex: 1,
  },
  swatchLeft: { borderTopLeftRadius: 12 },
  swatchRight: { borderTopRightRadius: 12 },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 2,
  },
  themeName: { fontSize: 15, fontWeight: "800", flex: 1, marginRight: 6 },
  checkPlaceholder: { width: 20, height: 20 },
  description: { fontSize: 11, paddingHorizontal: 14, paddingBottom: 12, lineHeight: 15 },
  premiumPlaceholder: {
    borderRadius: 20,
    borderWidth: 1.5,
    borderStyle: "dashed",
    paddingVertical: 28,
    alignItems: "center",
  },
  premiumTitle: { fontSize: 15, fontWeight: "800", marginBottom: 4 },
  premiumSub: { fontSize: 12, opacity: 0.7 },
});
