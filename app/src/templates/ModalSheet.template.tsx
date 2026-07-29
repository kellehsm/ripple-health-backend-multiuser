/**
 * MODAL / BOTTOM SHEET TEMPLATE
 * Use for: ThemePickerModal, DashboardEditorModal, SectionEditorModal,
 *          MoodCheckInModal, RecipeBuilderModal, LongPressActionMenu,
 *          any overlay that slides up from the bottom
 *
 * Pattern: Modal with a drag handle at top → header row (title + close/cancel)
 * → scrollable content → sticky action footer. Use animationType="slide" for
 * bottom sheets and "fade" for centered dialogs.
 *
 * Full-screen variant (large content): set modalStyle height to 90%.
 * Action menu variant (few options): set height to "auto" with maxHeight.
 */

import React from "react";
import {
  Modal,
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { useCardBg } from "../theme/AppSettingsContext";
import { fonts } from "../theme/typography";

type Props = {
  visible: boolean;
  onClose: () => void;
  title?: string;
};

export function ModalSheetTemplate({ visible, onClose, title = "Sheet title" }: Props) {
  const { theme } = useTheme();
  const cardBg = useCardBg();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      {/* ── Scrim ── */}
      <Pressable style={[styles.scrim]} onPress={onClose} />

      {/* ── Sheet container ── */}
      <View style={[styles.sheet, { backgroundColor: cardBg }]}>
        {/* Drag handle */}
        <View style={[styles.handle, { backgroundColor: theme.cardBorder }]} />

        {/* Header */}
        <View style={[styles.header, { borderBottomColor: theme.cardBorder }]}>
          <Text style={[styles.headerTitle, { color: theme.textStrong }]}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={22} color={theme.textSoft} />
          </Pressable>
        </View>

        {/* Scrollable content */}
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Option rows (action menu style) ── */}
          {[
            { label: "Option one",  icon: "pencil-outline" as const,  colorKey: "teal"  as const },
            { label: "Option two",  icon: "share-outline"  as const,  colorKey: "blue"  as const },
            { label: "Delete item", icon: "trash-outline"  as const,  colorKey: "red"   as const },
          ].map((opt) => {
            const c = theme[opt.colorKey];
            return (
              <Pressable
                key={opt.label}
                style={({ pressed }) => [
                  styles.optionRow,
                  { borderBottomColor: theme.cardBorder, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <View style={[styles.optionIcon, { backgroundColor: c.bg }]}>
                  <Ionicons name={opt.icon} size={18} color={c.fg} />
                </View>
                <Text style={[styles.optionLabel, { color: opt.colorKey === "red" ? c.fg : theme.textStrong }]}>
                  {opt.label}
                </Text>
                <Ionicons name="chevron-forward" size={15} color={theme.textSoft} />
              </Pressable>
            );
          })}

          {/* ── Rich content (editor style) ── */}
          <View style={[styles.sectionCard, { backgroundColor: theme.surface, borderColor: theme.cardBorder }]}>
            <Text style={[styles.sectionLabel, { color: theme.textSoft }]}>Section</Text>
            <Text style={[styles.sectionBody, { color: theme.textStrong }]}>
              Rich form controls, pickers, or drag-reorder lists go here.
            </Text>
          </View>
        </ScrollView>

        {/* ── Sticky footer ── */}
        <View style={[styles.footer, { borderTopColor: theme.cardBorder }]}>
          <Pressable
            onPress={onClose}
            style={[styles.cancelBtn, { borderColor: theme.cardBorder }]}
          >
            <Text style={[styles.cancelBtnText, { color: theme.textSoft }]}>Cancel</Text>
          </Pressable>
          <Pressable style={[styles.confirmBtn, { backgroundColor: theme.teal.bar }]}>
            <Text style={styles.confirmBtnText}>Save</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: "90%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
    // Shadow on the sheet itself (iOS)
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 20,
  },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: "center", marginTop: 10, marginBottom: 4 },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
  },
  headerTitle: { fontSize: 17, fontWeight: "700", fontFamily: fonts.bold },

  content: { padding: 16, gap: 8, paddingBottom: 8 },

  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
  },
  optionIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  optionLabel: { flex: 1, fontSize: 15, fontFamily: fonts.regular },

  sectionCard: { borderRadius: 12, borderWidth: 0.5, padding: 14, gap: 4, marginTop: 8 },
  sectionLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5, fontFamily: fonts.bold },
  sectionBody: { fontSize: 14, fontFamily: fonts.regular },

  footer: {
    flexDirection: "row",
    gap: 10,
    padding: 16,
    borderTopWidth: 0.5,
  },
  cancelBtn: { flex: 1, borderWidth: 1.5, borderRadius: 12, paddingVertical: 13, alignItems: "center" },
  cancelBtnText: { fontSize: 15, fontWeight: "600", fontFamily: fonts.semiBold },
  confirmBtn: { flex: 2, borderRadius: 12, paddingVertical: 13, alignItems: "center" },
  confirmBtnText: { color: "#fff", fontSize: 15, fontWeight: "600", fontFamily: fonts.semiBold },
});
