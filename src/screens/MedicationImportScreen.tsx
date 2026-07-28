import React, { useState } from 'react';
import {
  View, Text, Pressable, ScrollView, StyleSheet, Alert, ActivityIndicator, Modal, FlatList, Linking,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useTheme } from '../theme/ThemeContext';
import { api } from '../api/client';
import { useNavigation } from '@react-navigation/native';
import { showErrorAlert } from '../utils/errorReport';

const TEMPLATE_URL = "https://app.kels.gg/api/medications/import/template";

const APP_FIELDS: Array<{ key: string; label: string }> = [
  { key: 'name',         label: 'Medication name' },
  { key: 'dosage',       label: 'Dosage / strength' },
  { key: 'schedule',     label: 'Schedule / frequency' },
  { key: 'prescriber',   label: 'Prescriber / doctor' },
  { key: 'pharmacy',     label: 'Pharmacy' },
  { key: 'notes',        label: 'Notes' },
  { key: 'brand_name',   label: 'Brand Name' },
  { key: 'generic_name', label: 'Generic Name' },
];

type Step = 'pick' | 'mapping' | 'done';

export function MedicationImportScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<any>();
  const ink = theme.ink;

  const [step, setStep] = useState<Step>('pick');
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importedCount, setImportedCount] = useState(0);

  // File data returned by preview
  const [fileHeaders, setFileHeaders] = useState<string[]>([]);
  const [fileRows, setFileRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string | null>>({});

  // Picker state
  const [pickerField, setPickerField] = useState<string | null>(null);

  async function pickFile() {
    setLoading(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'text/csv', 'text/comma-separated-values', 'application/csv', 'text/plain',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          '*/*',
        ],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      const ext = asset.name?.toLowerCase().split('.').pop() ?? '';
      if (!['csv', 'xls', 'xlsx'].includes(ext)) {
        Alert.alert('Wrong file type', 'Please select a .csv, .xls, or .xlsx file.');
        return;
      }

      const fileBase64 = await new File(asset.uri).base64();

      const res = await api.previewMedicationImport(fileBase64, asset.name ?? 'import.csv');
      if (!res?.headers?.length || !res.rows?.length) {
        Alert.alert(
          'No data found',
          'The file appears empty or malformed. Download the template to get started with the correct format.',
          [
            { text: 'Download Template', onPress: () => Linking.openURL(TEMPLATE_URL) },
            { text: 'OK', style: 'cancel' },
          ]
        );
        return;
      }

      setFileHeaders(res.headers);
      setFileRows(res.rows);
      setMapping(res.suggestedMapping ?? {});
      setStep('mapping');
    } catch (err: any) {
      showErrorAlert(
        'Could not read file',
        `${err?.message ?? 'Failed to read file'}\n\nTry downloading the template for the correct format.`,
        'MedicationImport file read',
        [{ text: 'Download Template', onPress: () => Linking.openURL(TEMPLATE_URL) }]
      );
    } finally {
      setLoading(false);
    }
  }

  async function commitImport() {
    if (!mapping.name) {
      Alert.alert('Medication name required', 'Please map the Medication name column to continue.');
      return;
    }
    setImporting(true);
    try {
      const res = await api.commitMedicationImport(fileRows, mapping);
      setImportedCount(res?.imported ?? 0);
      setStep('done');
    } catch (err: any) {
      showErrorAlert('Import failed', err?.message ?? 'Import failed', 'MedicationImport commit');
    } finally {
      setImporting(false);
    }
  }

  function reset() {
    setStep('pick');
    setFileHeaders([]);
    setFileRows([]);
    setMapping({});
  }

  // Column picker options — "None" + all file headers
  const pickerOptions = ['(None)', ...fileHeaders];

  return (
    <View style={[styles.container, { backgroundColor: theme.page }]}>

      {/* ── Pick file ── */}
      {step === 'pick' && (
        <View style={styles.centered}>
          <Text style={[styles.title, { color: theme.textStrong }]}>Import Medications</Text>
          <Text style={[styles.subtitle, { color: theme.textSoft }]}>
            Supports CSV, XLS, and XLSX files. Column names are detected automatically.
          </Text>
          <Pressable
            style={[styles.primaryBtn, { backgroundColor: theme.teal.solid, borderColor: ink, shadowColor: "rgba(60,40,20,0.1)" }]}
            onPress={pickFile}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Choose file…</Text>}
          </Pressable>
          <Pressable
            onPress={() => Linking.openURL(TEMPLATE_URL)}
            style={{ marginTop: 4 }}
          >
            <Text style={{ color: theme.teal.fg ?? theme.teal.solid, fontSize: 13, fontWeight: '700', textDecorationLine: 'underline' }}>
              Download blank template (.xlsx)
            </Text>
          </Pressable>
        </View>
      )}

      {/* ── Column mapping ── */}
      {step === 'mapping' && (
        <View style={{ flex: 1 }}>
          <View style={[styles.mappingHeader, { borderBottomColor: theme.cardBorder }]}>
            <Text style={[styles.mappingTitle, { color: theme.textStrong }]}>Map columns</Text>
            <Text style={[styles.mappingSubtitle, { color: theme.textSoft }]}>
              {fileRows.length} row{fileRows.length !== 1 ? 's' : ''} · tap any row to change mapping
            </Text>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 100 }}>
            {APP_FIELDS.map((field) => {
              const mapped = mapping[field.key];
              const isRequired = field.key === 'name';
              return (
                <Pressable
                  key={field.key}
                  onPress={() => setPickerField(field.key)}
                  style={[styles.mappingRow, { backgroundColor: theme.card, borderColor: mapped ? ink : theme.cardBorder }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.fieldLabel, { color: theme.textStrong }]}>
                      {field.label}{isRequired ? ' *' : ''}
                    </Text>
                    <Text style={[styles.mappedCol, { color: mapped ? theme.teal.fg : theme.textSoft }]}>
                      {mapped ?? '— not mapped'}
                    </Text>
                  </View>
                  <Text style={{ color: theme.textSoft, fontSize: 14 }}>▾</Text>
                </Pressable>
              );
            })}

            {/* Preview of first 3 rows */}
            <Text style={[styles.previewLabel, { color: theme.textSoft }]}>PREVIEW (first 3 rows)</Text>
            {fileRows.slice(0, 3).map((row, i) => {
              const name = row[mapping.name ?? ''] ?? '—';
              const dosage = row[mapping.dosage ?? ''] ?? '';
              const schedule = row[mapping.schedule ?? ''] ?? '';
              return (
                <View key={i} style={[styles.previewRow, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                  <Text style={[styles.previewName, { color: theme.textStrong }]}>{name}</Text>
                  {dosage ? <Text style={{ color: theme.textSoft, fontSize: 12 }}>{dosage}</Text> : null}
                  {schedule ? <Text style={{ color: theme.textSoft, fontSize: 12 }}>{schedule}</Text> : null}
                </View>
              );
            })}
          </ScrollView>

          <View style={[styles.footer, { borderTopColor: theme.cardBorder, backgroundColor: theme.page }]}>
            <Pressable style={[styles.secondaryBtn, { borderColor: ink }]} onPress={reset}>
              <Text style={{ color: theme.textStrong, fontWeight: '700' }}>Back</Text>
            </Pressable>
            <Pressable
              style={[styles.primaryBtn, { flex: 1, backgroundColor: theme.teal.solid, borderColor: ink, shadowColor: "rgba(60,40,20,0.1)" }]}
              onPress={commitImport}
              disabled={importing || !mapping.name}
            >
              {importing
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.primaryBtnText}>Import {fileRows.length} medication{fileRows.length !== 1 ? 's' : ''}</Text>
              }
            </Pressable>
          </View>
        </View>
      )}

      {/* ── Done ── */}
      {step === 'done' && (
        <View style={styles.centered}>
          <Text style={{ fontSize: 48, marginBottom: 16 }}>✅</Text>
          <Text style={[styles.title, { color: theme.textStrong }]}>Import complete!</Text>
          <Text style={[styles.subtitle, { color: theme.textSoft }]}>
            {importedCount} medication{importedCount !== 1 ? 's' : ''} added to your schedule.
          </Text>
          <Pressable
            style={[styles.primaryBtn, { backgroundColor: theme.teal.solid, borderColor: ink, shadowColor: "rgba(60,40,20,0.1)" }]}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.primaryBtnText}>Done</Text>
          </Pressable>
        </View>
      )}

      {/* ── Column picker modal ── */}
      <Modal visible={pickerField !== null} transparent animationType="slide" onRequestClose={() => setPickerField(null)}>
        <View style={styles.pickerOverlay}>
          <View style={[styles.pickerSheet, { backgroundColor: theme.card, borderColor: ink }]}>
            <Text style={[styles.pickerTitle, { color: theme.textStrong }]}>
              {APP_FIELDS.find((f) => f.key === pickerField)?.label ?? 'Select column'}
            </Text>
            <FlatList
              data={pickerOptions}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => {
                    setMapping((m) => ({ ...m, [pickerField!]: item === '(None)' ? null : item }));
                    setPickerField(null);
                  }}
                  style={[styles.pickerRow, { borderBottomColor: theme.cardBorder }]}
                >
                  <Text style={{ color: item === '(None)' ? theme.textSoft : theme.textStrong, fontSize: 15 }}>
                    {item}
                  </Text>
                  {mapping[pickerField ?? ''] === (item === '(None)' ? null : item) && (
                    <Text style={{ color: theme.teal.solid, fontWeight: '700' }}>✓</Text>
                  )}
                </Pressable>
              )}
            />
            <Pressable onPress={() => setPickerField(null)} style={[styles.pickerCancel, { borderTopColor: theme.cardBorder }]}>
              <Text style={{ color: theme.textSoft, fontWeight: '700' }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 },
  title: { fontSize: 22, fontWeight: '900', letterSpacing: -0.5, textAlign: 'center' },
  subtitle: { fontSize: 14, textAlign: 'center', lineHeight: 21 },
  primaryBtn: {
    borderWidth: 2,
    borderRadius: 22,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    shadowColor: "rgba(60,40,20,0.1)",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 4,
    minWidth: 160,
  },
  primaryBtnText: { color: '#fff', fontWeight: '900', fontSize: 15 },
  secondaryBtn: {
    borderWidth: 2,
    borderRadius: 22,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  mappingHeader: { padding: 16, borderBottomWidth: 1 },
  mappingTitle: { fontSize: 18, fontWeight: '900', letterSpacing: -0.5 },
  mappingSubtitle: { fontSize: 12, marginTop: 2 },
  mappingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 22,
    borderWidth: 1.5,
    gap: 10,
  },
  fieldLabel: { fontSize: 14, fontWeight: '700' },
  mappedCol: { fontSize: 12, marginTop: 2 },
  previewLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2, marginTop: 4 },
  previewRow: {
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    gap: 2,
  },
  previewName: { fontSize: 14, fontWeight: '600' },
  footer: { flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: 1 },
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  pickerSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 2,
    borderBottomWidth: 0,
    maxHeight: '60%',
  },
  pickerTitle: { fontSize: 16, fontWeight: '800', padding: 16, paddingBottom: 8 },
  pickerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  pickerCancel: {
    padding: 16,
    alignItems: 'center',
    borderTopWidth: 1,
  },
});
