const { withAndroidManifest } = require('@expo/config-plugins');

// Notifee v9 has no app.plugin.js, so autolinking handles its native code.
// Its AndroidManifest.xml declares foregroundServiceType="shortService" by default.
// This plugin adds the service entry to the app's manifest with tools:replace,
// so Gradle manifest merging overrides notifee's shortService with health.
module.exports = function withForegroundServiceType(config) {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults;
    const app = manifest.manifest.application[0];

    // Ensure tools namespace is declared on the manifest root
    if (!manifest.manifest.$['xmlns:tools']) {
      manifest.manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    }

    if (!app.service) app.service = [];

    const existing = app.service.find(
      (s) => s.$['android:name'] === 'app.notifee.core.ForegroundService'
    );

    if (existing) {
      existing.$['android:foregroundServiceType'] = 'health';
      existing.$['tools:replace'] = 'android:foregroundServiceType';
    } else {
      app.service.push({
        $: {
          'android:name': 'app.notifee.core.ForegroundService',
          'android:exported': 'false',
          'android:foregroundServiceType': 'health',
          'tools:replace': 'android:foregroundServiceType',
        },
      });
    }

    return mod;
  });
};
