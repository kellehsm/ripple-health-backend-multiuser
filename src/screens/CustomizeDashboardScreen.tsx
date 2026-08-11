import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View, Text, Pressable, ScrollView, StyleSheet, Switch
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { api } from "../api/client";
import { toast, Msg } from "../lib/toast";
import { DASHBOARD_CARDS, DEFAULT_CARD_ORDER, resolveLayout, type CardId, type DashboardLayout } from "../constants/dashboardCards";
import { LoadingIndicator } from "../components/LoadingIndicator";

export function CustomizeDashboardScreen() {
  const { theme } = useTheme();
  const ink = theme.ink;
  const card = theme.card;
  const [layout, setLayout] = useState<DashboardLayout>({ order: [...DEFAULT_CARD_ORDER], hidden: [] });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(function () {
    api.getSettings()
      .then(function (s: any) {
        setLayout(resolveLayout(s?.dashboard_layout));
      })
      .catch(function () {})
      .finally(function () { setLoading(false); });
  }, []);

  // Serialized saves: rapid taps update `pendingLayoutRef`; only one PATCH is
  // in flight at a time, and the final desired state is always sent last.
  const pendingLayoutRef = useRef<DashboardLayout | null>(null);
  const inFlightRef = useRef(false);

  const save = useCallback(function (next: DashboardLayout) {
    pendingLayoutRef.current = next;
    if (inFlightRef.current) return; // current flush loop will pick this up
    inFlightRef.current = true;
    setSaving(true);
    (async function flush() {
      try {
        while (pendingLayoutRef.current) {
          const toSend = pendingLayoutRef.current;
          pendingLayoutRef.current = null;
          try {
            await api.patchSettings({ dashboard_layout: toSend });
          } catch {
            toast(Msg.saveSettings, "error");
          }
        }
      } finally {
        inFlightRef.current = false;
        setSaving(false);
      }
    })();
  }, []);

  function moveUp(index: number) {
    if (index === 0) return;
    const next = { ...layout, order: [...layout.order] };
    [next.order[index - 1], next.order[index]] = [next.order[index], next.order[index - 1]];
    setLayout(next);
    save(next);
  }

  function moveDown(index: number) {
    if (index === layout.order.length - 1) return;
    const next = { ...layout, order: [...layout.order] };
    [next.order[index], next.order[index + 1]] = [next.order[index + 1], next.order[index]];
    setLayout(next);
    save(next);
  }

  function toggleHidden(id: CardId) {
    const isHidden = layout.hidden.includes(id);
    const hidden = isHidden
      ? layout.hidden.filter(h => h !== id)
      : [...layout.hidden, id];
    const next = { ...layout, hidden };
    setLayout(next);
    save(next);
  }

  function resetToDefault() {
    const next: DashboardLayout = { order: [...DEFAULT_CARD_ORDER], hidden: [] };
    setLayout(next);
    save(next);
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.page, alignItems: "center", justifyContent: "center" }}>
        <LoadingIndicator size="large" />
      </View>
    );
  }

  const cardMeta: Record<CardId, { label: string; description: string }> = Object.fromEntries(
    DASHBOARD_CARDS.map(c => [c.id, { label: c.label, description: c.description }])
  ) as any;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.page }} contentContainerStyle={styles.content}>
      <Text style={[styles.hint, { color: theme.textSoft }]}>
        Reorder and hide cards on your Home screen. Changes save instantly.
      </Text>

      {layout.order.map(function (id, index) {
        const meta = cardMeta[id];
        if (!meta) return null;
        const isHidden = layout.hidden.includes(id);
        return (
          <View
            key={id}
            style={[
              styles.row,
              { borderColor: ink, backgroundColor: isHidden ? card : theme.teal.tint, opacity: isHidden ? 0.6 : 1 },
            ]}
          >
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={[styles.label, { color: theme.textStrong }]}>{meta.label}</Text>
              <Text style={[styles.desc, { color: theme.textSoft }]} numberOfLines={2}>{meta.description}</Text>
            </View>
            <View style={styles.controls}>
              <Pressable
                onPress={function () { moveUp(index); }}
                disabled={index === 0}
                style={[styles.arrowBtn, { borderColor: ink, backgroundColor: card, opacity: index === 0 ? 0.3 : 1 }]}
                hitSlop={6}
              >
                <Ionicons name="chevron-up" size={16} color={ink} />
              </Pressable>
              <Pressable
                onPress={function () { moveDown(index); }}
                disabled={index === layout.order.length - 1}
                style={[styles.arrowBtn, { borderColor: ink, backgroundColor: card, opacity: index === layout.order.length - 1 ? 0.3 : 1 }]}
                hitSlop={6}
              >
                <Ionicons name="chevron-down" size={16} color={ink} />
              </Pressable>
              <Switch
                value={!isHidden}
                onValueChange={function () { toggleHidden(id); }}
                trackColor={{ false: theme.cardBorder, true: theme.teal.solid }}
                thumbColor={card}
                style={{ marginLeft: 6 }}
              />
            </View>
          </View>
        );
      })}

      <Pressable
        onPress={resetToDefault}
        style={[styles.resetBtn, { borderColor: ink, backgroundColor: card }]}
      >
        <Ionicons name="refresh-outline" size={15} color={ink} style={{ marginRight: 6 }} />
        <Text style={[styles.resetText, { color: ink }]}>Reset to default order</Text>
      </Pressable>

      {saving ? (
        <Text style={{ color: theme.textSoft, fontSize: 11, textAlign: "center", marginTop: 8 }}>Saving…</Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 10 },
  hint: { fontSize: 12, lineHeight: 17, marginBottom: 4 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 2,
    borderRadius: 22,
    padding: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  label: { fontSize: 14, fontWeight: "900", marginBottom: 2 },
  desc: { fontSize: 11, lineHeight: 15 },
  controls: { flexDirection: "row", alignItems: "center", gap: 4 },
  arrowBtn: {
    width: 30,
    height: 30,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  resetBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderRadius: 22,
    padding: 12,
    marginTop: 4,
  },
  resetText: { fontSize: 13, fontWeight: "700" },
});
