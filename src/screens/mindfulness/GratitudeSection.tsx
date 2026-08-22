import React, { useState, useEffect } from "react";
import { View, Text, Pressable, TextInput } from "react-native";
import * as Haptics from "expo-haptics";
import { ShadowCard } from "../../components/ShadowCard";
import { ThemedIcon } from "../../theme/iconRegistry";
import { LoadingIndicator } from "../../components/LoadingIndicator";
import { api } from "../../api/client";
import { toast } from "../../lib/toast";
import { trackMindfulnessCompletion } from "../../lib/mindfulnessTracker";
import { GratitudeHistory } from "./GratitudeHistory";
import { sharedStyles as styles } from "./shared";

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

// ─── GratitudeSection ─────────────────────────────────────────────────────────

export function GratitudeSection({ theme, ink, onBack }: { theme: any; ink: string; onBack: () => void }) {
  const [promptIdx, setPromptIdx] = useState(() => Math.floor(Math.random() * GRATITUDE_PROMPTS.length));
  const [dataPrompt, setDataPrompt] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedCount, setSavedCount] = useState(0);

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
      setSaved(true); setText(""); setSavedCount((c) => c + 1);
    } catch {
      toast("Couldn't save — try again.", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Pressable
        onPress={onBack}
        style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}
        accessibilityRole="button"
        accessibilityLabel="Back to practices"
      >
        <Text style={{ color: ink, fontSize: 18, fontWeight: "800" }}>←</Text>
        <Text style={{ color: ink, fontSize: 13, fontWeight: "700" }}>Practices</Text>
      </Pressable>
      <Text style={{ color: theme.textStrong, fontSize: 20, fontWeight: "900", marginBottom: 2 }}>Gratitude</Text>

      {saved ? (
        <View style={{ alignItems: "center", gap: 16, paddingVertical: 24 }}>
          <ThemedIcon slot="ui.gratitude" size={48} />
          <Text style={{ color: theme.textStrong, fontSize: 18, fontWeight: "800", textAlign: "center" }}>Saved to your journal</Text>
          <Pressable onPress={() => setSaved(false)} style={[styles.endBtn, { borderColor: ink, backgroundColor: theme.card }]}>
            <Text style={{ color: ink, fontSize: 13, fontWeight: "800" }}>WRITE ANOTHER</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <ShadowCard size="card" bg={(theme.berry as any)?.tint} accent={(theme.berry as any)?.solid} rotate={-0.5}>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
              <Text style={{ color: (theme.berry as any)?.sub, fontSize: 9, fontWeight: "900", letterSpacing: 0.6, flex: 1 }}>TODAY'S PROMPT</Text>
              <Pressable
                onPress={handleReroll}
                accessibilityRole="button"
                accessibilityLabel="Get a different prompt"
                style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, backgroundColor: (theme.berry as any)?.solid + "22" }}
              >
                <ThemedIcon slot="ui.shuffle" size={14} />
              </Pressable>
            </View>
            <Text style={{ color: (theme.berry as any)?.fg, fontSize: 16, lineHeight: 24, fontWeight: "600" }}>
              {dataPrompt ?? GRATITUDE_PROMPTS[promptIdx]}
            </Text>
          </ShadowCard>

          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Write your reflection here…"
            placeholderTextColor={theme.textSoft}
            style={{
              borderWidth: 2, borderColor: ink, borderRadius: 22, padding: 14,
              fontSize: 15, minHeight: 120, color: theme.textStrong,
              backgroundColor: theme.card, textAlignVertical: "top",
              shadowColor: "rgba(60,40,20,0.1)", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 2,
            }}
            multiline
            accessibilityLabel="Gratitude journal entry"
          />

          <Pressable
            onPress={handleSave}
            disabled={!text.trim() || saving}
            style={[styles.saveBtn, { backgroundColor: (theme.berry as any)?.solid, borderColor: ink, opacity: text.trim() ? 1 : 0.4 }]}
            accessibilityRole="button"
          >
            {saving
              ? <LoadingIndicator size="small" color="#fff" />
              : <Text style={{ color: "#fff", fontSize: 14, fontWeight: "800", letterSpacing: 0.5 }}>SAVE TO JOURNAL</Text>}
          </Pressable>
        </>
      )}

      <GratitudeHistory theme={theme} ink={ink} refreshKey={savedCount} />
    </>
  );
}
