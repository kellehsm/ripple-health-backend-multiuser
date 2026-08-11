const { withDangerousMod, withAppBuildGradle, withSettingsGradle, withProjectBuildGradle } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'wear-tile');

/**
 * Injects a Wear OS tile module (:wear) into the generated Android project.
 *
 * The wear APK is bundled with the phone APK via `wearApp project(':wear')`
 * so that Play Store automatically delivers it to paired Wear OS devices.
 */
function withWearOsTile(config) {
  // 1. Write the wear/ Gradle module during prebuild
  config = withDangerousMod(config, [
    'android',
    (mod) => {
      const root = mod.modRequest.platformProjectRoot;
      const pkgName = mod.android?.package || 'com.kellehs.wellness';
      const wearPkg = `${pkgName}.wear`;
      const wearPkgPath = wearPkg.replace(/\./g, '/');

      const wearRoot = path.join(root, 'wear');
      fs.mkdirSync(wearRoot, { recursive: true });

      // build.gradle — rewrite namespace + applicationId to match the phone package
      let gradle = fs.readFileSync(path.join(SRC, 'build.gradle'), 'utf8');
      gradle = gradle.replace(/namespace '[^']+'/g, `namespace '${wearPkg}'`);
      gradle = gradle.replace(/applicationId '[^']+'/g, `applicationId '${pkgName}'`);
      fs.writeFileSync(path.join(wearRoot, 'build.gradle'), gradle);

      const wearMainRoot = path.join(wearRoot, 'src/main');
      fs.mkdirSync(wearMainRoot, { recursive: true });
      fs.copyFileSync(path.join(SRC, 'AndroidManifest.xml'), path.join(wearMainRoot, 'AndroidManifest.xml'));

      const wearSrc = path.join(wearMainRoot, `java/${wearPkgPath}`);
      fs.mkdirSync(wearSrc, { recursive: true });
      const ktFiles = [
        'RippleWearMainActivity.kt',
        'RippleWearBreathingActivity.kt',
        'RippleWearTileService.kt',
        'WearCache.kt',
        'WearDataListenerService.kt',
      ];
      for (const f of ktFiles) {
        let content = fs.readFileSync(path.join(SRC, f), 'utf8');
        content = content.replace(/^package .+$/m, `package ${wearPkg}`);
        fs.writeFileSync(path.join(wearSrc, f), content);
      }

      const valuesDir = path.join(wearMainRoot, 'res/values');
      fs.mkdirSync(valuesDir, { recursive: true });
      fs.copyFileSync(path.join(SRC, 'strings.xml'), path.join(valuesDir, 'strings.xml'));

      const drawableDir = path.join(wearMainRoot, 'res/drawable');
      fs.mkdirSync(drawableDir, { recursive: true });
      fs.copyFileSync(path.join(SRC, 'tile_icon.xml'), path.join(drawableDir, 'tile_icon.xml'));
      fs.copyFileSync(path.join(SRC, 'tile_preview.xml'), path.join(drawableDir, 'tile_preview.xml'));

      // Reuse the phone app's launcher icon so the wear app doesn't 404 on @mipmap/ic_launcher
      const phoneMipmap = path.join(root, 'app/src/main/res');
      const wearRes = path.join(wearMainRoot, 'res');
      for (const density of ['mipmap-hdpi', 'mipmap-mdpi', 'mipmap-xhdpi', 'mipmap-xxhdpi', 'mipmap-xxxhdpi']) {
        const src = path.join(phoneMipmap, density);
        const dst = path.join(wearRes, density);
        if (fs.existsSync(src)) {
          fs.mkdirSync(dst, { recursive: true });
          for (const f of fs.readdirSync(src)) {
            if (f.startsWith('ic_launcher')) fs.copyFileSync(path.join(src, f), path.join(dst, f));
          }
        }
      }

      // Drop a phone-side helper that pushes glucose/steps/water to the Wearable Data Layer.
      // The main widget provider calls into this after each successful refresh.
      const phonePkgPath = pkgName.replace(/\./g, '/');
      const phoneJava = path.join(root, `app/src/main/java/${phonePkgPath}`);
      fs.mkdirSync(phoneJava, { recursive: true });
      const bridgeSrc = fs.readFileSync(path.join(SRC, 'WearDataBridge.kt.template'), 'utf8')
        .replace('__PACKAGE__', pkgName);
      fs.writeFileSync(path.join(phoneJava, 'WearDataBridge.kt'), bridgeSrc);

      return mod;
    },
  ]);

  // 2. Add ':wear' to settings.gradle
  config = withSettingsGradle(config, (mod) => {
    if (!mod.modResults.contents.includes("include ':wear'")) {
      mod.modResults.contents += "\ninclude ':wear'\n";
    }
    return mod;
  });

  // 3. Add wearApp dependency + play-services-wearable to the phone app's build.gradle
  config = withAppBuildGradle(config, (mod) => {
    let src = mod.modResults.contents;
    if (!src.includes("wearApp project(':wear')")) {
      src = src.replace(
        /dependencies\s*\{/,
        `dependencies {\n    wearApp project(':wear')\n    implementation 'com.google.android.gms:play-services-wearable:18.2.0'`
      );
    }
    mod.modResults.contents = src;
    return mod;
  });

  // 4. Make sure Google Maven repo is available (wear/protolayout libs live there)
  config = withProjectBuildGradle(config, (mod) => {
    // Expo templates already include google() but this is cheap insurance
    if (!mod.modResults.contents.includes('google()')) {
      mod.modResults.contents = mod.modResults.contents.replace(
        /allprojects\s*\{[\s\S]*?repositories\s*\{/,
        (m) => m + '\n        google()'
      );
    }
    return mod;
  });

  return config;
}

module.exports = withWearOsTile;
