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

export type SectionDef = {
  id: string;
  label: string;
  description?: string;
};

type Props = {
  visible: boolean;
  title: string;
  sections: SectionDef[];
  hidden: string[];
  onSave: (hidden: string[]) => void;
  onCancel: () => void;
};

export function SectionEditorModal({
  visible,
  title,
  sections,
  hidden,
  onSave,
  onCancel,
}: Props) {
  const { theme } = useTheme();
  const ink = theme.ink;

  const [localHidden, setLocalHidden] = useState<string[]>(hidden);

  useEffect(() => {
    if (visible) setLocalHidden(hidden);
  }, [visible, hidden]);

  function toggle(id: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLocalHidden(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  function handleReset() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setLocalHidden([]);
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onCancel}
    >
      <View style={{ flex: 1, backgroundColor: theme.page }}>
        <View style={[styles.header, { borderBottomColor: theme.cardBorder }]}>
          <Pressable onPress={onCancel} hitSlop={8} style={{ marginRight: 12 }}>
            <Ionicons name="close" size={22} color={ink} />
          </Pressable>
          <Text style={[styles.title, { color: theme.textStrong, flex: 1 }]}>
            {title}
          </Text>
          <Pressable onPress={handleReset} hitSlop={8} style={{ marginRight: 16 }}>
            <Text style={{ fontSize: 13, color: theme.teal.solid, fontWeight: "700" }}>
              Show all
            </Text>
          </Pressable>
          <Pressable
            onPress={() => onSave(localHidden)}
            style={[styles.doneBtn, { backgroundColor: ink }]}
          >
            <Text style={[styles.doneBtnText, { color: theme.page }]}>Done</Text>
          </Pressable>
        </View>

        <Text style={[styles.hint, { color: theme.textSoft }]}>
          Hide sections you don't use to keep this screen focused.
        </Text>

        <FlatList
          data={sections}
          keyExtractor={s => s.id}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          renderItem={({ item }) => {
            const isHidden = localHidden.includes(item.id);
            return (
              <Pressable
                onPress={() => toggle(item.id)}
                style={[
                  styles.row,
                  {
                    backgroundColor: theme.card,
                    borderColor: isHidden ? theme.cardBorder : ink,
                    opacity: isHidden ? 0.5 : 1,
                  },
                ]}
                accessibilityRole="switch"
                accessibilityState={{ checked: !isHidden }}
                accessibilityLabel={item.label}
              >
                <Ionicons
                  name={isHidden ? "eye-off-outline" : "eye-outline"}
                  size={21}
                  color={isHidden ? theme.textSoft : ink}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.label, { color: theme.textStrong }]}>
                    {item.label}
                  </Text>
                  {item.description ? (
                    <Text
                      style={[styles.desc, { color: theme.textSoft }]}
                      numberOfLines={1}
                    >
                      {item.description}
                    </Text>
                  ) : null}
                </View>
                <View
                  style={[
                    styles.pill,
                    {
                      backgroundColor: isHidden ? theme.cardBorder : ink,
                    },
                  ]}
                >
                  <Text style={[styles.pillText, { color: isHidden ? theme.textSoft : theme.page }]}>
                    {isHidden ? "Hidden" : "Shown"}
                  </Text>
                </View>
              </Pressable>
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
  doneBtn: { borderRadius: 16, paddingHorizontal: 18, paddingVertical: 8 },
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
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  label: { fontSize: 14, fontWeight: "700" },
  desc: { fontSize: 11, marginTop: 2 },
  pill: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  pillText: { fontSize: 11, fontWeight: "700" },
});
