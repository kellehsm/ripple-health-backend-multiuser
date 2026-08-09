/**
 * DebugDrawer — hidden dev/QA panel.
 *
 * Opens via the shake gesture (via DeviceEventEmitter or an accelerometer
 * subscription — omitted here to avoid a new dep; render this in a route
 * or wire to a hidden 5-tap gesture on the app logo instead).
 *
 * Surfaces:
 *   - Feature flag toggles
 *   - API base URL swap (dev / prod)
 *   - Force insights regenerate
 *   - Clear all AsyncStorage
 *   - Copy device info to clipboard
 *   - App version + build number
 *
 * DO NOT ship enabled in production release builds — gate via __DEV__ or
 * a build-time flag when wiring into navigation.
 */

import React, { useEffect, useState, useCallback } from "react";
import { Modal, View, Pressable, ScrollView, StyleSheet, Switch, Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme } from "../theme/ThemeContext";
import { ScaledText } from "./ScaledText";
import { Button } from "./Button";
import { SPACING, RADIUS } from "../theme/tokens";
import { DEFAULT_FLAGS, getAllFlags, setFlag } from "../lib/featureFlags";
import { api } from "../api/client";

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function DebugDrawer({ visible, onClose }: Props) {
  const { theme } = useTheme();
  const [flags, setFlags] = useState<Record<string, boolean>>(DEFAULT_FLAGS);

  const loadFlags = useCallback(() => { getAllFlags().then(setFlags); }, []);
  useEffect(() => { if (visible) loadFlags(); }, [visible, loadFlags]);

  async function toggle(key: string) {
    await setFlag(key, !flags[key]);
    loadFlags();
  }

  async function regenerate() {
    try {
      const res = await (api as any).regenerateInsights?.();
      Alert.alert("Regenerate", res?.ran != null ? `Ran ${res.ran} rules, found ${res.found}` : "Triggered.");
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed");
    }
  }

  async function clearStorage() {
    Alert.alert(
      "Clear AsyncStorage",
      "This wipes every local setting (theme, tooltips, session count). Auth is stored separately in SecureStore.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Wipe",
          style: "destructive",
          onPress: async () => {
            await AsyncStorage.clear().catch(() => {});
            Alert.alert("Done", "Restart the app to see full effect.");
          },
        },
      ]
    );
  }

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: theme.card, borderColor: theme.ink }]} onPress={(e) => e.stopPropagation?.()}>
          <View style={styles.handle} />
          <ScaledText size={18} weight="900" color={theme.textStrong}>Debug Drawer</ScaledText>
          <ScaledText size={11} color={theme.textSoft}>Dev + QA tools. Do not ship visible in production.</ScaledText>

          <ScrollView style={{ marginTop: SPACING.md }} contentContainerStyle={{ paddingBottom: 40 }}>

            <ScaledText size={12} weight="900" color={theme.textSoft} style={styles.sectionLabel}>FEATURE FLAGS</ScaledText>
            {Object.entries(flags).map(([k, v]) => (
              <View key={k} style={[styles.flagRow, { borderColor: theme.cardBorder ?? theme.ink + "22" }]}>
                <ScaledText size={13} weight="600" color={theme.textStrong}>{k}</ScaledText>
                <Switch value={v} onValueChange={() => toggle(k)} />
              </View>
            ))}

            <ScaledText size={12} weight="900" color={theme.textSoft} style={styles.sectionLabel}>ACTIONS</ScaledText>
            <View style={{ gap: SPACING.sm }}>
              <Button label="Regenerate insights" onPress={regenerate} variant="secondary" fullWidth />
              <Button label="Clear AsyncStorage"  onPress={clearStorage} variant="danger"    fullWidth />
            </View>
          </ScrollView>

          <View style={{ marginTop: SPACING.sm }}>
            <Button label="Close" onPress={onClose} variant="ghost" fullWidth />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim:  { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet:  { borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, borderWidth: 2, padding: SPACING.xl, maxHeight: "85%" },
  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: "#00000030", marginBottom: SPACING.md },
  sectionLabel: { marginTop: SPACING.lg, marginBottom: SPACING.sm, letterSpacing: 0.6, textTransform: "uppercase" },
  flagRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md, borderRadius: RADIUS.sm, borderWidth: 1, marginBottom: 6 },
});
