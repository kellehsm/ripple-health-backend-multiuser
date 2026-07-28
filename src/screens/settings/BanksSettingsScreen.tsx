import React, { useState, useCallback } from "react";
import { ScrollView, View, Text, Pressable, StyleSheet, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useTheme } from "../../theme/ThemeContext";
import { api } from "../../api/client";
import { usePlaidLink } from "../../lib/plaidLink";
import { LoadingIndicator } from "../../components/LoadingIndicator";
import { EmptyState } from "../../components/EmptyState";
import { toast } from "../../lib/toast";

type PlaidItem = {
  item_id: string;
  institution_name: string | null;
  institution_id: string | null;
  last_synced_at: string | null;
  connected_at: string;
};

function formatDate(iso: string | null): string {
  if (!iso) return "never";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function BanksSettingsScreen() {
  const { theme } = useTheme();
  const ink = theme.ink;

  const [items, setItems] = useState<PlaidItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await api.plaidGetItems();
      setItems(Array.isArray(data) ? data : []);
    } catch {
      toast("Couldn't load banks.", "error");
    } finally {
      setLoading(false);
    }
  }

  useFocusEffect(useCallback(() => { load(); }, []));

  const { openLink, state: linkState } = usePlaidLink(() => {
    load();
    toast("Bank connected. Transactions imported.");
  });

  async function handleSync() {
    setSyncing(true);
    try {
      const result = await api.plaidSync();
      toast(`Synced — ${result.total_added ?? 0} new transactions.`);
      await load();
    } catch {
      toast("Sync failed.", "error");
    } finally {
      setSyncing(false);
    }
  }

  function confirmDisconnect(item: PlaidItem) {
    Alert.alert(
      "Disconnect bank?",
      `Remove ${item.institution_name ?? "this bank"}? Imported transactions will not be deleted.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disconnect", style: "destructive",
          onPress: async () => {
            try {
              await api.plaidDeleteItem(item.item_id);
              await load();
              toast("Disconnected.");
            } catch {
              toast("Couldn't disconnect.", "error");
            }
          },
        },
      ]
    );
  }

  const shadow = {
    shadowColor: "rgba(60,40,20,0.1)",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12 as const,
    shadowRadius: 14,
    elevation: 4,
  };

  return (
    <ScrollView style={{ backgroundColor: theme.page }} contentContainerStyle={s.content}>

      {/* Connect button */}
      <Pressable
        onPress={openLink}
        disabled={linkState === "loading" || linkState === "linking" || linkState === "syncing"}
        style={[s.connectBtn, { backgroundColor: theme.purple.solid, borderColor: ink, ...shadow, opacity: linkState !== "idle" && linkState !== "done" && linkState !== "error" ? 0.6 : 1 }]}
      >
        {linkState === "loading" || linkState === "syncing" ? (
          <LoadingIndicator size="small" color="#fff" />
        ) : (
          <>
            <Ionicons name="add-circle-outline" size={18} color="#fff" />
            <Text style={s.connectBtnText}>Connect a bank</Text>
          </>
        )}
      </Pressable>

      {linkState === "error" && (
        <Text style={[s.errorText, { color: "#E8654E" }]}>Couldn't connect — try again.</Text>
      )}

      {/* Connected institutions */}
      {loading ? (
        <View style={{ paddingVertical: 32, alignItems: "center" }}>
          <LoadingIndicator size="large" color={theme.purple.solid} />
        </View>
      ) : items.length === 0 ? (
        <EmptyState
          emoji="🏦"
          title="No banks connected"
          message="Connect a bank to automatically import transactions into your Finance tab."
        />
      ) : (
        <>
          <Text style={[s.sectionLabel, { color: theme.textSoft }]}>CONNECTED BANKS</Text>
          <View style={[s.card, { borderColor: theme.cardBorder, backgroundColor: theme.card, ...shadow }]}>
            {items.map((item, i) => (
              <View
                key={item.item_id}
                style={[s.row, i < items.length - 1 && { borderBottomWidth: 1, borderBottomColor: ink + "18" }]}
              >
                <View style={[s.bankIcon, { backgroundColor: theme.purple.tint, borderColor: ink }]}>
                  <Ionicons name="business-outline" size={18} color={theme.purple.solid} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.bankName, { color: theme.textStrong }]}>
                    {item.institution_name ?? "Bank account"}
                  </Text>
                  <Text style={[s.bankMeta, { color: theme.textSoft }]}>
                    Last synced {formatDate(item.last_synced_at)}
                  </Text>
                </View>
                <Pressable
                  onPress={() => confirmDisconnect(item)}
                  style={[s.disconnectBtn, { borderColor: ink + "55" }]}
                  accessibilityRole="button"
                  accessibilityLabel="Disconnect bank"
                >
                  <Text style={[s.disconnectText, { color: "#E8654E" }]}>Remove</Text>
                </Pressable>
              </View>
            ))}
          </View>

          {/* Manual sync button */}
          <Pressable
            onPress={handleSync}
            disabled={syncing}
            style={[s.syncBtn, { borderColor: ink, backgroundColor: theme.card, ...shadow, opacity: syncing ? 0.6 : 1 }]}
          >
            {syncing
              ? <LoadingIndicator size="small" color={theme.purple.solid} />
              : (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Ionicons name="refresh-outline" size={16} color={theme.purple.solid} />
                  <Text style={[s.syncBtnText, { color: theme.purple.solid }]}>Sync now</Text>
                </View>
              )}
          </Pressable>
        </>
      )}

      <Text style={[s.disclaimer, { color: theme.textSoft }]}>
        Bank connections are powered by Plaid. Ripple never stores your bank credentials.
      </Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  sectionLabel: { fontSize: 9, fontWeight: "900", letterSpacing: 0.6, marginTop: 4, marginBottom: -4 },
  connectBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, borderRadius: 22, borderWidth: 2, paddingVertical: 14,
  },
  connectBtnText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  errorText: { fontSize: 13, textAlign: "center", marginTop: -4 },
  card: { borderRadius: 22, borderWidth: 2, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  bankIcon: {
    width: 36, height: 36, borderRadius: 10, borderWidth: 1.5,
    alignItems: "center", justifyContent: "center",
  },
  bankName: { fontSize: 15, fontWeight: "700" },
  bankMeta: { fontSize: 11, marginTop: 1 },
  disconnectBtn: { borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  disconnectText: { fontSize: 13, fontWeight: "700" },
  syncBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    borderRadius: 22, borderWidth: 2, paddingVertical: 12,
  },
  syncBtnText: { fontSize: 15, fontWeight: "700" },
  disclaimer: { fontSize: 11, textAlign: "center", lineHeight: 16, marginTop: 4 },
});
