/**
 * AUTH SCREEN TEMPLATE
 * Use for: Login, Sign Up, Onboarding steps, FriendsOnboarding
 *
 * Pattern: Full-screen scroll with centered hero (logo + headline),
 * stacked card sections, and a single primary CTA at the bottom.
 * No navigation header — this screen owns the full viewport.
 */

import React, { useState } from "react";
import {
  ScrollView,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { fonts } from "../theme/typography";
import { AppLogo } from "../components/AppLogo";

export function AuthScreenTemplate() {
  const { theme } = useTheme();
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(false);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.page }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Hero ── */}
        <View style={styles.hero}>
          <AppLogo size={96} />
          <Text style={[styles.headline, { color: theme.textStrong }]}>
            Screen Title
          </Text>
          <Text style={[styles.subheadline, { color: theme.textSoft }]}>
            One-line description of this step or screen purpose.
          </Text>
        </View>

        {/* ── Primary card / input area ── */}
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <Text style={[styles.cardTitle, { color: theme.textStrong }]}>
            Section heading
          </Text>
          <Text style={[styles.cardBody, { color: theme.textSoft }]}>
            Supporting copy that explains what the user needs to do here.
            Keep it to two sentences max.
          </Text>

          {/* Text input */}
          <TextInput
            value={inputValue}
            onChangeText={setInputValue}
            placeholder="Placeholder text"
            placeholderTextColor={theme.textSoft}
            style={[
              styles.input,
              { borderColor: theme.cardBorder, backgroundColor: theme.surface, color: theme.textStrong },
            ]}
            autoCapitalize="none"
          />

          {/* Inline feedback badge (success / warning) */}
          {inputValue.length > 0 && (
            <View style={[styles.badge, { backgroundColor: theme.teal.bg }]}>
              <Ionicons name="checkmark-circle" size={15} color={theme.teal.fg} />
              <Text style={[styles.badgeText, { color: theme.teal.fg }]}>
                Looks good
              </Text>
            </View>
          )}
        </View>

        {/* ── Secondary info card (optional) ── */}
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <Text style={[styles.cardTitle, { color: theme.textStrong }]}>
            Another section
          </Text>

          {/* Option rows — use for radio/toggle choices */}
          {(["Option A", "Option B"] as const).map((opt) => (
            <Pressable
              key={opt}
              style={[
                styles.optionRow,
                {
                  borderColor: opt === "Option A" ? theme.teal.bar : theme.cardBorder,
                  backgroundColor: opt === "Option A" ? theme.teal.bg : "transparent",
                },
              ]}
            >
              <Ionicons
                name={opt === "Option A" ? "radio-button-on" : "radio-button-off"}
                size={20}
                color={opt === "Option A" ? theme.teal.bar : theme.textSoft}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.optionTitle, { color: opt === "Option A" ? theme.teal.fg : theme.textStrong }]}>
                  {opt}
                </Text>
                <Text style={[styles.optionBody, { color: theme.textSoft }]}>
                  Brief description of this option.
                </Text>
              </View>
            </Pressable>
          ))}
        </View>

        {/* ── Primary CTA ── */}
        <Pressable
          style={[styles.primaryBtn, { backgroundColor: theme.teal.bar, opacity: loading ? 0.6 : 1 }]}
          disabled={loading}
        >
          <Text style={styles.primaryBtnText}>Get started</Text>
        </Pressable>

        {/* ── Ghost / skip link ── */}
        <Pressable>
          <Text style={[styles.ghostLink, { color: theme.textSoft }]}>
            Skip for now
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 24, paddingTop: 60, paddingBottom: 80, gap: 16 },

  hero: { alignItems: "center", gap: 10, marginBottom: 8 },
  headline: { fontSize: 26, fontWeight: "700", textAlign: "center", fontFamily: fonts.bold },
  subheadline: { fontSize: 15, textAlign: "center", lineHeight: 22, fontFamily: fonts.regular },

  card: {
    borderRadius: 16,
    borderWidth: 0.5,
    padding: 18,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  cardTitle: { fontSize: 16, fontWeight: "600", fontFamily: fonts.semiBold },
  cardBody: { fontSize: 14, lineHeight: 20, fontFamily: fonts.regular },

  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    fontFamily: fonts.regular,
  },

  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 10,
    padding: 10,
  },
  badgeText: { fontSize: 13, fontFamily: fonts.regular },

  optionRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    padding: 14,
  },
  optionTitle: { fontSize: 15, fontWeight: "600", fontFamily: fonts.semiBold },
  optionBody: { fontSize: 13, lineHeight: 18, marginTop: 2, fontFamily: fonts.regular },

  primaryBtn: { borderRadius: 14, paddingVertical: 15, alignItems: "center" },
  primaryBtnText: { color: "#fff", fontSize: 16, fontWeight: "600", fontFamily: fonts.semiBold },
  ghostLink: { fontSize: 14, textAlign: "center", textDecorationLine: "underline", fontFamily: fonts.regular },
});
