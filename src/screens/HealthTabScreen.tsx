import React, { useState, useCallback, useRef } from 'react';
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

  const HEALTH_TOUR_STEPS: TourStep[] = [
    { ref: tourOverviewRef, title: "Health Hub", body: "Switch between Medications, Cycle tracking, and Symptoms using the tiles at the top." },
    { ref: tourContentRef,  title: "Medication Schedule", body: "See today's scheduled doses and your full medication list. Tap any med for details, dosage, and history." },
  ];

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

  async function handleSaveSections(newHidden: string[]) {
    setHiddenSections(newHidden);
    setShowSectionEditor(false);
    try { await api.patchSettings({ health_hidden_sections: newHidden }); } catch (_) {}
  }

  if (!medication && !cycle) {
    return (
      <View style={[rootStyles.center, { backgroundColor: theme.page }]}>
        <ScreenBackground pageId="health_tab" />
        <Text style={[rootStyles.placeholder, { color: theme.textSoft }]}>
          No health modules enabled. Go to Settings → Customize Tabs to turn them on.
        </Text>
      </View>
    );
  }

  const effectiveTab: SubTab = bothEnabled ? activeSubTab : medication ? 'medication' : 'cycle';

  return (
    <View style={{ flex: 1, backgroundColor: theme.page }}>
      <ScreenBackground pageId="health_tab" />
      {bothEnabled && (
        <ScrollView
          ref={scrollViewRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ flexGrow: 1, paddingBottom: tourPadding }}
          keyboardShouldPersistTaps="handled"
          stickyHeaderIndices={[0]}
          scrollEventThrottle={16}
          onScroll={(e) => { scrollOffsetRef.current = e.nativeEvent.contentOffset.y; }}
        >
          {/* Sticky overview blocks */}
          <View style={{ backgroundColor: theme.page, padding: 12, paddingBottom: 4 }}>
            <View style={{ flexDirection: "row", justifyContent: "flex-end", marginBottom: 4 }}>
              <Pressable onPress={() => setShowSectionEditor(true)} hitSlop={10} accessibilityLabel="Customize Health screen">
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
        onCancel={() => setShowSectionEditor(false)}
      />
      <FeatureTour steps={HEALTH_TOUR_STEPS} visible={showTour} onDone={() => setShowTour(false)} scrollRef={scrollViewRef} scrollY={scrollOffsetRef.current} onExtraPadding={setTourPadding} />
      <FeatureIntroSheet intro={healthIntro} visible={introVisible} onClose={dismissIntro} />
    </View>
  );
}

const rootStyles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  placeholder: { fontSize: 14, textAlign: 'center', lineHeight: 22 },
});
