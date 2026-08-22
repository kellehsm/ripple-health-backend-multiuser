/**
 * FoodReportModal — slide-up sheet showing glucose-spike rankings for today's foods.
 */
import React from "react";
import { View, Text, Pressable, Modal, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export type FoodReportItem = {
  meal_name: string;
  avg_spike: number;
  sample_count: number;
};

export type FoodReportModalProps = {
  theme: any;
  visible: boolean;
  foodReport: FoodReportItem[];
  cardTitleStyle: any;
  sectionLabelStyle: any;
  onClose: () => void;
};

export function FoodReportModal({ theme, visible, foodReport, cardTitleStyle, sectionLabelStyle, onClose }: FoodReportModalProps) {
  const sorted = [...foodReport].sort((a, b) => b.avg_spike - a.avg_spike);
  const spiky = sorted.slice(0, 5);
  const stable = [...foodReport].sort((a, b) => a.avg_spike - b.avg_spike).slice(0, 5).filter(s => s.avg_spike <= 30);
  const maxSpike = spiky[0]?.avg_spike ?? 1;

  return (
    <Modal
      visible={visible && foodReport.length >= 3}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)" }} onPress={onClose}>
        <Pressable
          style={{ marginTop: "auto", backgroundColor: theme.card, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, maxHeight: "80%" }}
          onPress={() => {}}
        >
          <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <Ionicons name="analytics-outline" size={18} color={theme.berry.solid} />
              <Text style={[cardTitleStyle, { color: theme.textStrong, marginBottom: 0, flex: 1 }]} allowFontScaling maxFontSizeMultiplier={1.4} accessibilityRole="header">Food Report</Text>
              <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close food report">
                <Ionicons name="close" size={20} color={theme.textSoft} />
              </Pressable>
            </View>

            <Text style={[sectionLabelStyle, { color: theme.coral.sub, marginBottom: 8 }]}>SPIKES GLUCOSE MOST</Text>
            <View style={{ gap: 8, marginBottom: 16 }}>
              {spiky.map(function (item, i) {
                const barW = Math.max(6, Math.round((item.avg_spike / maxSpike) * 100));
                const isHigh = item.avg_spike > 50;
                const barColor = isHigh ? theme.coral.solid : item.avg_spike > 25 ? theme.amber?.solid ?? "#f59e0b" : theme.teal.solid;
                return (
                  <View key={item.meal_name} style={{ gap: 4 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}>
                        <Text style={{ color: theme.textSoft, fontSize: 10, fontWeight: "800", width: 14 }}>{i + 1}</Text>
                        <Text style={{ color: theme.textStrong, fontSize: 13, fontWeight: "700", flex: 1 }} numberOfLines={1}>{item.meal_name}</Text>
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        <Text style={{ color: barColor, fontSize: 13, fontWeight: "900" }}>+{item.avg_spike}</Text>
                        <Text style={{ color: theme.textSoft, fontSize: 10 }}>mg/dL</Text>
                        <Text style={{ color: theme.textSoft, fontSize: 10, marginLeft: 4 }}>×{item.sample_count}</Text>
                      </View>
                    </View>
                    <View style={{ height: 5, backgroundColor: theme.cardBorder, borderRadius: 3, overflow: "hidden" }}>
                      <View style={{ height: 5, width: (`${barW}%` as `${number}%`), backgroundColor: barColor, borderRadius: 3 }} />
                    </View>
                  </View>
                );
              })}
            </View>

            {stable.length > 0 && (
              <>
                <Text style={[sectionLabelStyle, { color: theme.teal.sub, marginBottom: 8 }]}>STAYS STABLE</Text>
                <View style={{ gap: 6 }}>
                  {stable.map(function (item) {
                    return (
                      <View key={item.meal_name} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Ionicons name="checkmark-circle" size={14} color={theme.teal.solid} />
                        <Text style={{ color: theme.textStrong, fontSize: 13, fontWeight: "700", flex: 1 }} numberOfLines={1}>{item.meal_name}</Text>
                        <Text style={{ color: theme.teal.solid, fontSize: 12, fontWeight: "800" }}>+{item.avg_spike}</Text>
                        <Text style={{ color: theme.textSoft, fontSize: 10 }}>mg/dL</Text>
                        <Text style={{ color: theme.textSoft, fontSize: 10, marginLeft: 2 }}>×{item.sample_count}</Text>
                      </View>
                    );
                  })}
                </View>
              </>
            )}

            <Text style={{ color: theme.textSoft, fontSize: 11, marginTop: 14, lineHeight: 16 }}>
              Average glucose rise 45–105 min after eating. Based on {foodReport.length} foods across your history.
            </Text>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
