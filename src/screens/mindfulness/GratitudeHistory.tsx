import React, { useCallback, useState } from "react";
import { View, Text, Pressable, LayoutAnimation, Platform, UIManager } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api } from "../../api/client";
import { sharedStyles } from "./shared";

type JournalEntry = { id: string; entry_text: string; logged_at: string };

function localDayString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function entryStreak(entries: JournalEntry[]): number {
  const daySet = new Set(entries.map((e) => localDayString(new Date(e.logged_at))));
  let streak = 0;
  const cur = new Date();
  // Streak may start today or yesterday
  if (!daySet.has(localDayString(cur))) cur.setDate(cur.getDate() - 1);
  while (daySet.has(localDayString(cur))) {
    streak += 1;
    cur.setDate(cur.getDate() - 1);
  }
  return streak;
}

function findFlashback(entries: JournalEntry[]): JournalEntry | null {
  // An entry from roughly a month ago (25–36 days old)
  const now = Date.now();
  for (const e of entries) {
    const ageDays = (now - new Date(e.logged_at).getTime()) / 86400000;
    if (ageDays >= 25 && ageDays <= 36) return e;
  }
  return null;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function GratitudeHistory({ theme, ink, refreshKey }: { theme: any; ink: string; refreshKey: number }) {
  const [entries, setEntries] = useState<JournalEntry[] | null>(null);
  const [expanded, setExpanded] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      api.mindfulnessJournal()
        .then((rows: JournalEntry[]) => {
          if (cancelled) return;
          setEntries((prev) => {
            if (prev !== null && rows.length !== prev.length) {
              if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
                UIManager.setLayoutAnimationEnabledExperimental(true);
              }
              LayoutAnimation.configureNext(LayoutAnimation.create(220, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity));
            }
            return rows;
          });
        })
        .catch(() => { if (!cancelled) setEntries([]); });
      return () => { cancelled = true; };
    }, [refreshKey])
  );

  const berry = (theme.berry as any) ?? {};

  if (!entries || entries.length === 0) {
    return (
      <View style={{
        marginTop: 8,
        borderRadius: 16,
        borderWidth: 1.5,
        borderColor: berry.sub ?? theme.cardBorder ?? ink,
        backgroundColor: berry.tint ?? theme.card,
        padding: 14,
        alignItems: "center",
      }}>
        <Text style={{ fontSize: 22, marginBottom: 4 }}>💌</Text>
        <Text style={{ color: berry.fg ?? theme.textStrong, fontSize: 13, fontWeight: "800" }}>
          Nothing to look back on yet
        </Text>
        <Text style={{ color: berry.sub ?? theme.textSoft, fontSize: 11, marginTop: 4, textAlign: "center" }}>
          Write your first entry above — flashbacks appear once you've been at it a month.
        </Text>
      </View>
    );
  }
  const streak = entryStreak(entries);
  const flashback = findFlashback(entries);
  const shown = expanded ? entries.slice(0, 30) : entries.slice(0, 3);

  return (
    <View style={{ gap: 12, marginTop: 8 }}>
      {streak >= 2 && (
        <Text style={{ color: berry.fg ?? theme.textStrong, fontSize: 13, fontWeight: "800", textAlign: "center" }}>
          🔥 {streak}-day gratitude streak
        </Text>
      )}

      {flashback && (
        <View style={[sharedStyles.card, { backgroundColor: berry.tint ?? theme.card, borderColor: berry.solid ?? ink }]}>
          <Text style={{ color: berry.sub ?? theme.textSoft, fontSize: 9, fontWeight: "900", letterSpacing: 0.6, marginBottom: 6 }}>
            💌 THIS TIME LAST MONTH, YOU WROTE
          </Text>
          <Text style={{ color: berry.fg ?? theme.textStrong, fontSize: 14, lineHeight: 20, fontStyle: "italic" }}>
            “{flashback.entry_text}”
          </Text>
          <Text style={{ color: berry.sub ?? theme.textSoft, fontSize: 11, marginTop: 6, textAlign: "right" }}>
            {fmtDate(flashback.logged_at)}
          </Text>
        </View>
      )}

      <Text style={{ color: theme.textSoft, fontSize: 11, fontWeight: "800", letterSpacing: 0.6 }}>
        PAST ENTRIES ({entries.length})
      </Text>
      {shown.map((e) => (
        <View key={e.id} style={{
          borderRadius: 16, borderWidth: 1.5, borderColor: theme.cardBorder ?? ink,
          backgroundColor: theme.card, padding: 12,
        }}>
          <Text style={{ color: theme.textStrong, fontSize: 13, lineHeight: 19 }} numberOfLines={expanded ? undefined : 2}>
            {e.entry_text}
          </Text>
          <Text style={{ color: theme.textSoft, fontSize: 10, marginTop: 4 }}>{fmtDate(e.logged_at)}</Text>
        </View>
      ))}
      {entries.length > 3 && (
        <Pressable
          onPress={() => {
            LayoutAnimation.configureNext(LayoutAnimation.create(220, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity));
            setExpanded(!expanded);
          }}
          style={{ alignItems: "center", paddingVertical: 6 }}
          accessibilityRole="button"
        >
          <Text style={{ color: berry.solid ?? ink, fontSize: 13, fontWeight: "800" }}>
            {expanded ? "Show less ↑" : `Show all ↓`}
          </Text>
        </Pressable>
      )}
    </View>
  );
}
