import { registerRootComponent } from 'expo';
import notifee, { EventType } from '@notifee/react-native';
import App from './App';
import { registerForegroundServiceHandler } from './src/lib/foregroundService';
import { api } from './src/api/client';

// Must be called before registerRootComponent so notifee's headless handler
// is registered before any notification can trigger it.
registerForegroundServiceHandler();

// Handle action-button presses on smart reminders when the app is in the background.
// Actions with launchActivity:'default' open the app — the foreground handler in App.tsx
// handles navigation from there. Actions without launchActivity run here only.
notifee.onBackgroundEvent(async ({ type, detail }) => {
  if (type !== EventType.ACTION_PRESS) return;

  const actionId = detail.pressAction?.id ?? "";
  const notifId = detail.notification?.id;

  // "Drink 1 Glass" — log water silently without opening the app
  if (actionId === "log-water") {
    try {
      const metric = await api.getOrCreateWaterMetric();
      if (metric?.id) await api.logWater(metric.id);
    } catch (_) {}
    if (notifId) await notifee.cancelNotification(notifId);
    return;
  }

  // All other dismiss/skip/ack actions — cancel the notification
  if (notifId) await notifee.cancelNotification(notifId);
});

registerRootComponent(App);
