/**
 * "What's New" modal — shows once per app-version-bump on first launch.
 *
 * Reads the app version from Constants and compares against the last-seen
 * version in AsyncStorage. If they differ, present the current release's
 * changelog card.
 *
 * Content lives in `CHANGELOG_ENTRIES` — add new entries at the top.
 */

import React, { useEffect, useState } from "react";
import { View, Modal, StyleSheet, Pressable, ScrollView } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme } from "../theme/ThemeContext";
import { ScaledText } from "./ScaledText";
import { Button } from "./Button";
import { SPACING, RADIUS } from "../theme/tokens";
import { ELEVATION } from "../theme/elevation";

const KEY = "ripple_last_seen_version";

interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  highlights: string[];
}

// Newest first.
export const CHANGELOG_ENTRIES: ChangelogEntry[] = [
  {
    version: "0.5.0",
    date: "2026-08-09",
    title: "The insight engine got a big brain",
    highlights: [
      "17 new pattern types — anomaly detection, weekly rhythms, dose-response, and more",
      "Real statistical significance testing (Welch's t-test + FDR correction)",
      "Personalized cold-start priors so early insights don't wait 3 weeks",
      "Sparklines and pin-your-favorite on every insight card",
    ],
  },
];

interface Props {
  currentVersion: string;
}

export function WhatsNewModal({ currentVersion }: Props) {
  const { theme } = useTheme();
  const [entry, setEntry] = useState<ChangelogEntry | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((seen) => {
      if (seen === currentVersion) return;
      const match = CHANGELOG_ENTRIES.find((e) => e.version === currentVersion) ?? CHANGELOG_ENTRIES[0];
      if (match) setEntry(match);
    }).catch(() => {});
  }, [currentVersion]);

  function close() {
    setEntry(null);
    AsyncStorage.setItem(KEY, currentVersion).catch(() => {});
  }

  if (!entry) return null;

  return (
    <Modal transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.scrim} onPress={close}>
        <Pressable style={[styles.card, { backgroundColor: theme.card, borderColor: theme.ink }, ELEVATION[4]]} onPress={(e) => e.stopPropagation?.()}>
          <ScaledText size={22} weight="900" color={theme.textStrong}>What's new</ScaledText>
          <ScaledText size={11} color={theme.textSoft} style={{ marginTop: 2 }}>Version {entry.version} · {entry.date}</ScaledText>

          <ScaledText size={16} weight="800" color={theme.textStrong} style={{ marginTop: SPACING.md }}>{entry.title}</ScaledText>

          <ScrollView style={{ marginTop: SPACING.sm, maxHeight: 260 }}>
            {entry.highlights.map((h, i) => (
              <View key={i} style={styles.row}>
                <ScaledText size={14} color={theme.primary}>•</ScaledText>
                <ScaledText size={13} color={theme.textStrong} style={{ flex: 1, marginLeft: 8 }}>{h}</ScaledText>
              </View>
            ))}
          </ScrollView>

          <View style={{ marginTop: SPACING.lg, alignItems: "flex-end" }}>
            <Button label="Got it" onPress={close} size="md" hapticFeedback="success" />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center", padding: SPACING.xl },
  card:  { width: "100%", maxWidth: 420, borderRadius: RADIUS.xl, borderWidth: 2, padding: SPACING.xl },
  row:   { flexDirection: "row", alignItems: "flex-start", marginBottom: 8 },
});
