/**
 * CustomizeBackgroundsScreen — lets users set image backgrounds (by URL)
 * for any page, card, or tile, and control global card opacity.
 */

import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../theme/ThemeContext";
import { useBackgrounds } from "../../theme/BackgroundsContext";
import { useAppSettings } from "../../theme/AppSettingsContext";
import { fonts } from "../../theme/typography";
import { PAGE_TEMPLATES, type ThemeableBackground } from "../../theme/pageTemplates";

// ─── Opacity presets ──────────────────────────────────────────────────────────

const OPACITY_PRESETS = [0.30, 0.50, 0.70, 0.85, 1.0];

function opacityLabel(v: number): string {
  return `${Math.round(v * 100)}%`;
}

// ─── Deduplicate cards/tiles across all templates ─────────────────────────────

type ItemMeta = { id: string; label: string };

function getAllCards(): ItemMeta[] {
  const seen = new Set<string>();
  const result: ItemMeta[] = [];
  for (const tpl of Object.values(PAGE_TEMPLATES)) {
    for (const c of tpl.cards) {
      if (!seen.has(c.id)) {
        seen.add(c.id);
        result.push({ id: c.id, label: c.label });
      }
    }
  }
  return result;
}

function getAllTiles(): ItemMeta[] {
  const seen = new Set<string>();
  const result: ItemMeta[] = [];
  for (const tpl of Object.values(PAGE_TEMPLATES)) {
    for (const t of tpl.tiles) {
      if (!seen.has(t.id)) {
        seen.add(t.id);
        result.push({ id: t.id, label: t.label });
      }
    }
  }
  return result;
}

// ─── Image URL modal ──────────────────────────────────────────────────────────

type ImageModalProps = {
  visible: boolean;
  currentUrl: string;
  onSave: (url: string) => void;
  onCancel: () => void;
};

function ImageModal({ visible, currentUrl, onSave, onCancel }: ImageModalProps) {
  const { theme } = useTheme();
  const [url, setUrl] = useState(currentUrl);

  const handleSave = useCallback(() => {
    const trimmed = url.trim();
    if (!trimmed.startsWith("http")) {
      Alert.alert("Invalid URL", "The URL must start with http or https.");
      return;
    }
    onSave(trimmed);
  }, [url, onSave]);

  // Reset input when modal opens
  React.useEffect(() => {
    if (visible) setUrl(currentUrl);
  }, [visible, currentUrl]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.modalOverlay}
      >
        <View style={[styles.modalSheet, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <Text style={[styles.modalTitle, { color: theme.textStrong }]}>Set image background</Text>
          <Text style={[styles.modalSubtitle, { color: theme.textSoft }]}>
            Paste any image URL (https://...)
          </Text>
          <TextInput
            style={[styles.urlInput, { backgroundColor: theme.page, borderColor: theme.cardBorder, color: theme.textStrong }]}
            value={url}
            onChangeText={setUrl}
            placeholder="https://example.com/image.jpg"
            placeholderTextColor={theme.textSoft}
            autoCorrect={false}
            autoCapitalize="none"
            keyboardType="url"
          />
          <View style={styles.modalButtons}>
            <Pressable
              style={[styles.modalBtn, styles.modalBtnCancel, { borderColor: theme.cardBorder }]}
              onPress={onCancel}
            >
              <Text style={[styles.modalBtnText, { color: theme.textSoft, fontFamily: fonts.medium }]}>
                Cancel
              </Text>
            </Pressable>
            <Pressable
              style={[styles.modalBtn, styles.modalBtnSave, { backgroundColor: theme.teal.bar }]}
              onPress={handleSave}
            >
              <Text style={[styles.modalBtnText, { color: "#fff", fontFamily: fonts.semiBold }]}>
                Save
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Background badge ─────────────────────────────────────────────────────────

function BgBadge({ bg }: { bg: ThemeableBackground | undefined }) {
  const { theme } = useTheme();
  if (!bg) return null;
  if (bg.type === "uri") {
    return (
      <View style={[styles.badge, { backgroundColor: theme.teal.bg }]}>
        <Text style={[styles.badgeText, { color: theme.teal.fg }]}>img</Text>
      </View>
    );
  }
  return null;
}

// ─── Row item ─────────────────────────────────────────────────────────────────

type ItemRowProps = {
  label: string;
  currentBg: ThemeableBackground | undefined;
  onSetImage: () => void;
  onClear: () => void;
};

function ItemRow({ label, currentBg, onSetImage, onClear }: ItemRowProps) {
  const { theme } = useTheme();
  const hasOverride = !!currentBg;

  return (
    <View style={[styles.itemRow, { borderColor: theme.cardBorder }]}>
      <View style={styles.itemLeft}>
        <BgBadge bg={currentBg} />
        <Text style={[styles.itemLabel, { color: theme.textStrong }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <View style={styles.itemActions}>
        <Pressable
          style={[styles.actionBtn, { borderColor: theme.teal.bar }]}
          onPress={onSetImage}
          hitSlop={6}
        >
          <Ionicons name="image-outline" size={14} color={theme.teal.bar} />
          <Text style={[styles.actionBtnText, { color: theme.teal.bar }]}>Set image</Text>
        </Pressable>
        {hasOverride && (
          <Pressable
            style={[styles.actionBtn, { borderColor: theme.cardBorder }]}
            onPress={onClear}
            hitSlop={6}
          >
            <Ionicons name="close-outline" size={14} color={theme.textSoft} />
            <Text style={[styles.actionBtnText, { color: theme.textSoft }]}>Clear</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  const { theme } = useTheme();
  return (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionTitle, { color: theme.textStrong }]}>{title}</Text>
      {subtitle && (
        <Text style={[styles.sectionSubtitle, { color: theme.textSoft }]}>{subtitle}</Text>
      )}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

type ModalTarget = {
  kind: "page" | "card" | "tile";
  id: string;
  currentUrl: string;
};

export function CustomizeBackgroundsScreen() {
  const { theme } = useTheme();
  const { cardOpacity, setCardOpacity } = useAppSettings();
  const {
    pageBackgrounds,
    cardBackgrounds,
    tileBackgrounds,
    setPageBackground,
    setCardBackground,
    setTileBackground,
    clearAll,
  } = useBackgrounds();

  const [modalTarget, setModalTarget] = useState<ModalTarget | null>(null);

  const pages = Object.values(PAGE_TEMPLATES);
  const allCards = getAllCards();
  const allTiles = getAllTiles();

  // ── Modal handlers ─────────────────────────────────────────────────────────

  const openModal = useCallback((kind: "page" | "card" | "tile", id: string) => {
    const map = kind === "page" ? pageBackgrounds : kind === "card" ? cardBackgrounds : tileBackgrounds;
    const existing = map[id];
    const currentUrl = existing?.type === "uri" ? existing.value : "";
    setModalTarget({ kind, id, currentUrl });
  }, [pageBackgrounds, cardBackgrounds, tileBackgrounds]);

  const handleSave = useCallback((url: string) => {
    if (!modalTarget) return;
    const bg: ThemeableBackground = { type: "uri", value: url };
    if (modalTarget.kind === "page") setPageBackground(modalTarget.id, bg);
    else if (modalTarget.kind === "card") setCardBackground(modalTarget.id, bg);
    else setTileBackground(modalTarget.id, bg);
    setModalTarget(null);
  }, [modalTarget, setPageBackground, setCardBackground, setTileBackground]);

  const handleCancel = useCallback(() => setModalTarget(null), []);

  const handleClear = useCallback((kind: "page" | "card" | "tile", id: string) => {
    if (kind === "page") setPageBackground(id, null);
    else if (kind === "card") setCardBackground(id, null);
    else setTileBackground(id, null);
  }, [setPageBackground, setCardBackground, setTileBackground]);

  const handleClearAll = useCallback(() => {
    Alert.alert(
      "Reset all backgrounds",
      "This will remove all custom image backgrounds. Card transparency will remain unchanged.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Reset", style: "destructive", onPress: clearAll },
      ],
    );
  }, [clearAll]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.screen, { backgroundColor: theme.page }]}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >

        {/* ── A. Card Transparency ───────────────────────────────────────── */}
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <SectionHeader title="Card Transparency" />
          <View style={styles.opacityRow}>
            {OPACITY_PRESETS.map((preset) => {
              const isActive = Math.abs(cardOpacity - preset) < 0.01;
              return (
                <Pressable
                  key={preset}
                  style={[
                    styles.opacityChip,
                    {
                      borderColor: isActive ? theme.teal.bar : theme.cardBorder,
                      backgroundColor: isActive ? theme.teal.bg : "transparent",
                    },
                  ]}
                  onPress={() => setCardOpacity(preset)}
                >
                  <Text style={[styles.opacityChipText, { color: isActive ? theme.teal.fg : theme.textSoft, fontFamily: fonts.semiBold }]}>
                    {opacityLabel(preset)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={[styles.opacityNote, { color: theme.textSoft }]}>
            Cards are {opacityLabel(cardOpacity)} opaque
          </Text>
        </View>

        {/* ── B. Page Backgrounds ────────────────────────────────────────── */}
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <SectionHeader
            title="Page Backgrounds"
            subtitle="Apply an image behind each screen"
          />
          {pages.map((tpl) => (
            <ItemRow
              key={tpl.pageId}
              label={tpl.pageName}
              currentBg={pageBackgrounds[tpl.pageId]}
              onSetImage={() => openModal("page", tpl.pageId)}
              onClear={() => handleClear("page", tpl.pageId)}
            />
          ))}
        </View>

        {/* ── C. Card Backgrounds ────────────────────────────────────────── */}
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <SectionHeader
            title="Card Backgrounds"
            subtitle="Set an image background for individual cards"
          />
          {allCards.map((item) => (
            <ItemRow
              key={item.id}
              label={item.label}
              currentBg={cardBackgrounds[item.id]}
              onSetImage={() => openModal("card", item.id)}
              onClear={() => handleClear("card", item.id)}
            />
          ))}
        </View>

        {/* ── D. Tile Backgrounds ────────────────────────────────────────── */}
        {allTiles.length > 0 && (
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <SectionHeader
              title="Tile Backgrounds"
              subtitle="Set an image background for metric tiles"
            />
            {allTiles.map((item) => (
              <ItemRow
                key={item.id}
                label={item.label}
                currentBg={tileBackgrounds[item.id]}
                onSetImage={() => openModal("tile", item.id)}
                onClear={() => handleClear("tile", item.id)}
              />
            ))}
          </View>
        )}

        {/* ── E. Reset all ───────────────────────────────────────────────── */}
        <Pressable
          style={[styles.resetBtn, { borderColor: theme.cardBorder, backgroundColor: theme.card }]}
          onPress={handleClearAll}
        >
          <Ionicons name="refresh-outline" size={16} color={theme.textSoft} style={{ marginRight: 6 }} />
          <Text style={[styles.resetBtnText, { color: theme.textSoft, fontFamily: fonts.medium }]}>
            Reset everything to defaults
          </Text>
        </Pressable>

      </ScrollView>

      {/* ── Image URL modal ──────────────────────────────────────────────── */}
      <ImageModal
        visible={modalTarget !== null}
        currentUrl={modalTarget?.currentUrl ?? ""}
        onSave={handleSave}
        onCancel={handleCancel}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    padding: 16,
    gap: 14,
    paddingBottom: 40,
  },
  card: {
    borderRadius: 14,
    borderWidth: 0.5,
    padding: 16,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  sectionHeader: {
    gap: 2,
  },
  sectionTitle: {
    fontSize: 15,
    fontFamily: "Nunito_600SemiBold",
  },
  sectionSubtitle: {
    fontSize: 12,
    fontFamily: "Nunito_400Regular",
  },

  // Opacity presets
  opacityRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  opacityChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  opacityChipText: {
    fontSize: 13,
  },
  opacityNote: {
    fontSize: 12,
    fontFamily: "Nunito_400Regular",
    marginTop: -4,
  },

  // Item rows
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    gap: 8,
  },
  itemLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  itemLabel: {
    fontSize: 13,
    fontFamily: "Nunito_500Medium",
    flex: 1,
  },
  itemActions: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 20,
    borderWidth: 1,
  },
  actionBtnText: {
    fontSize: 12,
    fontFamily: "Nunito_500Medium",
  },

  // Badge
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 10,
    fontFamily: "Nunito_600SemiBold",
  },

  // Reset button
  resetBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  resetBtnText: {
    fontSize: 14,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  modalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 0.5,
    padding: 24,
    gap: 16,
    paddingBottom: Platform.OS === "ios" ? 36 : 24,
  },
  modalTitle: {
    fontSize: 17,
    fontFamily: "Nunito_700Bold",
  },
  modalSubtitle: {
    fontSize: 13,
    fontFamily: "Nunito_400Regular",
    marginTop: -8,
  },
  urlInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 13,
    fontFamily: "Nunito_400Regular",
  },
  modalButtons: {
    flexDirection: "row",
    gap: 10,
  },
  modalBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  modalBtnCancel: {
    borderWidth: 1,
  },
  modalBtnSave: {},
  modalBtnText: {
    fontSize: 15,
  },
});
