import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, Pressable, StyleSheet, PanResponder, Animated,
  useWindowDimensions, Alert, ScrollView, Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { useAppSettings } from "../theme/AppSettingsContext";
import { OVERVIEW_TEMPLATE } from "../theme/pageTemplates";

// ─── Card layout weights (approximate relative heights on screen) ────────────

const CARD_WEIGHTS: Record<string, number> = {
  wellness_snapshot: 5,
  streak_pills:      2,
  fasting_timer:     2,
  timeline:          6,
  insights_preview:  3,
  mood_pattern:      4,
  cross_metric:      3,
  seven_day_review:  4,
};

const CARDS = OVERVIEW_TEMPLATE.cards
  .filter((c) => CARD_WEIGHTS[c.id] !== undefined)
  .map((c, i, arr) => {
    const weight = CARD_WEIGHTS[c.id];
    const totalWeight = arr.reduce((s, x) => s + (CARD_WEIGHTS[x.id] ?? 0), 0);
    const yWeight = arr.slice(0, i).reduce((s, x) => s + (CARD_WEIGHTS[x.id] ?? 0), 0);
    return { ...c, weight, yFraction: yWeight / totalWeight, hFraction: weight / totalWeight };
  });

const TOTAL_WEIGHT = CARDS.reduce((s, c) => s + c.weight, 0);

// ─── Types ────────────────────────────────────────────────────────────────────

type ImageMeta = { uri: string; width: number; height: number };

// ─── Main screen ──────────────────────────────────────────────────────────────

export function CardImageSplitterScreen() {
  const { theme } = useTheme();
  const { setCardBgImages, clearCardBgImages, cardBgImages } = useAppSettings();
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();

  const [imageMeta, setImageMeta] = useState<ImageMeta | null>(null);
  const [scale, setScale] = useState(1.0);
  const [saving, setSaving] = useState(false);
  const hasApplied = Object.keys(cardBgImages).length > 0;

  // Pan state — only vertical pan since cards are full-width
  const panY = useRef(new Animated.Value(0)).current;
  const panYOffset = useRef(0);

  // Stable animated base offset (centering) — updated when scale/image changes
  const baseOffsetY = useRef(new Animated.Value(0)).current;
  const imageTop = useRef(Animated.add(baseOffsetY, panY)).current;

  // Preview container dimensions
  const PREVIEW_H = Math.round(screenH * 0.58);
  const PREVIEW_W = screenW;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => imageMeta !== null,
      onMoveShouldSetPanResponder: () => imageMeta !== null,
      onPanResponderGrant: () => {
        panY.setOffset(panYOffset.current);
        panY.setValue(0);
      },
      onPanResponderMove: Animated.event([null, { dy: panY }], { useNativeDriver: false }),
      onPanResponderRelease: (_, g) => {
        panYOffset.current += g.dy;
        panY.flattenOffset();
      },
    })
  ).current;

  const pickImage = useCallback(async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["image/jpeg", "image/png", "image/webp", "image/*"],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    const srcUri = asset.uri;

    // Copy to document directory so the URI survives cache clears
    const dir = FileSystem.documentDirectory + "card_bgs/";
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
    const filename = "source_" + Date.now() + ".jpg";
    const destUri = dir + filename;
    await FileSystem.copyAsync({ from: srcUri, to: destUri });

    // Measure natural dimensions
    Image.getSize(
      destUri,
      (w, h) => {
        setImageMeta({ uri: destUri, width: w, height: h });
        // Reset pan & scale to show image filling the preview height
        panYOffset.current = 0;
        panY.setValue(0);
        // Set initial scale so the image fills the preview container height
        const ar = w / h;
        const fitHeightScale = PREVIEW_H / (PREVIEW_W / ar);
        setScale(Math.max(0.5, Math.min(3, fitHeightScale)));
      },
      () => {
        // Fallback if getSize fails (e.g. some content:// URIs)
        setImageMeta({ uri: destUri, width: PREVIEW_W, height: PREVIEW_H });
        panYOffset.current = 0;
        panY.setValue(0);
        setScale(1);
      }
    );
  }, [PREVIEW_H, PREVIEW_W, panY]);

  const apply = useCallback(async () => {
    if (!imageMeta) return;
    setSaving(true);
    try {
      const { uri, width: imgW, height: imgH } = imageMeta;
      const ar = imgW / imgH;

      // Image displayed dimensions at current scale
      const dispW = PREVIEW_W * scale;
      const dispH = dispW / ar;

      // Current pan offset
      const curPanY = panYOffset.current;

      // Image top in preview container (centered, then panned)
      const imgTop = (PREVIEW_H - dispH) / 2 + curPanY;

      const result: Record<string, { uri: string; yFraction: number; hFraction: number }> = {};

      for (const card of CARDS) {
        // Card position in preview container
        const cardTopPx = card.yFraction * PREVIEW_H;
        const cardHeightPx = card.hFraction * PREVIEW_H;

        // Position within the displayed image
        const cardRelTop = cardTopPx - imgTop;
        const yFrac = cardRelTop / dispH;
        const hFrac = cardHeightPx / dispH;

        // Clamp to valid range
        const yF = Math.max(0, Math.min(0.999, yFrac));
        const hF = Math.max(0.001, Math.min(1 - yF, hFrac));

        result[card.id] = { uri, yFraction: yF, hFraction: hF };
      }

      setCardBgImages(result);
      Alert.alert("Applied!", "Dashboard card backgrounds updated. Go to Home to see the result.");
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to apply backgrounds.");
    } finally {
      setSaving(false);
    }
  }, [imageMeta, scale, PREVIEW_H, PREVIEW_W, panYOffset, setCardBgImages]);

  const clear = useCallback(() => {
    clearCardBgImages();
    setImageMeta(null);
    panYOffset.current = 0;
    panY.setValue(0);
    setScale(1);
  }, [clearCardBgImages, panY]);

  // Displayed image position (animated)
  const ar = imageMeta ? imageMeta.width / imageMeta.height : 1;
  const dispW = PREVIEW_W * scale;
  const dispH = dispW / ar;

  // Keep baseOffsetY in sync whenever displayed height changes
  useEffect(() => {
    baseOffsetY.setValue((PREVIEW_H - dispH) / 2);
  }, [dispH, PREVIEW_H, baseOffsetY]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.page }}>
      {/* ── Preview area ─────────────────────────────────────────── */}
      <View
        style={[styles.preview, { width: PREVIEW_W, height: PREVIEW_H, backgroundColor: "#111" }]}
        {...panResponder.panHandlers}
      >
        {imageMeta ? (
          <>
            {/* Image layer */}
            <Animated.Image
              source={{ uri: imageMeta.uri }}
              resizeMode="cover"
              style={{
                position: "absolute",
                width: dispW,
                height: dispH,
                left: (PREVIEW_W - dispW) / 2,
                top: imageTop,
              }}
            />

            {/* Card grid overlay */}
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              {CARDS.map((card) => (
                <View
                  key={card.id}
                  style={[
                    styles.gridSlot,
                    {
                      position: "absolute",
                      top: card.yFraction * PREVIEW_H,
                      height: card.hFraction * PREVIEW_H,
                      left: 8,
                      right: 8,
                      borderColor: "rgba(255,255,255,0.5)",
                    },
                  ]}
                >
                  <View style={styles.slotLabelBg}>
                    <Text style={styles.slotLabel} numberOfLines={1}>{card.label}</Text>
                  </View>
                </View>
              ))}
            </View>

            {/* Pan hint */}
            <View style={styles.hintBadge} pointerEvents="none">
              <Ionicons name="swap-vertical-outline" size={12} color="rgba(255,255,255,0.8)" />
              <Text style={styles.hintText}>Drag to reframe</Text>
            </View>
          </>
        ) : (
          /* Empty state */
          <Pressable style={styles.pickPrompt} onPress={pickImage}>
            <Ionicons name="image-outline" size={48} color="rgba(255,255,255,0.4)" />
            <Text style={styles.pickPromptText}>Tap to pick an image</Text>
            <Text style={styles.pickPromptSub}>
              It will be split across your{"\n"}dashboard card backgrounds
            </Text>
          </Pressable>
        )}
      </View>

      {/* ── Controls ─────────────────────────────────────────────── */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.controls, { paddingBottom: insets.bottom + 20 }]}
        keyboardShouldPersistTaps="handled"
      >
        {imageMeta && (
          <>
            {/* Zoom control */}
            <View style={[styles.controlCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
              <Text style={[styles.controlLabel, { color: theme.textSoft }]}>ZOOM</Text>
              <View style={styles.zoomRow}>
                <Pressable
                  onPress={() => setScale((s) => Math.max(0.3, parseFloat((s - 0.1).toFixed(2))))}
                  style={[styles.zoomBtn, { borderColor: theme.cardBorder, backgroundColor: theme.page }]}
                  hitSlop={8}
                >
                  <Ionicons name="remove" size={20} color={theme.textStrong} />
                </Pressable>
                <Text style={[styles.zoomValue, { color: theme.textStrong }]}>
                  {Math.round(scale * 100)}%
                </Text>
                <Pressable
                  onPress={() => setScale((s) => Math.min(3.0, parseFloat((s + 0.1).toFixed(2))))}
                  style={[styles.zoomBtn, { borderColor: theme.cardBorder, backgroundColor: theme.page }]}
                  hitSlop={8}
                >
                  <Ionicons name="add" size={20} color={theme.textStrong} />
                </Pressable>
              </View>
            </View>

            {/* Card list preview */}
            <View style={[styles.controlCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
              <Text style={[styles.controlLabel, { color: theme.textSoft }]}>CARDS TO FILL</Text>
              {CARDS.map((card) => (
                <View key={card.id} style={styles.cardListRow}>
                  <View style={[styles.cardListDot, { backgroundColor: theme.teal.solid }]} />
                  <Text style={[styles.cardListLabel, { color: theme.textStrong }]}>{card.label}</Text>
                  <Text style={[styles.cardListPct, { color: theme.textSoft }]}>
                    {Math.round(card.hFraction * 100)}%
                  </Text>
                </View>
              ))}
            </View>

            {/* Action buttons */}
            <Pressable
              onPress={apply}
              disabled={saving}
              style={[styles.applyBtn, { backgroundColor: theme.teal.solid, borderColor: theme.ink }]}
            >
              <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
              <Text style={styles.applyBtnText}>{saving ? "Applying…" : "Apply to Dashboard"}</Text>
            </Pressable>
          </>
        )}

        {!imageMeta && (
          <Pressable
            onPress={pickImage}
            style={[styles.applyBtn, { backgroundColor: theme.teal.solid, borderColor: theme.ink }]}
          >
            <Ionicons name="folder-open-outline" size={18} color="#fff" />
            <Text style={styles.applyBtnText}>Pick Image from Files</Text>
          </Pressable>
        )}

        {(hasApplied || imageMeta) && (
          <Pressable
            onPress={() => {
              Alert.alert(
                "Clear backgrounds?",
                "This removes the split image from all dashboard cards.",
                [
                  { text: "Cancel", style: "cancel" },
                  { text: "Clear", style: "destructive", onPress: clear },
                ]
              );
            }}
            style={[styles.clearBtn, { borderColor: theme.cardBorder }]}
          >
            <Ionicons name="trash-outline" size={16} color={theme.textSoft} />
            <Text style={[styles.clearBtnText, { color: theme.textSoft }]}>Clear All Backgrounds</Text>
          </Pressable>
        )}

        <Text style={[styles.tip, { color: theme.textSoft }]}>
          Drag the image up or down to reframe. Each card shows the slice of the image
          that falls behind it in the grid above.
        </Text>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  preview: {
    overflow: "hidden",
    borderBottomWidth: 2,
    borderBottomColor: "#000",
  },
  pickPrompt: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  pickPromptText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 17,
    fontWeight: "700",
  },
  pickPromptSub: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
  },
  gridSlot: {
    borderWidth: 1.5,
    borderRadius: 14,
    justifyContent: "flex-end",
    paddingBottom: 4,
    paddingLeft: 8,
  },
  slotLabelBg: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  slotLabel: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 10,
    fontWeight: "700",
  },
  hintBadge: {
    position: "absolute",
    bottom: 10,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  hintText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 10,
    fontWeight: "600",
  },
  controls: {
    padding: 16,
    gap: 12,
  },
  controlCard: {
    borderRadius: 16,
    borderWidth: 2,
    padding: 14,
    gap: 10,
  },
  controlLabel: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  zoomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
  },
  zoomBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  zoomValue: {
    fontSize: 22,
    fontWeight: "900",
    width: 70,
    textAlign: "center",
    letterSpacing: -0.5,
  },
  cardListRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cardListDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  cardListLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
  },
  cardListPct: {
    fontSize: 12,
    fontWeight: "600",
  },
  applyBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 2.5,
    borderRadius: 16,
    paddingVertical: 13,
  },
  applyBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "800",
  },
  clearBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 10,
  },
  clearBtnText: {
    fontSize: 13,
    fontWeight: "600",
  },
  tip: {
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center",
    marginTop: 4,
  },
});
