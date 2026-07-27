import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useFocusEffect, useRoute } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeContext';
import { api } from '../api/client';
import { LoadingIndicator } from '../components/LoadingIndicator';

interface HistoryEntry {
  id: string;
  change_type: 'added' | 'dose_changed' | 'frequency_changed' | 'prescriber_changed' | 'stopped';
  old_value: string | null;
  new_value: string | null;
  reason: string | null;
  changed_by: string | null;
  changed_at: string;
}

const CHANGE_ICON: Record<string, string> = {
  added: '✅',
  dose_changed: '💊',
  frequency_changed: '🕐',
  prescriber_changed: '👨‍⚕️',
  stopped: '🛑',
};

const CHANGE_LABEL: Record<string, string> = {
  added: 'Added',
  dose_changed: 'Dose changed',
  frequency_changed: 'Schedule changed',
  prescriber_changed: 'Prescriber changed',
  stopped: 'Stopped',
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

export function MedicationHistoryScreen() {
  const { theme } = useTheme();
  const route = useRoute<any>();
  const { medicationId, medicationName } = route.params as { medicationId: string; medicationName: string };
  const ink = theme.ink;

  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    api.getMedicationHistory(medicationId)
      .then((rows) => setHistory(rows ?? []))
      .catch(() => setHistory([]))
      .finally(() => setLoading(false));
  }, [medicationId]));

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.page }]}>
        <LoadingIndicator />
      </View>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: theme.page }} contentContainerStyle={styles.content}>
      <Text style={[styles.medName, { color: theme.textStrong }]}>{medicationName}</Text>
      <Text style={[styles.subLabel, { color: theme.textSoft }]}>CHANGE HISTORY</Text>

      {history.length === 0 ? (
        <View style={styles.empty}>
          <Text style={{ fontSize: 32 }}>📋</Text>
          <Text style={[styles.emptyText, { color: theme.textSoft }]}>No changes recorded yet.</Text>
        </View>
      ) : (
        <View style={styles.timeline}>
          {history.map((entry, i) => (
            <View key={entry.id} style={styles.entryRow}>
              {/* Connector line */}
              <View style={styles.connector}>
                <Text style={styles.icon}>{CHANGE_ICON[entry.change_type] ?? '•'}</Text>
                {i < history.length - 1 && (
                  <View style={[styles.line, { backgroundColor: theme.cardBorder }]} />
                )}
              </View>

              <View style={[styles.entryCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                <View style={styles.entryHeader}>
                  <Text style={[styles.changeType, { color: theme.textStrong }]}>
                    {CHANGE_LABEL[entry.change_type] ?? entry.change_type}
                  </Text>
                  <Text style={[styles.date, { color: theme.textSoft }]}>{formatDate(entry.changed_at)}</Text>
                </View>

                {(entry.old_value || entry.new_value) && (
                  <View style={styles.valueRow}>
                    {entry.old_value && (
                      <Text style={[styles.oldValue, { color: theme.textSoft }]}>
                        {entry.old_value}
                      </Text>
                    )}
                    {entry.old_value && entry.new_value && (
                      <Text style={{ color: theme.textSoft, fontSize: 12 }}> → </Text>
                    )}
                    {entry.new_value && (
                      <Text style={[styles.newValue, { color: theme.textStrong }]}>
                        {entry.new_value}
                      </Text>
                    )}
                  </View>
                )}

                {entry.reason && (
                  <Text style={[styles.reason, { color: theme.textSoft }]}>Reason: {entry.reason}</Text>
                )}
                {entry.changed_by && (
                  <Text style={[styles.reason, { color: theme.textSoft }]}>By: {entry.changed_by}</Text>
                )}
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  medName: { fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
  subLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 0.6, textTransform: 'uppercase' },
  empty: { paddingTop: 48, alignItems: 'center', gap: 10 },
  emptyText: { fontSize: 14 },
  timeline: { gap: 0 },
  entryRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  connector: { alignItems: 'center', width: 28 },
  icon: { fontSize: 18, lineHeight: 24 },
  line: { width: 2, flex: 1, minHeight: 16, marginTop: 4, marginBottom: 4 },
  entryCard: {
    flex: 1,
    borderRadius: 22,
    borderWidth: 1,
    padding: 12,
    marginBottom: 12,
    gap: 4,
  },
  entryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  changeType: { fontSize: 13, fontWeight: '700', flex: 1 },
  date: { fontSize: 11, textAlign: 'right', flexShrink: 1 },
  valueRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  oldValue: { fontSize: 12, textDecorationLine: 'line-through' },
  newValue: { fontSize: 12, fontWeight: '600' },
  reason: { fontSize: 11, fontStyle: 'italic' },
});
