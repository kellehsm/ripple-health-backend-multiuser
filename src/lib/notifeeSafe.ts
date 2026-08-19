// Safe wrapper around @notifee/react-native. The native module is absent in
// Expo Go and throws at import time — this stubs it with no-ops so JS-only
// dev in Expo Go keeps working. Real EAS builds get the real module.
let mod: any = null;
try {
  mod = require("@notifee/react-native");
} catch {}

const STUB_RESULTS: Record<string, any> = {
  getDisplayedNotifications: [],
  getTriggerNotificationIds: [],
  getInitialNotification: null,
  requestPermission: { authorizationStatus: 0 },
  isBatteryOptimizationEnabled: false,
  createChannel: undefined,
};

const stub: any = new Proxy(
  {},
  {
    get: (_t, prop: string) => {
      if (prop === "onForegroundEvent") return () => () => {};
      if (prop === "onBackgroundEvent" || prop === "registerForegroundService") return () => {};
      return async () => STUB_RESULTS[prop];
    },
  }
);

const notifee: any = mod?.default ?? stub;
export default notifee;

export const AndroidImportance: any = mod?.AndroidImportance ?? { LOW: 2, DEFAULT: 3, HIGH: 4 };
export const TriggerType: any = mod?.TriggerType ?? { TIMESTAMP: 0, INTERVAL: 1 };
export const RepeatFrequency: any = mod?.RepeatFrequency ?? { NONE: -1, HOURLY: 0, DAILY: 1, WEEKLY: 2 };
export const AuthorizationStatus: any = mod?.AuthorizationStatus ?? { NOT_DETERMINED: -1, DENIED: 0, AUTHORIZED: 1 };
export const EventType: any = mod?.EventType ?? { PRESS: 1, ACTION_PRESS: 2 };
