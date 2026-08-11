const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'android-widget');

const WIDGET_STRINGS_XML = `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <string name="widget_label">Ripple Wellness</string>
  <string name="widget_description">Glucose, steps, heart, water, sleep, meals &amp; a daily insight</string>
  <string name="widget_compact_label">Ripple Wellness Mini</string>
  <string name="widget_compact_description">Glucose, steps &amp; water at a glance</string>
</resources>`;

function withAndroidWidget(config) {
  // Copy native files into the generated Android project during prebuild
  config = withDangerousMod(config, [
    'android',
    (mod) => {
      const root = mod.modRequest.platformProjectRoot;
      const pkgName = mod.android?.package || 'com.kellehs.wellness';
      const pkgPath = pkgName.replace(/\./g, '/');

      const ktDir = path.join(root, `app/src/main/java/${pkgPath}`);
      fs.mkdirSync(ktDir, { recursive: true });
      // Rewrite package declaration to match the actual app package
      let ktContent = fs.readFileSync(path.join(SRC, 'RippleWidgetProvider.kt'), 'utf8');
      ktContent = ktContent.replace(/^package .+$/m, `package ${pkgName}`);
      // Inject the correct API base URL for this build profile (dev vs prod)
      const apiBaseUrl = (mod.extra?.apiBaseUrl ?? 'https://app.kels.gg/api').replace(/\/$/, '');
      ktContent = ktContent.replace(/private const val API = "[^"]*"/, `private const val API = "${apiBaseUrl}"`);
      // Rewrite the ACTION_REFRESH action string so it matches the manifest registration
      ktContent = ktContent.replace(/const val ACTION_REFRESH = "[^"]*"/, `const val ACTION_REFRESH = "${pkgName}.WIDGET_REFRESH"`);
      ktContent = ktContent.replace(/const val ACTION_LOG_WATER = "[^"]*"/, `const val ACTION_LOG_WATER = "${pkgName}.WIDGET_LOG_WATER"`);
      ktContent = ktContent.replace(/const val ACTION_NEXT_INSIGHT = "[^"]*"/, `const val ACTION_NEXT_INSIGHT = "${pkgName}.WIDGET_NEXT_INSIGHT"`);
      fs.writeFileSync(path.join(ktDir, 'RippleWidgetProvider.kt'), ktContent);

      let compactContent = fs.readFileSync(path.join(SRC, 'RippleCompactWidgetProvider.kt'), 'utf8');
      compactContent = compactContent.replace(/^package .+$/m, `package ${pkgName}`);
      fs.writeFileSync(path.join(ktDir, 'RippleCompactWidgetProvider.kt'), compactContent);

      const layoutDir = path.join(root, 'app/src/main/res/layout');
      fs.mkdirSync(layoutDir, { recursive: true });
      fs.copyFileSync(path.join(SRC, 'ripple_widget.xml'), path.join(layoutDir, 'ripple_widget.xml'));
      fs.copyFileSync(path.join(SRC, 'ripple_widget_insight_item.xml'), path.join(layoutDir, 'ripple_widget_insight_item.xml'));
      fs.copyFileSync(path.join(SRC, 'ripple_widget_preview.xml'), path.join(layoutDir, 'ripple_widget_preview.xml'));
      fs.copyFileSync(path.join(SRC, 'ripple_widget_compact.xml'), path.join(layoutDir, 'ripple_widget_compact.xml'));
      fs.copyFileSync(path.join(SRC, 'ripple_widget_compact_preview.xml'), path.join(layoutDir, 'ripple_widget_compact_preview.xml'));

      const drawableDir = path.join(root, 'app/src/main/res/drawable');
      fs.mkdirSync(drawableDir, { recursive: true });
      const drawables = [
        'ripple_widget_bg.xml',
        'ripple_chip_berry.xml',
        'ripple_chip_teal.xml',
        'ripple_chip_violet.xml',
        'ripple_chip_red.xml',
        'ripple_chip_blue.xml',
        'ripple_chip_coral.xml',
        'ripple_chip_sleep.xml',
        'ripple_btn_blue_round.xml',
        'ripple_logo.xml',
      ];
      drawables.forEach(f => fs.copyFileSync(path.join(SRC, f), path.join(drawableDir, f)));

      const xmlDir = path.join(root, 'app/src/main/res/xml');
      fs.mkdirSync(xmlDir, { recursive: true });
      fs.copyFileSync(path.join(SRC, 'ripple_widget_info.xml'), path.join(xmlDir, 'ripple_widget_info.xml'));
      fs.copyFileSync(path.join(SRC, 'ripple_widget_compact_info.xml'), path.join(xmlDir, 'ripple_widget_compact_info.xml'));

      const valuesDir = path.join(root, 'app/src/main/res/values');
      fs.mkdirSync(valuesDir, { recursive: true });
      fs.writeFileSync(path.join(valuesDir, 'widget_strings.xml'), WIDGET_STRINGS_XML);
      fs.copyFileSync(path.join(SRC, 'widget_colors.xml'), path.join(valuesDir, 'widget_colors.xml'));

      // Dark-mode palette: same color names, night-qualified values
      const nightDir = path.join(root, 'app/src/main/res/values-night');
      fs.mkdirSync(nightDir, { recursive: true });
      fs.copyFileSync(path.join(SRC, 'widget_colors.night.xml'), path.join(nightDir, 'widget_colors.xml'));

      return mod;
    },
  ]);

  // Register the AppWidgetProvider receiver in AndroidManifest.xml
  config = withAndroidManifest(config, (mod) => {
    const app = mod.modResults.manifest.application[0];
    if (!app.receiver) app.receiver = [];

    const pkgName = mod.android?.package || 'com.kellehs.wellness';
    const receivers = [
      { cls: `${pkgName}.RippleWidgetProvider`, label: '@string/widget_label', info: '@xml/ripple_widget_info' },
      { cls: `${pkgName}.RippleCompactWidgetProvider`, label: '@string/widget_compact_label', info: '@xml/ripple_widget_compact_info' },
    ];

    for (const { cls, label, info } of receivers) {
      const alreadyAdded = app.receiver.some((r) => r.$['android:name'] === cls);
      if (alreadyAdded) continue;
      app.receiver.push({
        $: {
          'android:name': cls,
          'android:exported': 'true',
          'android:label': label,
        },
        'intent-filter': [
          {
            action: [
              { $: { 'android:name': 'android.appwidget.action.APPWIDGET_UPDATE' } },
              { $: { 'android:name': `${pkgName}.WIDGET_REFRESH` } },
              { $: { 'android:name': `${pkgName}.WIDGET_LOG_WATER` } },
              { $: { 'android:name': `${pkgName}.WIDGET_NEXT_INSIGHT` } },
            ],
          },
        ],
        'meta-data': [
          {
            $: {
              'android:name': 'android.appwidget.provider',
              'android:resource': info,
            },
          },
        ],
      });
    }

    return mod;
  });

  return config;
}

module.exports = withAndroidWidget;
