import React, { useState, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  FlatList,
  StyleSheet,
} from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import {
  DASHBOARD_CARDS,
  type CardId,
  type DashboardLayout,
} from "../constants/dashboardCards";

type Props = {
  visible: boolean;
  layout: DashboardLayout;
  onSave: (layout: DashboardLayout) => void;
  onCancel: () => void;
};

export function DashboardEditorModal({ visible, layout, onSave, onCancel }: Props) {
  const { theme } = useTheme();
  const ink = theme.ink;

  const [order, setOrder] = useState<CardId[]>(layout.order);
  const [hidden, setHidden] = useState<CardId[]>(layout.hidden);

  useEffect(() => {
    if (visible) {
      setOrder(layout.order);
      setHidden(layout.hidden);
    }
  }, [visible, layout]);

  function moveUp(id: CardId) {
    const i = order.indexOf(id);
    if (i <= 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = [...order];
    [next[i - 1], next[i]] = [next[i], next[i - 1]];
    setOrder(next);
  }

  function moveDown(id: CardId) {
    const i = order.indexOf(id);
    if (i < 0 || i >= order.length - 1) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = [...order];
    [next[i], next[i + 1]] = [next[i + 1], next[i]];
    setOrder(next);
  }

  function toggleHidden(id: CardId) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setHidden(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  function handleReset() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setOrder(DASHBOARD_CARDS.map(c => c.id));
    setHidden([]);
  }

  function handleSave() {
    onSave({ order, hidden });
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onCancel}
    >
      <View style={{ flex: 1, backgroundColor: theme.page }}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: theme.cardBorder }]}>
          <Pressable onPress={onCancel} hitSlop={8} style={{ marginRight: 12 }}>
            <Ionicons name="close" size={22} color={ink} />
          </Pressable>
          <Text style={[styles.title, { color: theme.textStrong, flex: 1 }]}>
            Edit Dashboard
          </Text>
          <Pressable onPress={handleReset} style={{ marginRight: 16 }} hitSlop={8}>
            <Text style={{ fontSize: 13, color: theme.teal.solid, fontWeight: "700" }}>
              Reset
            </Text>
          </Pressable>
          <Pressable
            onPress={handleSave}
            style={[styles.doneBtn, { backgroundColor: ink }]}
          >
            <Text style={[styles.doneBtnText, { color: theme.page }]}>Done</Text>
          </Pressable>
        </View>

        <Text style={[styles.hint, { color: theme.textSoft }]}>
          Reorder or hide sections to customize your home screen.
        </Text>

        <FlatList
          data={order}
          keyExtractor={id => id}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          renderItem={({ item: id, index }) => {
            const card = DASHBOARD_CARDS.find(c => c.id === id)!;
            const isHidden = hidden.includes(id);
            return (
              <View
                style={[
                  styles.row,
                  {
                    backgroundColor: theme.card,
                    borderColor: isHidden ? theme.cardBorder : ink,
                    opacity: isHidden ? 0.5 : 1,
                  },
                ]}
              >
                {/* Eye toggle */}
                <Pressable
                  onPress={() => toggleHidden(id)}
                  hitSlop={10}
                  accessibilityLabel={isHidden ? "Show " + card.label : "Hide " + card.label}
                  accessibilityRole="button"
                >
                  <Ionicons
                    name={isHidden ? "eye-off-outline" : "eye-outline"}
                    size={21}
                    color={isHidden ? theme.textSoft : ink}
                  />
                </Pressable>

                {/* Label */}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardLabel, { color: theme.textStrong }]}>
                    {card.label}
                  </Text>
                  <Text style={[styles.cardDesc, { color: theme.textSoft }]} numberOfLines={1}>
                    {card.description}
                  </Text>
                </View>

                {/* Up / Down */}
                <View style={styles.arrowCol}>
                  <Pressable
                    onPress={() => moveUp(id)}
                    disabled={index === 0}
                    hitSlop={6}
                    style={{ opacity: index === 0 ? 0.2 : 1 }}
                    accessibilityLabel={"Move " + card.label + " up"}
                    accessibilityRole="button"
                  >
                    <Ionicons name="chevron-up" size={22} color={ink} />
                  </Pressable>
                  <Pressable
                    onPress={() => moveDown(id)}
                    disabled={index === order.length - 1}
                    hitSlop={6}
                    style={{ opacity: index === order.length - 1 ? 0.2 : 1 }}
                    accessibilityLabel={"Move " + card.label + " down"}
                    accessibilityRole="button"
                  >
                    <Ionicons name="chevron-down" size={22} color={ink} />
                  </Pressable>
                </View>
              </View>
            );
          }}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    paddingTop: 20,
    borderBottomWidth: 2,
  },
  title: { fontSize: 17, fontWeight: "800" },
  doneBtn: {
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  doneBtnText: { fontSize: 13, fontWeight: "800" },
  hint: {
    fontSize: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 2,
  },
  row: {
    borderRadius: 16,
    borderWidth: 2,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  cardLabel: { fontSize: 14, fontWeight: "700" },
  cardDesc: { fontSize: 11, marginTop: 2 },
  arrowCol: { flexDirection: "column", alignItems: "center", gap: 0 },
});
