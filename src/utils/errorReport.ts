import { Alert, Linking, Platform } from 'react-native';
import { api } from '../api/client';

const REPORT_EMAIL = 'kjsmyre@gmail.com';

const THANK_YOU_NOTE = [
  '',
  '---',
  'Thank you for taking the time to report this — it genuinely helps us make Ripple better.',
  'The Ripple Wellness team reviews every report and we really appreciate your support.',
  '',
  '— The Ripple Wellness Team',
].join('\n');

export async function reportError(message: string, context?: string): Promise<void> {
  let num: string | number = '???';
  try {
    const res: any = await api.submitErrorReport(message, context, Platform.OS);
    num = res?.report_number ?? '???';
  } catch { /* proceed without server report number */ }

  const subject = encodeURIComponent(`Ripple Error Report #${num}`);
  const body = encodeURIComponent(
    [
      `Report #${num}`,
      `Date: ${new Date().toLocaleString()}`,
      `Platform: ${Platform.OS}`,
      context ? `Context: ${context}` : null,
      ``,
      `Error: ${message}`,
      ``,
      `Additional notes:`,
      `(Please describe what you were doing when this error occurred)`,
      THANK_YOU_NOTE,
    ].filter((x) => x !== null).join('\n')
  );

  try {
    await Linking.openURL(`mailto:${REPORT_EMAIL}?subject=${subject}&body=${body}`);
    Alert.alert(
      'Thank you!',
      `Report #${num} has been created. Your email app should be open — just hit send whenever you're ready.\n\nThe Ripple Wellness team appreciates your feedback.`,
      [{ text: 'OK', style: 'cancel' }]
    );
  } catch {
    Alert.alert('Could not open email', `Please email ${REPORT_EMAIL} directly about this issue.`);
  }
}

export function showErrorAlert(
  title: string,
  message: string,
  context?: string,
  extraButtons?: Array<{ text: string; onPress?: () => void; style?: 'default' | 'cancel' | 'destructive' }>
): void {
  Alert.alert(title, message, [
    ...(extraButtons ?? []),
    {
      text: 'Report',
      onPress: () => void reportError(message, context ?? title),
    },
    { text: 'OK', style: 'cancel' },
  ]);
}
