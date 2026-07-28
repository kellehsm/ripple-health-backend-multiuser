import React, { useState } from "react";
import { ScrollView, View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useTheme } from "../theme/ThemeContext";

type FaqItem = { q: string; a: string };
type FaqSection = { title: string; items: FaqItem[] };

const FAQ: FaqSection[] = [
  {
    title: "Getting Started",
    items: [
      {
        q: "What can I track in Ripple?",
        a: "Ripple lets you track glucose readings, meals and nutrition, mood check-ins, books and reading progress, hobbies, spending, water intake, steps, sleep, and heart rate.",
      },
      {
        q: "How do I log a meal?",
        a: "Tap the Meals tab, search for a food or scan a barcode, confirm the nutritional info, and tap Log. You can also log quick macros manually.",
      },
      {
        q: "Can I use Ripple without a Dexcom?",
        a: "Yes — Ripple works without glucose tracking. Glucose features will simply be hidden. You can still track all other areas.",
      },
    ],
  },
  {
    title: "Glucose",
    items: [
      {
        q: "How do I connect my Dexcom?",
        a: "Go to Settings → Dexcom Share and enter your Dexcom Share account ID, password, and region. Ripple polls your Share feed every 5 minutes.",
      },
      {
        q: "Why is my glucose not updating?",
        a: "Check that Dexcom Share is enabled in the Dexcom app and that Always-on Tracking is running in Ripple. Tap Settings → Always-on Tracking and make sure it's enabled.",
      },
      {
        q: "What does the glucose spike prompt do?",
        a: "When your glucose rises 30+ mg/dL in an hour, Ripple asks if you ate something. Answering links the glucose event to that meal so you can see patterns over time.",
      },
    ],
  },
  {
    title: "Meals & Food",
    items: [
      {
        q: "Can I scan barcodes?",
        a: "Yes — on the Meals tab, tap the barcode icon. Ripple checks USDA and Open Food Facts databases. If the nutrition data is wrong, you can edit it and Ripple will remember your correction.",
      },
      {
        q: "What are Frequent Meals?",
        a: "Ripple tracks which foods you log most often and surfaces them at the top of the Meals tab as quick-log buttons.",
      },
      {
        q: "How do I log caffeine or alcohol?",
        a: "On the Meals tab, scroll to the Caffeine or Alcohol section and search for your drink, or scan its barcode.",
      },
    ],
  },
  {
    title: "Books & Hobbies",
    items: [
      {
        q: "How do I track reading progress?",
        a: "On the Life tab, search for a book and add it. Then tap the +10 / +20 / +30 buttons or enter a page count manually and tap LOG.",
      },
      {
        q: "What happens when I finish a book?",
        a: "Tap DONE ✓ or it auto-completes when you log 100% of pages. Completed books move to the Completed archive.",
      },
      {
        q: "How are hobby stats calculated?",
        a: "Ripple totals your hobby logs for the current and previous week. The week start day is configurable in Settings → Week Start Day.",
      },
    ],
  },
  {
    title: "Notifications",
    items: [
      {
        q: "How do I enable smart notifications?",
        a: "Enable Always-on Tracking in Settings, then configure individual reminders under Smart Notifications. You need notification permission granted.",
      },
      {
        q: "How do I silence all notifications temporarily?",
        a: "In Settings → Silence All Notifications, tap a preset (1 hour, 4 hours, Until tomorrow). Notifications auto-resume when the mute expires.",
      },
      {
        q: "Why aren't my notifications showing?",
        a: "Check that Always-on Tracking is enabled, notification permission is granted, and battery optimization is turned off for Ripple. All three are shown in the Settings status panel.",
      },
    ],
  },
  {
    title: "Privacy & Data",
    items: [
      {
        q: "Where is my data stored?",
        a: "All data is stored on your private Ripple server — nothing is shared with third parties. Glucose data comes directly from Dexcom Share, a service you already control.",
      },
      {
        q: "How do I export my data?",
        a: "Go to Settings → Export My Data to download a full JSON backup, or Export Health Report to generate a PDF summary for a doctor visit.",
      },
      {
        q: "How do I back up to Google Drive?",
        a: "In Settings → Google Drive Backups, tap Connect Google Drive and follow the authorization flow. Ripple will back up nightly at 2 AM automatically.",
      },
    ],
  },
];

export function HelpScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<any>();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  function toggle(key: string) {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <ScrollView style={{ backgroundColor: theme.page }} contentContainerStyle={styles.content}>
      {/* App tour replay */}
      <Pressable
        style={[styles.tourCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
        onPress={() => navigation.navigate("OnboardingReplay")}
        accessibilityRole="button"
        accessibilityLabel="Replay the app tour"
      >
        <Text style={{ fontSize: 24 }}>🗺️</Text>
        <View style={{ flex: 1 }}>
          <Text style={[styles.tourTitle, { color: theme.textStrong }]}>Replay app tour</Text>
          <Text style={[styles.tourSub, { color: theme.textSoft }]}>
            Walk through each section of Ripple again
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={theme.textSoft} />
      </Pressable>

      <Text style={[styles.intro, { color: theme.textSoft }]}>
        Find answers to common questions about Ripple Wellness.
      </Text>
      {FAQ.map((section) => (
        <View key={section.title} style={{ marginBottom: 16 }}>
          <Text style={[styles.sectionLabel, { color: theme.textSoft }]}>{section.title.toUpperCase()}</Text>
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            {section.items.map((item, idx) => {
              const key = section.title + idx;
              const open = !!expanded[key];
              return (
                <View key={key}>
                  {idx > 0 && <View style={[styles.divider, { backgroundColor: theme.cardBorder }]} />}
                  <Pressable onPress={() => toggle(key)} style={styles.qRow}>
                    <Text style={[styles.question, { color: theme.textStrong, flex: 1 }]}>{item.q}</Text>
                    <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={theme.textSoft} />
                  </Pressable>
                  {open && (
                    <Text style={[styles.answer, { color: theme.textSoft }]}>{item.a}</Text>
                  )}
                </View>
              );
            })}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16 },
  tourCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: 26,
    borderWidth: 2,
    padding: 16,
    marginBottom: 20,
    shadowColor: "rgba(60,40,20,0.1)",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 4,
  },
  tourTitle: { fontSize: 15, fontWeight: "900" },
  tourSub: { fontSize: 12, marginTop: 2, fontWeight: "600" },
  intro: { fontSize: 13, marginBottom: 16, lineHeight: 18, fontWeight: "600" },
  sectionLabel: { fontSize: 9, fontWeight: "900", letterSpacing: 0.6, marginBottom: 6, textTransform: "uppercase" },
  card: {
    borderRadius: 26,
    borderWidth: 2,
    shadowColor: "rgba(60,40,20,0.1)",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 4,
  },
  divider: { height: 1, marginHorizontal: 14 },
  qRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  question: { fontSize: 13, fontWeight: "600", lineHeight: 18 },
  answer: { fontSize: 13, lineHeight: 19, paddingHorizontal: 14, paddingBottom: 12, paddingTop: 2 },
});
