import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  ScrollView,
  LayoutAnimation,
  Platform,
  UIManager,
} from "react-native";
import * as Haptics from "expo-haptics";
import { useFocusEffect } from "@react-navigation/native";
import { ShadowCard } from "../../components/ShadowCard";
import { ThemedIcon } from "../../theme/iconRegistry";
import { LoadingIndicator } from "../../components/LoadingIndicator";
import { api } from "../../api/client";
import { toast } from "../../lib/toast";
import { trackMindfulnessCompletion } from "../../lib/mindfulnessTracker";
import { sharedStyles as styles } from "./shared";
import { FONT_SIZES } from "../../theme/tokens";

// ─── Constants ────────────────────────────────────────────────────────────────

const GRATITUDE_PROMPTS = [
  "What's one thing that went well today, however small?",
  "Who made you smile or feel supported recently?",
  "What's something your body did well today?",
  "Name a simple pleasure you experienced this week.",
  "What's one thing in your environment you're grateful for?",
  "Who is someone you're glad to have in your life, and why?",
  "What challenge taught you something valuable recently?",
  "What made you feel calm or at ease today?",
  "What is something you often take for granted but are grateful for?",
  "What's a recent moment of kindness you witnessed or experienced?",
  "What skill or ability are you grateful to have?",
];

const MORNING_PROMPTS = [
  "What's one intention for today?",
  "What are you looking forward to?",
  "What might be challenging, and how will you handle it?",
];

const EVENING_PROMPTS = [
  "What was today's highlight?",
  "What was difficult, and what did you learn?",
  "What are you grateful for from today?",
];

const SUNDAY_PROMPTS = [
  "What was the best moment of this week?",
  "What drained you most this week, and why?",
  "What's one thing you want to do differently next week?",
];

const TAGS = ["Grateful", "Reflecting", "Venting", "Win", "Goal", "Just Writing"] as const;
type Tag = typeof TAGS[number];

type JournalEntry = {
  id: string;
  entry_text: string;
  logged_at: string;
  mood_label?: string;
  context?: any;
};

type Mode = "home" | "freewrite" | "guided_picker" | "morning" | "evening" | "sunday" | "gratitude" | "history";

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
  if (!daySet.has(localDayString(cur))) cur.setDate(cur.getDate() - 1);
  while (daySet.has(localDayString(cur))) {
    streak += 1;
    cur.setDate(cur.getDate() - 1);
  }
  return streak;
}

function findFlashback(entries: JournalEntry[]): JournalEntry | null {
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

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function dayLabel(iso: string): string {
  const today = localDayString(new Date());
  const yesterday = localDayString(new Date(Date.now() - 86400000));
  const entryDay = localDayString(new Date(iso));
  if (entryDay === today) return "Today";
  if (entryDay === yesterday) return "Yesterday";
  return fmtDate(iso);
}

function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

// ─── Tag color helper ─────────────────────────────────────────────────────────

function tagColor(tag: Tag, theme: any): string {
  switch (tag) {
    case "Grateful":     return (theme.berry as any)?.solid ?? theme.ink;
    case "Reflecting":   return (theme.purple as any)?.solid ?? theme.ink;
    case "Venting":      return (theme.coral as any)?.solid ?? theme.ink;
    case "Win":          return (theme.teal as any)?.solid ?? theme.ink;
    case "Goal":         return (theme.amber as any)?.solid ?? theme.ink;
    case "Just Writing": return theme.textSoft ?? theme.ink;
  }
}

function tagTint(tag: Tag, theme: any): string {
  switch (tag) {
    case "Grateful":     return (theme.berry as any)?.tint ?? theme.card;
    case "Reflecting":   return (theme.purple as any)?.tint ?? theme.card;
    case "Venting":      return (theme.coral as any)?.tint ?? theme.card;
    case "Win":          return (theme.teal as any)?.tint ?? theme.card;
    case "Goal":         return (theme.amber as any)?.tint ?? theme.card;
    case "Just Writing": return theme.card;
  }
}

// ─── Sub-views ────────────────────────────────────────────────────────────────

function BackButton({ onPress, ink }: { onPress: () => void; ink: string }) {
  return (
    <Pressable
      onPress={onPress}
      style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}
      accessibilityRole="button"
      accessibilityLabel="Back"
    >
      <Text style={{ color: ink, fontSize: FONT_SIZES.heading, fontWeight: "800" }}>←</Text>
      <Text style={{ color: ink, fontSize: FONT_SIZES.label, fontWeight: "700" }}>Journal</Text>
    </Pressable>
  );
}

// ─── Free Write ───────────────────────────────────────────────────────────────

function FreeWriteView({
  theme,
  ink,
  onBack,
  onSaved,
}: {
  theme: any;
  ink: string;
  onBack: () => void;
  onSaved: () => void;
}) {
  const [text, setText] = useState("");
  const [tag, setTag] = useState<Tag | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    if (!text.trim()) return;
    setSaving(true);
    try {
      await api.logMoodMoment(5, tag ?? "Just Writing", text.trim());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast("Saved to your journal.");
      trackMindfulnessCompletion("gratitude");
      setSaved(true);
    } catch {
      toast("Couldn't save — try again.", "error");
    } finally {
      setSaving(false);
    }
  }

  if (saved) {
    return (
      <>
        <BackButton onPress={onBack} ink={ink} />
        <View style={{ alignItems: "center", gap: 16, paddingVertical: 32 }}>
          <Text style={{ fontSize: 48 }}>✏️</Text>
          <Text style={{ color: theme.textStrong, fontSize: FONT_SIZES.heading, fontWeight: "800", textAlign: "center" }}>
            Entry saved
          </Text>
          <Pressable
            onPress={() => { setSaved(false); setText(""); setTag(null); }}
            style={[styles.endBtn, { borderColor: ink, backgroundColor: theme.card }]}
          >
            <Text style={{ color: ink, fontSize: FONT_SIZES.body, fontWeight: "800" }}>WRITE ANOTHER</Text>
          </Pressable>
          <Pressable onPress={onSaved} style={{ paddingVertical: 8 }}>
            <Text style={{ color: theme.textSoft, fontSize: FONT_SIZES.body }}>Done</Text>
          </Pressable>
        </View>
      </>
    );
  }

  return (
    <>
      <BackButton onPress={onBack} ink={ink} />
      <Text style={{ color: theme.textStrong, fontSize: FONT_SIZES.title, fontWeight: "900", marginBottom: 8 }}>
        Free Write
      </Text>

      <TextInput
        value={text}
        onChangeText={setText}
        placeholder="What's on your mind?"
        placeholderTextColor={theme.textSoft}
        style={{
          borderWidth: 2,
          borderColor: ink,
          borderRadius: 22,
          padding: 14,
          fontSize: FONT_SIZES.subheading,
          minHeight: 140,
          color: theme.textStrong,
          backgroundColor: theme.card,
          textAlignVertical: "top",
          shadowColor: "rgba(60,40,20,0.1)",
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.08,
          shadowRadius: 10,
          elevation: 2,
        }}
        multiline
        accessibilityLabel="Journal entry text"
      />

      <Text style={{ color: theme.textSoft, fontSize: FONT_SIZES.caption, marginTop: 4 }}>
        {wordCount(text)} {wordCount(text) === 1 ? "word" : "words"}
      </Text>

      <Text style={{ color: theme.textSoft, fontSize: FONT_SIZES.caption, fontWeight: "800", letterSpacing: 0.6, marginTop: 8 }}>
        TAG (OPTIONAL)
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
        {TAGS.map((t) => {
          const selected = tag === t;
          const color = tagColor(t, theme);
          return (
            <Pressable
              key={t}
              onPress={() => { Haptics.selectionAsync(); setTag(selected ? null : t); }}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 20,
                borderWidth: 1.5,
                borderColor: selected ? color : theme.cardBorder ?? ink,
                backgroundColor: selected ? tagTint(t, theme) : theme.card,
              }}
              accessibilityRole="button"
              accessibilityLabel={t}
            >
              <Text style={{ color: selected ? color : theme.textSoft, fontSize: FONT_SIZES.label, fontWeight: selected ? "800" : "400" }}>
                {t}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        onPress={handleSave}
        disabled={!text.trim() || saving}
        style={[
          styles.saveBtn,
          {
            backgroundColor: (theme.purple as any)?.solid ?? ink,
            borderColor: ink,
            opacity: text.trim() ? 1 : 0.4,
            marginTop: 8,
          },
        ]}
        accessibilityRole="button"
      >
        {saving
          ? <LoadingIndicator size="small" color="#fff" />
          : <Text style={{ color: "#fff", fontSize: FONT_SIZES.body, fontWeight: "800", letterSpacing: 0.5 }}>
              SAVE TO JOURNAL
            </Text>}
      </Pressable>
    </>
  );
}

// ─── Guided (multi-prompt) ────────────────────────────────────────────────────

function GuidedView({
  theme,
  ink,
  onBack,
  onSaved,
  title,
  prompts,
  entryType,
}: {
  theme: any;
  ink: string;
  onBack: () => void;
  onSaved: () => void;
  title: string;
  prompts: string[];
  entryType: string;
}) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<string[]>(prompts.map(() => ""));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const teal = (theme.teal as any) ?? {};

  async function handleFinish() {
    const combined = prompts
      .map((p, i) => `${p}\n${answers[i].trim()}`)
      .filter((_, i) => answers[i].trim())
      .join("\n\n");
    if (!combined) return;
    setSaving(true);
    try {
      await api.logMoodMoment(5, entryType, combined);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast("Reflection saved.");
      trackMindfulnessCompletion("gratitude");
      setSaved(true);
    } catch {
      toast("Couldn't save — try again.", "error");
    } finally {
      setSaving(false);
    }
  }

  if (saved) {
    return (
      <>
        <BackButton onPress={onBack} ink={ink} />
        <View style={{ alignItems: "center", gap: 16, paddingVertical: 32 }}>
          <Text style={{ fontSize: 48 }}>🌟</Text>
          <Text style={{ color: theme.textStrong, fontSize: FONT_SIZES.heading, fontWeight: "800", textAlign: "center" }}>
            Reflection complete
          </Text>
          <Pressable onPress={onSaved} style={[styles.endBtn, { borderColor: ink, backgroundColor: theme.card }]}>
            <Text style={{ color: ink, fontSize: FONT_SIZES.body, fontWeight: "800" }}>DONE</Text>
          </Pressable>
        </View>
      </>
    );
  }

  const isLast = step === prompts.length - 1;

  return (
    <>
      <BackButton onPress={onBack} ink={ink} />
      <Text style={{ color: theme.textStrong, fontSize: FONT_SIZES.title, fontWeight: "900", marginBottom: 4 }}>
        {title}
      </Text>

      <View style={{ flexDirection: "row", gap: 6, marginBottom: 16 }}>
        {prompts.map((_, i) => (
          <View
            key={i}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              backgroundColor: i <= step ? (teal.solid ?? ink) : (theme.cardBorder ?? theme.textSoft),
              opacity: i < step ? 0.5 : 1,
            }}
          />
        ))}
      </View>

      <ShadowCard size="card" bg={teal.tint ?? theme.card} accent={teal.solid ?? ink} rotate={-0.3}>
        <Text style={{ color: teal.sub ?? theme.textSoft, fontSize: FONT_SIZES.micro, fontWeight: "900", letterSpacing: 0.6, marginBottom: 8 }}>
          PROMPT {step + 1} OF {prompts.length}
        </Text>
        <Text style={{ color: teal.fg ?? theme.textStrong, fontSize: FONT_SIZES.subheading, lineHeight: 24, fontWeight: "600" }}>
          {prompts[step]}
        </Text>
      </ShadowCard>

      <TextInput
        value={answers[step]}
        onChangeText={(val) => setAnswers((prev) => { const next = [...prev]; next[step] = val; return next; })}
        placeholder="Your answer…"
        placeholderTextColor={theme.textSoft}
        style={{
          borderWidth: 2,
          borderColor: ink,
          borderRadius: 22,
          padding: 14,
          fontSize: FONT_SIZES.subheading,
          minHeight: 110,
          color: theme.textStrong,
          backgroundColor: theme.card,
          textAlignVertical: "top",
          shadowColor: "rgba(60,40,20,0.1)",
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.08,
          shadowRadius: 10,
          elevation: 2,
        }}
        multiline
        accessibilityLabel={`Answer to prompt ${step + 1}`}
      />

      <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
        {step > 0 && (
          <Pressable
            onPress={() => { Haptics.selectionAsync(); setStep(step - 1); }}
            style={[styles.nextBtn, { flex: 1, borderColor: ink, backgroundColor: theme.card }]}
            accessibilityRole="button"
          >
            <Text style={{ color: ink, fontSize: FONT_SIZES.body, fontWeight: "800" }}>← BACK</Text>
          </Pressable>
        )}
        {isLast ? (
          <Pressable
            onPress={handleFinish}
            disabled={saving}
            style={[styles.saveBtn, { flex: 1, backgroundColor: teal.solid ?? ink, borderColor: ink, opacity: saving ? 0.6 : 1 }]}
            accessibilityRole="button"
          >
            {saving
              ? <LoadingIndicator size="small" color="#fff" />
              : <Text style={{ color: "#fff", fontSize: FONT_SIZES.body, fontWeight: "800", letterSpacing: 0.5 }}>SAVE REFLECTION</Text>}
          </Pressable>
        ) : (
          <Pressable
            onPress={() => { Haptics.selectionAsync(); setStep(step + 1); }}
            style={[styles.nextBtn, { flex: 1, borderColor: ink, backgroundColor: teal.solid ?? ink }]}
            accessibilityRole="button"
          >
            <Text style={{ color: "#fff", fontSize: FONT_SIZES.body, fontWeight: "800" }}>NEXT →</Text>
          </Pressable>
        )}
      </View>
    </>
  );
}

// ─── Gratitude mode ───────────────────────────────────────────────────────────

function GratitudeView({
  theme,
  ink,
  onBack,
  onSaved,
}: {
  theme: any;
  ink: string;
  onBack: () => void;
  onSaved: () => void;
}) {
  const [promptIdx, setPromptIdx] = useState(() => Math.floor(Math.random() * GRATITUDE_PROMPTS.length));
  const [dataPrompt, setDataPrompt] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const berry = (theme.berry as any) ?? {};

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const s: any = await api.sleepStats();
        const secs = Number(s?.yesterday_seconds ?? 0);
        if (alive && secs > 0 && secs < 6 * 3600) {
          const h = Math.round((secs / 3600) * 10) / 10;
          setDataPrompt(`Sleep was short last night (${h}h). What helped you get through today anyway?`);
        }
      } catch {}
    })();
    return () => { alive = false; };
  }, []);

  function handleReroll() {
    Haptics.selectionAsync();
    setDataPrompt(null);
    setPromptIdx((prev) => {
      let next = Math.floor(Math.random() * GRATITUDE_PROMPTS.length);
      while (next === prev && GRATITUDE_PROMPTS.length > 1) {
        next = Math.floor(Math.random() * GRATITUDE_PROMPTS.length);
      }
      return next;
    });
  }

  async function handleSave() {
    if (!text.trim()) return;
    setSaving(true);
    try {
      await api.logMoodMoment(5, "Grateful", text.trim());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast("Saved to your journal.");
      trackMindfulnessCompletion("gratitude");
      setSaved(true);
    } catch {
      toast("Couldn't save — try again.", "error");
    } finally {
      setSaving(false);
    }
  }

  if (saved) {
    return (
      <>
        <BackButton onPress={onBack} ink={ink} />
        <View style={{ alignItems: "center", gap: 16, paddingVertical: 32 }}>
          <ThemedIcon slot="ui.gratitude" size={48} />
          <Text style={{ color: theme.textStrong, fontSize: FONT_SIZES.heading, fontWeight: "800", textAlign: "center" }}>
            Saved to your journal
          </Text>
          <Pressable
            onPress={() => { setSaved(false); setText(""); }}
            style={[styles.endBtn, { borderColor: ink, backgroundColor: theme.card }]}
          >
            <Text style={{ color: ink, fontSize: FONT_SIZES.label, fontWeight: "800" }}>WRITE ANOTHER</Text>
          </Pressable>
          <Pressable onPress={onSaved} style={{ paddingVertical: 8 }}>
            <Text style={{ color: theme.textSoft, fontSize: FONT_SIZES.body }}>Done</Text>
          </Pressable>
        </View>
      </>
    );
  }

  return (
    <>
      <BackButton onPress={onBack} ink={ink} />
      <Text style={{ color: theme.textStrong, fontSize: FONT_SIZES.title, fontWeight: "900", marginBottom: 8 }}>
        Gratitude
      </Text>

      <ShadowCard size="card" bg={berry.tint} accent={berry.solid} rotate={-0.5}>
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
          <Text style={{ color: berry.sub, fontSize: FONT_SIZES.micro, fontWeight: "900", letterSpacing: 0.6, flex: 1 }}>
            TODAY'S PROMPT
          </Text>
          <Pressable
            onPress={handleReroll}
            accessibilityRole="button"
            accessibilityLabel="Get a different prompt"
            style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, backgroundColor: (berry.solid ?? "#000") + "22" }}
          >
            <ThemedIcon slot="ui.shuffle" size={14} />
          </Pressable>
        </View>
        <Text style={{ color: berry.fg, fontSize: FONT_SIZES.subheading, lineHeight: 24, fontWeight: "600" }}>
          {dataPrompt ?? GRATITUDE_PROMPTS[promptIdx]}
        </Text>
      </ShadowCard>

      <TextInput
        value={text}
        onChangeText={setText}
        placeholder="Write your reflection here…"
        placeholderTextColor={theme.textSoft}
        style={{
          borderWidth: 2,
          borderColor: ink,
          borderRadius: 22,
          padding: 14,
          fontSize: FONT_SIZES.body + 1,
          minHeight: 120,
          color: theme.textStrong,
          backgroundColor: theme.card,
          textAlignVertical: "top",
          shadowColor: "rgba(60,40,20,0.1)",
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.08,
          shadowRadius: 10,
          elevation: 2,
        }}
        multiline
        accessibilityLabel="Gratitude journal entry"
      />

      <Pressable
        onPress={handleSave}
        disabled={!text.trim() || saving}
        style={[styles.saveBtn, { backgroundColor: berry.solid ?? ink, borderColor: ink, opacity: text.trim() ? 1 : 0.4 }]}
        accessibilityRole="button"
      >
        {saving
          ? <LoadingIndicator size="small" color="#fff" />
          : <Text style={{ color: "#fff", fontSize: FONT_SIZES.body, fontWeight: "800", letterSpacing: 0.5 }}>
              SAVE TO JOURNAL
            </Text>}
      </Pressable>
    </>
  );
}

// ─── History view ─────────────────────────────────────────────────────────────

function HistoryView({
  theme,
  ink,
  onBack,
}: {
  theme: any;
  ink: string;
  onBack: () => void;
}) {
  const [entries, setEntries] = useState<JournalEntry[] | null>(null);
  const berry = (theme.berry as any) ?? {};

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      api.mindfulnessJournal()
        .then((rows: JournalEntry[]) => {
          if (!cancelled) {
            if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
              UIManager.setLayoutAnimationEnabledExperimental(true);
            }
            LayoutAnimation.configureNext(LayoutAnimation.create(220, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity));
            setEntries(rows);
          }
        })
        .catch(() => { if (!cancelled) setEntries([]); });
      return () => { cancelled = true; };
    }, [])
  );

  const streak = entries ? entryStreak(entries) : 0;
  const flashback = entries ? findFlashback(entries) : null;

  // Group entries by day label
  const grouped: { label: string; items: JournalEntry[] }[] = [];
  if (entries) {
    const seenLabels: string[] = [];
    for (const e of entries) {
      const label = dayLabel(e.logged_at);
      if (!seenLabels.includes(label)) {
        seenLabels.push(label);
        grouped.push({ label, items: [] });
      }
      grouped[grouped.length - 1].items.push(e);
    }
  }

  return (
    <>
      <Pressable
        onPress={onBack}
        style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}
        accessibilityRole="button"
        accessibilityLabel="Back to journal"
      >
        <Text style={{ color: ink, fontSize: FONT_SIZES.heading, fontWeight: "800" }}>←</Text>
        <Text style={{ color: ink, fontSize: FONT_SIZES.label, fontWeight: "700" }}>Journal</Text>
      </Pressable>
      <Text style={{ color: theme.textStrong, fontSize: FONT_SIZES.title, fontWeight: "900", marginBottom: 8 }}>
        History
      </Text>

      {entries === null && (
        <View style={{ alignItems: "center", paddingVertical: 40 }}>
          <LoadingIndicator size="large" />
        </View>
      )}

      {entries !== null && entries.length === 0 && (
        <View style={{
          borderRadius: 16,
          borderWidth: 1.5,
          borderColor: berry.sub ?? theme.cardBorder ?? ink,
          backgroundColor: berry.tint ?? theme.card,
          padding: 20,
          alignItems: "center",
          gap: 6,
        }}>
          <Text style={{ fontSize: 28 }}>📖</Text>
          <Text style={{ color: berry.fg ?? theme.textStrong, fontSize: FONT_SIZES.body, fontWeight: "800" }}>
            No entries yet
          </Text>
          <Text style={{ color: berry.sub ?? theme.textSoft, fontSize: FONT_SIZES.caption, textAlign: "center" }}>
            Write your first entry — flashbacks appear once you've been journaling for a month.
          </Text>
        </View>
      )}

      {entries !== null && entries.length > 0 && (
        <View style={{ gap: 12 }}>
          {streak >= 2 && (
            <Text style={{ color: berry.fg ?? theme.textStrong, fontSize: FONT_SIZES.body, fontWeight: "800", textAlign: "center" }}>
              🔥 {streak}-day streak
            </Text>
          )}

          {flashback && (
            <View style={[styles.card, { backgroundColor: berry.tint ?? theme.card, borderColor: berry.solid ?? ink }]}>
              <Text style={{ color: berry.sub ?? theme.textSoft, fontSize: FONT_SIZES.micro, fontWeight: "900", letterSpacing: 0.6, marginBottom: 6 }}>
                💌 THIS TIME LAST MONTH, YOU WROTE
              </Text>
              <Text style={{ color: berry.fg ?? theme.textStrong, fontSize: FONT_SIZES.body, lineHeight: 20, fontStyle: "italic" }}>
                "{flashback.entry_text}"
              </Text>
              <Text style={{ color: berry.sub ?? theme.textSoft, fontSize: FONT_SIZES.caption, marginTop: 6, textAlign: "right" }}>
                {fmtDate(flashback.logged_at)}
              </Text>
            </View>
          )}

          {grouped.map(({ label, items }) => (
            <View key={label} style={{ gap: 8 }}>
              <Text style={{ color: theme.textSoft, fontSize: FONT_SIZES.caption, fontWeight: "800", letterSpacing: 0.6 }}>
                {label.toUpperCase()}
              </Text>
              {items.map((e) => {
                const entryTag = e.mood_label as Tag | undefined;
                const color = entryTag && TAGS.includes(entryTag as Tag)
                  ? tagColor(entryTag as Tag, theme)
                  : null;
                const tint = entryTag && TAGS.includes(entryTag as Tag)
                  ? tagTint(entryTag as Tag, theme)
                  : null;
                return (
                  <View key={e.id} style={{
                    borderRadius: 16,
                    borderWidth: 1.5,
                    borderColor: theme.cardBorder ?? ink,
                    backgroundColor: theme.card,
                    padding: 12,
                    gap: 6,
                  }}>
                    {entryTag && color && (
                      <View style={{
                        alignSelf: "flex-start",
                        paddingHorizontal: 10,
                        paddingVertical: 3,
                        borderRadius: 12,
                        backgroundColor: tint ?? theme.card,
                        borderWidth: 1,
                        borderColor: color,
                      }}>
                        <Text style={{ color, fontSize: FONT_SIZES.micro, fontWeight: "800" }}>{entryTag}</Text>
                      </View>
                    )}
                    <Text style={{ color: theme.textStrong, fontSize: FONT_SIZES.label, lineHeight: 19 }} numberOfLines={2}>
                      {e.entry_text}
                    </Text>
                    <Text style={{ color: theme.textSoft, fontSize: FONT_SIZES.micro }}>{fmtTime(e.logged_at)}</Text>
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      )}
    </>
  );
}

// ─── Home screen ──────────────────────────────────────────────────────────────

const isSunday = new Date().getDay() === 0;

function HomeView({
  theme,
  ink,
  onSelectMode,
  onHistory,
}: {
  theme: any;
  ink: string;
  onSelectMode: (mode: Mode) => void;
  onHistory: () => void;
}) {
  const berry = (theme.berry as any) ?? {};
  const purple = (theme.purple as any) ?? {};
  const teal = (theme.teal as any) ?? {};
  const amber = (theme.amber as any) ?? {};

  return (
    <>
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 2 }}>
        <Text style={{ color: theme.textStrong, fontSize: FONT_SIZES.title, fontWeight: "900", flex: 1 }}>
          Journal
        </Text>
        <Pressable
          onPress={onHistory}
          style={{
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 16,
            borderWidth: 1.5,
            borderColor: theme.cardBorder ?? ink,
            backgroundColor: theme.card,
          }}
          accessibilityRole="button"
          accessibilityLabel="View journal history"
        >
          <Text style={{ color: theme.textSoft, fontSize: FONT_SIZES.label, fontWeight: "700" }}>History</Text>
        </Pressable>
      </View>

      <Text style={{ color: theme.textSoft, fontSize: FONT_SIZES.body, marginBottom: 8 }}>
        Choose a journaling mode to begin.
      </Text>

      {isSunday && (
        <Pressable
          onPress={() => { Haptics.selectionAsync(); onSelectMode("sunday"); }}
          accessibilityRole="button"
          accessibilityLabel="Weekly Reflection"
        >
          <ShadowCard size="card" bg={amber.tint ?? theme.card} accent={amber.solid ?? ink} rotate={-0.3}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Text style={{ fontSize: 28 }}>⭐</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: amber.fg ?? theme.textStrong, fontSize: FONT_SIZES.subheading, fontWeight: "900" }}>
                  Weekly Reflection
                </Text>
                <Text style={{ color: amber.sub ?? theme.textSoft, fontSize: FONT_SIZES.label, marginTop: 2 }}>
                  It's Sunday — a good moment to look back on the week.
                </Text>
              </View>
              <Text style={{ color: amber.fg ?? theme.textStrong, fontSize: FONT_SIZES.heading }}>›</Text>
            </View>
          </ShadowCard>
        </Pressable>
      )}

      {[
        {
          mode: "freewrite" as Mode,
          icon: "✏️",
          title: "Free Write",
          desc: "No prompt — just write what's on your mind.",
          c: purple,
        },
        {
          mode: "guided_picker" as Mode,
          icon: "🌅",
          title: "Guided",
          desc: "Morning Pages or Evening Review — three prompts.",
          c: teal,
        },
        {
          mode: "gratitude" as Mode,
          icon: "🙏",
          title: "Gratitude",
          desc: "A random prompt to explore what you're thankful for.",
          c: berry,
        },
      ].map(({ mode, icon, title, desc, c }) => (
        <Pressable
          key={mode}
          onPress={() => { Haptics.selectionAsync(); onSelectMode(mode); }}
          accessibilityRole="button"
          accessibilityLabel={title}
        >
          <ShadowCard size="card" bg={c.tint ?? theme.card} accent={c.solid ?? ink} rotate={0.3}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Text style={{ fontSize: 28 }}>{icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.fg ?? theme.textStrong, fontSize: FONT_SIZES.subheading, fontWeight: "900" }}>
                  {title}
                </Text>
                <Text style={{ color: c.sub ?? theme.textSoft, fontSize: FONT_SIZES.label, marginTop: 2 }}>
                  {desc}
                </Text>
              </View>
              <Text style={{ color: c.fg ?? theme.textStrong, fontSize: FONT_SIZES.heading }}>›</Text>
            </View>
          </ShadowCard>
        </Pressable>
      ))}
    </>
  );
}

// ─── Guided sub-mode picker ───────────────────────────────────────────────────

function GuidedPickerView({
  theme,
  ink,
  onBack,
  onPick,
}: {
  theme: any;
  ink: string;
  onBack: () => void;
  onPick: (mode: "morning" | "evening") => void;
}) {
  const teal = (theme.teal as any) ?? {};
  const purple = (theme.purple as any) ?? {};

  return (
    <>
      <BackButton onPress={onBack} ink={ink} />
      <Text style={{ color: theme.textStrong, fontSize: FONT_SIZES.title, fontWeight: "900", marginBottom: 4 }}>
        Guided
      </Text>
      <Text style={{ color: theme.textSoft, fontSize: FONT_SIZES.body, marginBottom: 8 }}>
        Pick a session type.
      </Text>

      {[
        { mode: "morning" as const, icon: "🌅", title: "Morning Pages", desc: "Set an intention and prepare for the day.", c: teal },
        { mode: "evening" as const, icon: "🌙", title: "Evening Review", desc: "Reflect on the day and close the loop.", c: purple },
      ].map(({ mode, icon, title, desc, c }) => (
        <Pressable
          key={mode}
          onPress={() => { Haptics.selectionAsync(); onPick(mode); }}
          accessibilityRole="button"
          accessibilityLabel={title}
        >
          <ShadowCard size="card" bg={c.tint ?? theme.card} accent={c.solid ?? ink} rotate={-0.3}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Text style={{ fontSize: 28 }}>{icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.fg ?? theme.textStrong, fontSize: FONT_SIZES.subheading, fontWeight: "900" }}>
                  {title}
                </Text>
                <Text style={{ color: c.sub ?? theme.textSoft, fontSize: FONT_SIZES.label, marginTop: 2 }}>{desc}</Text>
              </View>
              <Text style={{ color: c.fg ?? theme.textStrong, fontSize: FONT_SIZES.heading }}>›</Text>
            </View>
          </ShadowCard>
        </Pressable>
      ))}
    </>
  );
}

// ─── JournalSection ───────────────────────────────────────────────────────────

export function JournalSection({
  theme,
  ink,
  onBack,
}: {
  theme: any;
  ink: string;
  onBack: () => void;
}) {
  const [mode, setMode] = useState<Mode>("home");

  function goHome() {
    setMode("home");
  }

  return (
    <>
      {mode === "home" && (
        <>
          <Pressable
            onPress={onBack}
            style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}
            accessibilityRole="button"
            accessibilityLabel="Back to practices"
          >
            <Text style={{ color: ink, fontSize: FONT_SIZES.heading, fontWeight: "800" }}>←</Text>
            <Text style={{ color: ink, fontSize: FONT_SIZES.label, fontWeight: "700" }}>Practices</Text>
          </Pressable>
          <HomeView
            theme={theme}
            ink={ink}
            onSelectMode={setMode}
            onHistory={() => setMode("history")}
          />
        </>
      )}

      {mode === "history" && (
        <HistoryView theme={theme} ink={ink} onBack={goHome} />
      )}

      {mode === "freewrite" && (
        <FreeWriteView theme={theme} ink={ink} onBack={goHome} onSaved={goHome} />
      )}

      {mode === "guided_picker" && (
        <GuidedPickerView
          theme={theme}
          ink={ink}
          onBack={goHome}
          onPick={(sub) => setMode(sub)}
        />
      )}

      {mode === "morning" && (
        <GuidedView
          theme={theme}
          ink={ink}
          onBack={() => setMode("guided_picker")}
          onSaved={goHome}
          title="Morning Pages"
          prompts={MORNING_PROMPTS}
          entryType="Morning Pages"
        />
      )}

      {mode === "evening" && (
        <GuidedView
          theme={theme}
          ink={ink}
          onBack={() => setMode("guided_picker")}
          onSaved={goHome}
          title="Evening Review"
          prompts={EVENING_PROMPTS}
          entryType="Evening Review"
        />
      )}

      {mode === "sunday" && (
        <GuidedView
          theme={theme}
          ink={ink}
          onBack={goHome}
          onSaved={goHome}
          title="Weekly Reflection"
          prompts={SUNDAY_PROMPTS}
          entryType="Weekly Reflection"
        />
      )}

      {mode === "gratitude" && (
        <GratitudeView theme={theme} ink={ink} onBack={goHome} onSaved={goHome} />
      )}
    </>
  );
}
