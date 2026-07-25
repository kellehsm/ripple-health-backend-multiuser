/**
 * WIZARD / MULTI-STEP SCREEN TEMPLATE
 * Use for: WorkoutSetupWizard, ExerciseSessionScreen, NewChallengeScreen,
 *          OnboardingFlow, any flow where data is gathered across multiple steps
 *
 * Pattern: Step indicator at top → single-focus content area → Back/Next
 * footer. Each step collects one thing. Never show more than one step at once.
 * The footer is always visible — content scrolls behind it.
 */

import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { fonts } from "../theme/typography";

const STEPS = ["Setup", "Options", "Schedule", "Review"];

export function WizardScreenTemplate() {
  const { theme } = useTheme();
  const [step, setStep] = useState(0);
  const isFirst = step === 0;
  const isLast  = step === STEPS.length - 1;

  function goNext() { if (!isLast)  setStep(s => s + 1); }
  function goBack() { if (!isFirst) setStep(s => s - 1); }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.page }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* ── Step indicator ── */}
      <View style={[styles.stepBar, { backgroundColor: theme.card, borderBottomColor: theme.cardBorder }]}>
        {STEPS.map((label, i) => {
          const done    = i < step;
          const current = i === step;
          return (
            <View key={label} style={styles.stepItem}>
              {/* Connector line before step (not on first) */}
              {i > 0 && (
                <View style={[styles.connector, { backgroundColor: done || current ? theme.teal.bar : theme.cardBorder }]} />
              )}
              <View
                style={[
                  styles.stepDot,
                  {
                    backgroundColor: done ? theme.teal.bar : current ? theme.teal.bg : theme.cardBorder,
                    borderColor: current ? theme.teal.bar : "transparent",
                  },
                ]}
              >
                {done
                  ? <Ionicons name="checkmark" size={12} color="#fff" />
                  : <Text style={[styles.stepNum, { color: current ? theme.teal.bar : theme.textSoft }]}>
                      {i + 1}
                    </Text>
                }
              </View>
              <Text style={[styles.stepLabel, { color: current ? theme.teal.fg : theme.textSoft }]}>
                {label}
              </Text>
            </View>
          );
        })}
      </View>

      {/* ── Scrollable step content ── */}
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.stepTitle, { color: theme.textStrong }]}>
          Step {step + 1}: {STEPS[step]}
        </Text>
        <Text style={[styles.stepSubtitle, { color: theme.textSoft }]}>
          Brief instruction telling the user exactly what to do on this step.
          Keep it to one or two sentences.
        </Text>

        {/* Step content card */}
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          {/* Replace with the actual input / selection for this step */}
          <View style={styles.contentPlaceholder}>
            <Ionicons name="create-outline" size={32} color={theme.textSoft} />
            <Text style={[styles.placeholderText, { color: theme.textSoft }]}>
              Step {step + 1} UI renders here
            </Text>
          </View>
        </View>

        {/* Summary preview (shown on last step only) */}
        {isLast && (
          <View style={[styles.summaryCard, { backgroundColor: theme.teal.bg, borderColor: theme.teal.bar }]}>
            <Text style={[styles.summaryTitle, { color: theme.teal.fg }]}>Ready to go</Text>
            <Text style={[styles.summaryBody, { color: theme.teal.fg }]}>
              Review your selections above. Tap Finish to save.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* ── Sticky footer with Back / Next ── */}
      <View style={[styles.footer, { backgroundColor: theme.card, borderTopColor: theme.cardBorder }]}>
        <Pressable
          onPress={goBack}
          style={[styles.backBtn, { opacity: isFirst ? 0.3 : 1 }]}
          disabled={isFirst}
        >
          <Ionicons name="arrow-back" size={18} color={theme.textSoft} />
          <Text style={[styles.backBtnText, { color: theme.textSoft }]}>Back</Text>
        </Pressable>

        <View style={styles.dotsRow}>
          {STEPS.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                { backgroundColor: i === step ? theme.teal.bar : theme.cardBorder },
              ]}
            />
          ))}
        </View>

        <Pressable
          onPress={goNext}
          style={[styles.nextBtn, { backgroundColor: theme.teal.bar }]}
        >
          <Text style={styles.nextBtnText}>{isLast ? "Finish" : "Next"}</Text>
          {!isLast && <Ionicons name="arrow-forward" size={18} color="#fff" />}
          {isLast  && <Ionicons name="checkmark"     size={18} color="#fff" />}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  stepBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
  },
  stepItem: { flex: 1, alignItems: "center", position: "relative" },
  connector: { position: "absolute", top: 11, left: -"50%" as any, right: "50%", height: 2 },
  stepDot: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  stepNum: { fontSize: 10, fontWeight: "700", fontFamily: fonts.bold },
  stepLabel: { fontSize: 10, marginTop: 4, fontFamily: fonts.regular },

  content: { padding: 20, gap: 14, paddingBottom: 20 },
  stepTitle: { fontSize: 22, fontWeight: "700", fontFamily: fonts.bold },
  stepSubtitle: { fontSize: 14, lineHeight: 20, fontFamily: fonts.regular },

  card: {
    borderRadius: 14,
    borderWidth: 0.5,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  contentPlaceholder: { alignItems: "center", gap: 8, paddingVertical: 40 },
  placeholderText: { fontSize: 13, fontFamily: fonts.regular },

  summaryCard: { borderRadius: 14, borderWidth: 1.5, padding: 16, gap: 6 },
  summaryTitle: { fontSize: 15, fontWeight: "700", fontFamily: fonts.bold },
  summaryBody: { fontSize: 13, lineHeight: 18, fontFamily: fonts.regular },

  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 0.5,
  },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 10, paddingHorizontal: 4 },
  backBtnText: { fontSize: 15, fontFamily: fonts.regular },
  dotsRow: { flexDirection: "row", gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  nextBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 20 },
  nextBtnText: { color: "#fff", fontSize: 15, fontWeight: "600", fontFamily: fonts.semiBold },
});
