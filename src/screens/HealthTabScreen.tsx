import React, { useState, useCallback, useRef, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FeatureIntroSheet } from '../components/FeatureIntroSheet';
import { useFeatureIntro } from '../onboarding/useFeatureIntro';
import { findIntro } from '../onboarding/featureIntros';
import { ScreenBackground } from '../components/ScreenBackground';
import { useTheme } from '../theme/ThemeContext';
import { useTabPreferences } from '../hooks/useTabPreferences';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/client';
import { SectionEditorModal, SectionDef } from '../components/SectionEditorModal';
import { FeatureTour, TourStep } from '../components/FeatureTour';
import { hasSeenTooltip, markTooltipSeen } from '../utils/tooltipSeen';
import { SubTab } from './health/shared';
import { OverviewBlocks } from './health/OverviewBlocks';
import { MedicationList } from './health/MedicationList';
import { CycleView } from './health/CycleView';
import { SymptomsView } from './health/SymptomsView';

const HEALTH_SECTIONS: SectionDef[] = [
  { id: 'cycle_tab',    label: 'Cycle tracking', description: 'Menstrual cycle calendar and logging' },
  { id: 'symptoms_tab', label: 'Symptoms log',   description: 'Daily symptom tracking' },
];

export function HealthTabScreen() {
  const { theme } = useTheme();
  const { preferences } = useTabPreferences();
  const healthIntro = findIntro("health")!;
  const [introVisible, dismissIntro] = useFeatureIntro(healthIntro.key);
  const { medication, cycle } = preferences.health;
  const bothEnabled = medication && cycle;
  const [activeSubTab, setActiveSubTab] = useState<SubTab>(medication ? 'medication' : 'cycle');
  const [hiddenSections, setHiddenSections] = useState<string[]>([]);
  const [showSectionEditor, setShowSectionEditor] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const [tourPadding, setTourPadding] = useState(0);
  const tourOverviewRef = useRef<View>(null);
  const tourContentRef = useRef<View>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const scrollOffsetRef = useRef(0);

  const healthTourSteps: TourStep[] = useMemo(() => [
    { ref: tourOverviewRef, title: "Health Hub", body: "Switch between Medications, Cycle tracking, and Symptoms using the tiles at the top." },
    { ref: tourContentRef,  title: "Medication Schedule", body: "See today's scheduled doses and your full medication list. Tap any med for details, dosage, and history." },
  ], []);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    api.getSettings().then((s: any) => {
      if (!cancelled) setHiddenSections(s?.health_hidden_sections ?? []);
    }).catch(() => {});
    hasSeenTooltip("health-tour").then(seen => {
      if (!cancelled && !seen) { markTooltipSeen("health-tour"); setTimeout(() => setShowTour(true), 600); }
    });
    return () => { cancelled = true; };
  }, []));

  const handleSaveSections = useCallback(async (newHidden: string[]) => {
    setHiddenSections(newHidden);
    setShowSectionEditor(false);
    try { await api.patchSettings({ health_hidden_sections: newHidden }); } catch (_) {}
  }, []);

  const openSectionEditor = useCallback(() => setShowSectionEditor(true), []);
  const closeSectionEditor = useCallback(() => setShowSectionEditor(false), []);
  const closeTour = useCallback(() => setShowTour(false), []);
  const handleScroll = useCallback((e: any) => { scrollOffsetRef.current = e.nativeEvent.contentOffset.y; }, []);

  // Theme-dependent style objects memoized to avoid inline object allocation each render
  const rootBg = useMemo(() => ({ flex: 1, backgroundColor: theme.page }), [theme.page]);
  const emptyBg = useMemo(() => [rootStyles.center, { backgroundColor: theme.page }], [theme.page]);
  const emptyText = useMemo(() => [rootStyles.placeholder, { color: theme.textSoft }], [theme.textSoft]);
  const stickyHeader = useMemo(() => ({ backgroundColor: theme.page, padding: 12, paddingBottom: 4 }), [theme.page]);
  const contentContainer = useMemo(() => ({ flexGrow: 1, paddingBottom: Math.max(tourPadding, 32) }), [tourPadding]);

  if (!medication && !cycle) {
    return (
      <View style={emptyBg}>
        <ScreenBackground pageId="health_tab" />
        <Text style={emptyText}>
          No health modules enabled. Go to Settings → Customize Tabs to turn them on.
        </Text>
      </View>
    );
  }

  const effectiveTab: SubTab = bothEnabled ? activeSubTab : medication ? 'medication' : 'cycle';

  return (
    <View style={rootBg}>
      <ScreenBackground pageId="health_tab" />
      {bothEnabled && (
        <ScrollView
          ref={scrollViewRef}
          style={rootStyles.flex}
          contentContainerStyle={contentContainer}
          keyboardShouldPersistTaps="handled"
          stickyHeaderIndices={[0]}
          scrollEventThrottle={16}
          onScroll={handleScroll}
        >
          {/* Sticky overview blocks */}
          <View style={stickyHeader}>
            <View style={rootStyles.editRow}>
              <Pressable onPress={openSectionEditor} hitSlop={14} accessibilityLabel="Customize Health screen">
                <Ionicons name="pencil-outline" size={17} color={theme.textSoft} />
              </Pressable>
            </View>
            <View ref={tourOverviewRef}>
              <OverviewBlocks onNavigate={setActiveSubTab} activeSubTab={effectiveTab} theme={theme} hiddenSections={hiddenSections} />
            </View>
          </View>

          {/* Active sub-tab content — not full-screen scrollable, rendered inline */}
          <View ref={tourContentRef}>
            {effectiveTab === 'medication' && <MedicationList theme={theme} scrollEnabled={false} />}
            {effectiveTab === 'cycle' && !hiddenSections.includes('cycle_tab') && <CycleView theme={theme} />}
            {effectiveTab === 'symptoms' && !hiddenSections.includes('symptoms_tab') && <SymptomsView theme={theme} />}
          </View>
        </ScrollView>
      )}

      {!bothEnabled && (
        <>
          {medication && <MedicationList theme={theme} scrollEnabled={true} />}
          {cycle && !medication && !hiddenSections.includes('cycle_tab') && <CycleView theme={theme} />}
        </>
      )}

      <SectionEditorModal
        visible={showSectionEditor}
        title="Customize Health"
        sections={HEALTH_SECTIONS}
        hidden={hiddenSections}
        onSave={handleSaveSections}
        onCancel={closeSectionEditor}
      />
      <FeatureTour steps={healthTourSteps} visible={showTour} onDone={closeTour} scrollRef={scrollViewRef} scrollY={scrollOffsetRef.current} onExtraPadding={setTourPadding} />
      <FeatureIntroSheet intro={healthIntro} visible={introVisible} onClose={dismissIntro} />
    </View>
  );
}

const rootStyles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  placeholder: { fontSize: 14, textAlign: 'center', lineHeight: 22 },
  flex: { flex: 1 },
  editRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 4 },
});
