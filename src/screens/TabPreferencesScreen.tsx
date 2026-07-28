import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Alert } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { ThemedIcon } from '../theme/iconRegistry';
import { useTabPreferences } from '../hooks/useTabPreferences';
import { ModuleId, MODULE_DEFINITIONS, TabPreferences, MAX_SELECTED_MODULES } from '../types/tabPreferences';

interface TabPreferencesScreenProps {
  onDone: () => void;
  /** 'onboarding' = single "Continue" CTA, no cancel. 'settings' = Save + Cancel. */
  mode: 'onboarding' | 'settings';
  onCancel?: () => void;
}

export function TabPreferencesScreen({ onDone, mode, onCancel }: TabPreferencesScreenProps) {
  const { theme } = useTheme();
  const { preferences, loading, save } = useTabPreferences();

  const [selected, setSelected] = useState<ModuleId[]>(preferences.selectedModules);
  const [medication, setMedication] = useState(preferences.health.medication);
  const [cycle, setCycle] = useState(preferences.health.cycle);

  // Sync once preferences finish loading (e.g. returning server data for settings mode)
  useEffect(() => {
    if (!loading) {
      setSelected(preferences.selectedModules);
      setMedication(preferences.health.medication);
      setCycle(preferences.health.cycle);
    }
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const healthSelected = selected.includes('health');

  function toggleModule(id: ModuleId) {
    setSelected((prev) => {
      if (prev.includes(id)) {
        if (id === 'health') { setMedication(false); setCycle(false); }
        return prev.filter((m) => m !== id);
      }
      if (prev.length >= MAX_SELECTED_MODULES) {
        Alert.alert('Limit reached', `You can select up to ${MAX_SELECTED_MODULES} modules.`);
        return prev;
      }
      return [...prev, id];
    });
  }

  function toggleHealthSub(which: 'medication' | 'cycle') {
    const current = which === 'medication' ? medication : cycle;
    const next = !current;
    which === 'medication' ? setMedication(next) : setCycle(next);

    const otherIsOn = which === 'medication' ? cycle : medication;
    if (!next && !otherIsOn) {
      setSelected((prev) => prev.filter((m) => m !== 'health'));
    }
    if (next && !healthSelected) {
      setSelected((prev) => [...prev, 'health']);
    }
  }

  async function handleConfirm() {
    if (healthSelected && !medication && !cycle) {
      Alert.alert('Pick at least one', 'Choose Medication, Cycle, or both — or turn off the Health tab.');
      return;
    }
    const next: TabPreferences = { selectedModules: selected, health: { medication, cycle } };
    await save(next);
    onDone();
  }

  const ink = theme.ink;

  return (
    <ScrollView
      style={{ backgroundColor: theme.page, flex: 1 }}
      contentContainerStyle={[styles.container, { paddingBottom: 40 }]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.title, { color: ink }]}>
        {mode === 'onboarding' ? 'Choose your tabs' : 'Manage tabs'}
      </Text>
      <Text style={[styles.subtitle, { color: theme.textSoft }]}>
        Pick up to {MAX_SELECTED_MODULES}. Change any time from Settings.
      </Text>

      <View style={styles.grid}>
        {MODULE_DEFINITIONS.map((mod) => {
          const isSelected = selected.includes(mod.id);
          return (
            <Pressable
              key={mod.id}
              onPress={() => toggleModule(mod.id)}
              style={[
                styles.tile,
                {
                  backgroundColor: isSelected ? theme.teal.tint : theme.card,
                  borderColor: isSelected ? theme.teal.solid : theme.cardBorder,
                  borderWidth: isSelected ? 2 : 1,
                  shadowColor: "rgba(60,40,20,0.1)",
                },
              ]}
            >
              <ThemedIcon slot={mod.iconSlot} size={22} />
              <Text style={[styles.tileLabel, { color: isSelected ? theme.teal.sub : theme.textStrong }]}>
                {mod.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {healthSelected && (
        <View style={[styles.subSection, { backgroundColor: theme.coral.tint, borderColor: theme.coral.sub }]}>
          <Text style={[styles.subSectionTitle, { color: theme.coral.sub }]}>Health tab includes:</Text>
          <Pressable
            style={[
              styles.subToggle,
              { backgroundColor: theme.card, borderColor: medication ? theme.coral.solid : theme.cardBorder, borderWidth: medication ? 2 : 1 },
            ]}
            onPress={() => toggleHealthSub('medication')}
          >
            <Text style={[styles.subToggleText, { color: theme.textStrong }]}>💊 Medication</Text>
          </Pressable>
          <Pressable
            style={[
              styles.subToggle,
              { backgroundColor: theme.card, borderColor: cycle ? theme.coral.solid : theme.cardBorder, borderWidth: cycle ? 2 : 1 },
            ]}
            onPress={() => toggleHealthSub('cycle')}
          >
            <Text style={[styles.subToggleText, { color: theme.textStrong }]}>🩸 Menstrual cycle</Text>
          </Pressable>
          <Text style={[styles.subSectionHint, { color: theme.textSoft }]}>
            If only one is on, the Health tab opens straight to it.
          </Text>
        </View>
      )}

      <Text style={[styles.count, { color: theme.textSoft }]}>
        {selected.length} of {MAX_SELECTED_MODULES} selected
      </Text>

      <View style={styles.actions}>
        {mode === 'settings' && onCancel && (
          <Pressable
            style={[styles.cancelBtn, { borderColor: ink, backgroundColor: theme.card, shadowColor: "rgba(60,40,20,0.1)" }]}
            onPress={onCancel}
          >
            <Text style={[styles.cancelBtnText, { color: ink }]}>Cancel</Text>
          </Pressable>
        )}
        <Pressable
          style={[styles.confirmBtn, { backgroundColor: theme.purple.solid, borderColor: ink, shadowColor: "rgba(60,40,20,0.1)" }]}
          onPress={handleConfirm}
        >
          <Text style={[styles.confirmBtnText, { color: theme.page }]}>
            {mode === 'onboarding' ? 'Continue  →' : 'Save'}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.8,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    marginBottom: 20,
    lineHeight: 19,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 4,
  },
  tile: {
    width: '47%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 22,
    shadowColor: "rgba(60,40,20,0.1)",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
  },
  tileEmoji: {
    fontSize: 20,
  },
  tileLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  subSection: {
    marginTop: 20,
    padding: 14,
    borderRadius: 22,
    borderWidth: 1.5,
    gap: 8,
  },
  subSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  subToggle: {
    padding: 12,
    borderRadius: 16,
  },
  subToggleText: {
    fontSize: 14,
    fontWeight: '500',
  },
  subSectionHint: {
    fontSize: 11,
    lineHeight: 16,
  },
  count: {
    fontSize: 12,
    marginTop: 18,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 22,
  },
  cancelBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 22,
    borderWidth: 2,
    alignItems: 'center',
    shadowColor: "rgba(60,40,20,0.1)",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  confirmBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 22,
    borderWidth: 2,
    alignItems: 'center',
    shadowColor: "rgba(60,40,20,0.1)",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  confirmBtnText: {
    fontSize: 14,
    fontWeight: '800',
  },
});
