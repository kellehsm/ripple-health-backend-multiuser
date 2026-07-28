const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const path = require('path');
const fs = require('fs');

const SHORTCUTS_XML = `<?xml version="1.0" encoding="utf-8"?>
<shortcuts xmlns:android="http://schemas.android.com/apk/res/android">
  <shortcut
      android:shortcutId="log_meal"
      android:enabled="true"
      android:icon="@mipmap/ic_launcher"
      android:shortcutShortLabel="@string/shortcut_log_meal_short"
      android:shortcutLongLabel="@string/shortcut_log_meal_long">
    <intent
        android:action="android.intent.action.VIEW"
        android:data="ripple://meals" />
  </shortcut>
  <shortcut
      android:shortcutId="log_water"
      android:enabled="true"
      android:icon="@mipmap/ic_launcher"
      android:shortcutShortLabel="@string/shortcut_log_water_short"
      android:shortcutLongLabel="@string/shortcut_log_water_long">
    <intent
        android:action="android.intent.action.VIEW"
        android:data="ripple://log-water" />
  </shortcut>
</shortcuts>`;

const SHORTCUT_STRINGS_XML = `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <string name="shortcut_log_meal_short">Log Meal</string>
  <string name="shortcut_log_meal_long">Log a Meal</string>
  <string name="shortcut_log_water_short">Log Water</string>
  <string name="shortcut_log_water_long">Log a Glass of Water</string>
</resources>`;

module.exports = function withAndroidShortcuts(config) {
  // Write shortcuts.xml and string resources during prebuild
  config = withDangerousMod(config, [
    'android',
    (mod) => {
      const root = mod.modRequest.platformProjectRoot;

      const xmlDir = path.join(root, 'app/src/main/res/xml');
      fs.mkdirSync(xmlDir, { recursive: true });
      fs.writeFileSync(path.join(xmlDir, 'shortcuts.xml'), SHORTCUTS_XML);

      const valuesDir = path.join(root, 'app/src/main/res/values');
      fs.mkdirSync(valuesDir, { recursive: true });
      fs.writeFileSync(path.join(valuesDir, 'shortcut_strings.xml'), SHORTCUT_STRINGS_XML);

      return mod;
    },
  ]);

  // Wire the shortcuts.xml to the main activity via meta-data
  config = withAndroidManifest(config, (mod) => {
    const activities = mod.modResults.manifest.application?.[0]?.activity ?? [];
    const main = activities.find((a) => a.$['android:name'] === '.MainActivity');
    if (main) {
      if (!main['meta-data']) main['meta-data'] = [];
      const already = main['meta-data'].find(
        (m) => m.$['android:name'] === 'android.app.shortcuts'
      );
      if (!already) {
        main['meta-data'].push({
          $: { 'android:name': 'android.app.shortcuts', 'android:resource': '@xml/shortcuts' },
        });
      }
    }
    return mod;
  });

  return config;
};
