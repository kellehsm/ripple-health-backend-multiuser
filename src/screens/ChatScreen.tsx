import React, { useEffect, useRef, useState } from "react";
import { useRoute } from "@react-navigation/native";
import {
  View, Text, TextInput, Pressable, FlatList, KeyboardAvoidingView,
  Platform, ActivityIndicator, StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { FONT_SIZES } from "../theme/tokens";
import { api } from "../api/client";
import { ScreenBackground } from "../components/ScreenBackground";

type Msg = { role: "user" | "assistant"; content: string; ts?: number };

const SUGGESTIONS = [
  "How has my sleep been this week?",
  "Which day was my best this week?",
  "How do my mood and activity compare lately?",
];

export function ChatScreen() {
  const { theme } = useTheme();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<Msg>>(null);
  const route = useRoute<any>();
  const [shownTs, setShownTs] = useState<number | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const lastFailed = useRef<string | null>(null);
  const askedInitial = useRef(false);

  useEffect(() => {
    const q = route.params?.initialQuestion;
    if (typeof q === "string" && q.trim() && !askedInitial.current) {
      askedInitial.current = true;
      send(q);
    }
  }, [route.params?.initialQuestion]);

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || sending) return;
    const next: Msg[] = [...messages, { role: "user", content, ts: Date.now() }];
    setMessages(next);
    setInput("");
    setSending(true);
    setSendError(null);
    try {
      const res = await api.chat(next);
      setMessages([...next, { role: "assistant", content: res.reply, ts: Date.now() }]);
      lastFailed.current = null;
    } catch (e: any) {
      const msg = e?.status === 503
        ? "Chat isn't set up on this server yet."
        : "Couldn't get a response.";
      lastFailed.current = content;
      setMessages(messages); // drop the unanswered message; retry re-sends it
      setSendError(msg);
    } finally {
      setSending(false);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.page }}>
      <ScreenBackground />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(_, i) => String(i)}
          contentContainerStyle={{ padding: 16, paddingBottom: 24, gap: 10, flexGrow: 1 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={
            <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 14 }}>
              <Ionicons name="sparkles-outline" size={34} color={theme.textSoft} />
              <Text style={{ color: theme.textStrong, fontWeight: "800", fontSize: FONT_SIZES.subheading }}>Ask about your data</Text>
              <Text style={{ color: theme.textSoft, fontSize: FONT_SIZES.label, textAlign: "center", paddingHorizontal: 30 }}>
                Questions are answered from your last two weeks of daily summaries. Observations only — never medical advice.
              </Text>
              <View style={{ gap: 8, marginTop: 6, alignSelf: "stretch", paddingHorizontal: 16 }}>
                {SUGGESTIONS.map(s => (
                  <Pressable
                    key={s}
                    onPress={() => send(s)}
                    style={[styles.suggestion, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
                  >
                    <Text style={{ color: theme.textStrong, fontSize: FONT_SIZES.label }}>{s}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          }
          renderItem={({ item, index }) => (
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 6, alignSelf: item.role === "user" ? "flex-end" : "flex-start" }}>
              {item.role === "assistant" && (
                <View style={[styles.avatarDot, { backgroundColor: theme.teal.tint, borderColor: theme.teal.solid + "50" }]}>
                  <Ionicons name="sparkles" size={11} color={theme.teal.solid} />
                </View>
              )}
              <Pressable
                onLongPress={() => setShownTs(shownTs === index ? null : index)}
                delayLongPress={300}
                style={[
                  styles.bubble,
                  item.role === "user"
                    ? { backgroundColor: theme.teal.solid }
                    : { backgroundColor: theme.card, borderWidth: 1, borderColor: theme.cardBorder },
                ]}
              >
                <Text style={{ color: item.role === "user" ? "#fff" : theme.textStrong, fontSize: FONT_SIZES.body, lineHeight: 20 }}>
                  {item.content}
                </Text>
                {shownTs === index && item.ts ? (
                  <Text style={{ color: item.role === "user" ? "rgba(255,255,255,0.75)" : theme.textSoft, fontSize: FONT_SIZES.micro, marginTop: 4 }}>
                    {new Date(item.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </Text>
                ) : null}
              </Pressable>
            </View>
          )}
          ListFooterComponent={
            sending ? (
              <View style={[styles.bubble, { alignSelf: "flex-start", backgroundColor: theme.card, borderWidth: 1, borderColor: theme.cardBorder, flexDirection: "row", gap: 8, alignItems: "center" }]}>
                <ActivityIndicator size="small" color={theme.teal.solid} />
                <Text style={{ color: theme.textSoft, fontSize: FONT_SIZES.label }}>Thinking…</Text>
              </View>
            ) : null
          }
        />
        {sendError ? (
          <View style={[styles.errorBanner, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <Text style={{ color: theme.danger, fontSize: FONT_SIZES.label, flex: 1 }}>{sendError}</Text>
            <Pressable
              onPress={() => { if (lastFailed.current) send(lastFailed.current); }}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Retry sending message"
            >
              <Text style={{ color: theme.primary, fontSize: FONT_SIZES.label, fontWeight: "700" }}>Retry</Text>
            </Pressable>
          </View>
        ) : null}
        <View style={[styles.inputRow, { backgroundColor: theme.card, borderTopColor: theme.cardBorder }]}>
          <TextInput
            style={[styles.input, { color: theme.textStrong, backgroundColor: theme.page, borderColor: theme.cardBorder }]}
            placeholder="Ask about your data…"
            placeholderTextColor={theme.textSoft}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={() => send()}
            returnKeyType="send"
            multiline
          />
          <Pressable
            onPress={() => send()}
            disabled={sending || !input.trim()}
            hitSlop={12}
            style={[styles.sendBtn, { backgroundColor: theme.teal.solid, opacity: sending || !input.trim() ? 0.4 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel="Send message"
          >
            <Ionicons name="arrow-up" size={20} color="#fff" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: { maxWidth: "82%", borderRadius: 16, paddingVertical: 9, paddingHorizontal: 13 },
  avatarDot: { width: 20, height: 20, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center", marginBottom: 2 },
  suggestion: { borderRadius: 12, borderWidth: 1, paddingVertical: 10, paddingHorizontal: 14 },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, padding: 10, borderTopWidth: 1 },
  errorBanner: { flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 12, marginBottom: 6, borderWidth: 1, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12 },
  input: { flex: 1, borderRadius: 18, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 9, fontSize: FONT_SIZES.body, maxHeight: 110 },
  sendBtn: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
});
