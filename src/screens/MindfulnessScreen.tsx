import React, { useState, useRef, useEffect, useCallback } from "react";
import { FeatureIntroSheet } from "../components/FeatureIntroSheet";
import { useFeatureIntro } from "../onboarding/useFeatureIntro";
import { findIntro } from "../onboarding/featureIntros";
import {
  RefreshControl,
  ScrollView,
  View,
  Text,
  Pressable,
  Animated
} from "react-native";
import { EmptyState } from "../components/EmptyState";
import { LinearGradient } from "expo-linear-gradient";
import { ScreenBackground } from "../components/ScreenBackground";
import { RippleLoader } from "../components/RippleLoader";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useTheme } from "../theme/ThemeContext";
import { getFriends, type Friend } from "../api/friends";
import { ThemedIcon } from "../theme/iconRegistry";
import { api } from "../api/client";
import { toast } from "../lib/toast";
import { trackMindfulnessCompletion, getTodayCompletedSections } from "../lib/mindfulnessTracker";
import { useReduceMotion } from "../hooks/useReduceMotion";
import { TooltipBubble } from "../components/TooltipBubble";
import { hasSeenTooltip, markTooltipSeen } from "../utils/tooltipSeen";
import { StatsHero } from "./mindfulness/StatsHero";
import { QuoteCard } from "./mindfulness/QuoteCard";
import { BodyScanSection } from "./mindfulness/BodyScanSection";
import { SoundscapesSection } from "./mindfulness/SoundscapesSection";
import { BreathingSection } from "./mindfulness/BreathingSection";
import { GroundingSection } from "./mindfulness/GroundingSection";
import { MeditationSection } from "./mindfulness/MeditationSection";
import { JournalSection } from "./mindfulness/JournalSection";
import { TileGrid } from "./mindfulness/TileGrid";

// ─── Types ────────────────────────────────────────────────────────────────────

type Section = "breathing" | "grounding" | "meditation" | "gratitude" | "journal" | "body_scan" | "sounds";

// ─── Component ────────────────────────────────────────────────────────────────

export function MindfulnessScreen() {
  const { theme } = useTheme();
  const mindfulnessIntro = findIntro("mindfulness")!;
  const [introVisible, dismissIntro] = useFeatureIntro(mindfulnessIntro.key);
  const ink = theme.ink;

  const navigation = useNavigation<any>();

  const [activeSection, setActiveSection] = useState<Section | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const [sectionLoading, setSectionLoading] = useState(false);
  const [todayDone, setTodayDone] = useState<string[]>([]);
  const [quickReset, setQuickReset] = useState(false);
  const [hubVisit, setHubVisit] = useState(0);
  const [totalSessions, setTotalSessions] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [mindfulFriendCount, setMindfulFriendCount] = useState(0);
  const [friends, setFriendsState] = useState<Friend[]>([]);
  const [lastSection, setLastSection] = useState<string | null>(null);
  const [showNudgePrompt, setShowNudgePrompt] = useState(false);
  const reduceMotion = useReduceMotion();
  const contentFade = useRef(new Animated.Value(1)).current;
  const fadeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (fadeTimeoutRef.current) {
      clearTimeout(fadeTimeoutRef.current);
      fadeTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    getFriends().then((fs: Friend[]) => {
      setFriendsState(fs);
      setMindfulFriendCount(fs.length);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (lastSection !== null && activeSection === null) {
      if (friends.length > 0) setShowNudgePrompt(true);
    }
    setLastSection(activeSection ?? null);
  }, [activeSection]); // eslint-disable-line react-hooks/exhaustive-deps

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      api.mindfulnessStats()
        .then((s: any) => { if (!cancelled) setTotalSessions(s?.total_sessions ?? 0); })
        .catch(() => { if (!cancelled) setTotalSessions(0); });
      hasSeenTooltip("mindfulness").then(seen => {
        if (!cancelled && !seen) {
          setShowTooltip(true);
          markTooltipSeen("mindfulness");
        }
      });
      getTodayCompletedSections().then((done) => { if (!cancelled) setTodayDone(done); });
      return () => { cancelled = true; };
    }, [])
  );

  function fadeTransition(onChange: () => void) {
    if (reduceMotion) {
      onChange();
      return;
    }
    Animated.timing(contentFade, { toValue: 0, duration: 140, useNativeDriver: true }).start(() => {
      setSectionLoading(true);
      if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current);
      fadeTimeoutRef.current = setTimeout(() => {
        fadeTimeoutRef.current = null;
        onChange();
        setSectionLoading(false);
        Animated.timing(contentFade, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      }, 200);
    });
  }

  function navigateTo(section: Section) {
    Haptics.selectionAsync();
    setQuickReset(false);
    fadeTransition(() => setActiveSection(section));
  }

  function startQuickReset() {
    Haptics.selectionAsync();
    setQuickReset(true);
    fadeTransition(() => setActiveSection("breathing"));
  }

  function goBack() {
    setQuickReset(false);
    fadeTransition(() => {
      setActiveSection(null);
      setHubVisit((v) => v + 1);
      getTodayCompletedSections().then(setTodayDone);
    });
  }

  return (
    <LinearGradient colors={[theme.page, theme.gradientEnd]} style={{ flex: 1 }}>
    <ScreenBackground pageId="mindfulness" />
    <ScrollView
      style={{ backgroundColor: "transparent" }}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {
        setRefreshing(true);
        Promise.all([
          api.mindfulnessStats().then((s: any) => setTotalSessions(s?.total_sessions ?? 0)).catch(() => {}),
          getTodayCompletedSections().then(setTodayDone).catch(() => {}),
        ]).finally(() => setRefreshing(false));
      }} tintColor={theme.teal.solid} colors={[theme.teal.solid]} />}
    >
      {sectionLoading ? (
        <View style={{ alignItems: "center", paddingVertical: 80 }}>
          <RippleLoader size="large" />
        </View>
      ) : (
        <Animated.View style={{ opacity: contentFade, gap: 14 }}>
          {showTooltip && activeSection === null && (
            <TooltipBubble
              message="Your mindfulness hub — breathing exercises, grounding techniques, guided meditation, and gratitude prompts. Each section guides you step by step."
              onDismiss={() => setShowTooltip(false)}
            />
          )}
          {activeSection === null && (
            <>
              <View style={{ alignItems: "center", paddingTop: 4, paddingBottom: 2 }}>
                <ThemedIcon slot="screen.mindfulness" size={48} />
              </View>
              {totalSessions === 0 ? (
                <EmptyState
                  slot="screen.mindfulness"
                  title="Start your first session"
                  subtitle="Choose a practice below to begin. Your progress and streaks will appear here."
                />
              ) : (
                <StatsHero theme={theme} ink={ink} refreshKey={hubVisit} />
              )}
              {mindfulFriendCount > 0 && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.purple.tint, borderRadius: 14, borderWidth: 1.5, borderColor: theme.purple.solid ?? theme.ink, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 8 }}>
                  <Text style={{ fontSize: 18 }}>🧘</Text>
                  <Text style={{ color: theme.purple.fg ?? theme.textStrong, fontSize: 13, fontWeight: '700', flex: 1 }}>
                    {mindfulFriendCount} friend{mindfulFriendCount !== 1 ? 's' : ''} on Ripple — practice together
                  </Text>
                </View>
              )}
              <TileGrid theme={theme} ink={ink} onSelect={navigateTo} onQuickReset={startQuickReset} todayDone={todayDone} />
              {showNudgePrompt && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.teal.tint, borderRadius: 14, borderWidth: 1.5, borderColor: theme.teal.solid, paddingHorizontal: 14, paddingVertical: 10 }}>
                  <Text style={{ fontSize: 18 }}>👋</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.teal.fg, fontSize: 13, fontWeight: '700' }}>Nice session! Nudge a friend to try it?</Text>
                  </View>
                  <Pressable onPress={() => { setShowNudgePrompt(false); navigation.navigate('Friends'); }} style={{ borderRadius: 10, borderWidth: 1.5, borderColor: theme.teal.solid, paddingHorizontal: 10, paddingVertical: 4 }}>
                    <Text style={{ color: theme.teal.fg, fontWeight: '700', fontSize: 12 }}>Nudge</Text>
                  </Pressable>
                  <Pressable onPress={() => setShowNudgePrompt(false)} hitSlop={8}>
                    <Text style={{ color: theme.textSoft, fontSize: 16 }}>×</Text>
                  </Pressable>
                </View>
              )}
              <QuoteCard theme={theme} />
            </>
          )}
          {activeSection === "breathing"  && <BreathingSection  theme={theme} ink={ink} onBack={goBack} quickReset={quickReset} />}
          {activeSection === "grounding"  && <GroundingSection  theme={theme} ink={ink} onBack={goBack} />}
          {activeSection === "meditation" && <MeditationSection theme={theme} ink={ink} onBack={goBack} />}
          {(activeSection === "gratitude" || activeSection === "journal") && <JournalSection theme={theme} ink={ink} onBack={goBack} />}
          {activeSection === "body_scan"  && <BodyScanSection   theme={theme} ink={ink} onBack={goBack} />}
          {activeSection === "sounds"     && <SoundscapesSection theme={theme} ink={ink} onBack={goBack} />}
        </Animated.View>
      )}
    </ScrollView>
    <FeatureIntroSheet intro={mindfulnessIntro} visible={introVisible} onClose={dismissIntro} />
    </LinearGradient>
  );
}
