/**
 * Expo Config Plugin: Android/Google Play Compliance
 *
 * Configures the Android build for Play Store compliance:
 * - Target SDK 35 (Android 15) - Required by Google Play as of August 2025
 * - Granular media permissions (READ_MEDIA_IMAGES, READ_MEDIA_VIDEO)
 * - Photo picker permission declarations
 * - Data Safety manifest entries
 * - Edge-to-edge display support
 *
 * References:
 * - https://developer.android.com/google/play/requirements/target-sdk
 * - https://developer.android.com/about/versions/14/behavior-changes-14
 * - https://developer.android.com/about/versions/15
 */
const { withAndroidManifest, withGradleProperties } = require('expo/config-plugins');

function withAndroidCompliance(config) {
  // Add Android manifest declarations
  config = withAndroidManifest(config, async (config) => {
    const manifest = config.modResults.manifest;

    // Ensure queries element exists for intent resolution (required Android 11+)
    if (!manifest.queries) {
      manifest.queries = [{}];
    }

    // Add data extraction rules meta-data for backup compliance
    const application = manifest.application?.[0];
    if (application) {
      if (!application['meta-data']) {
        application['meta-data'] = [];
      }

      // Google Play Data Safety - declare data handling
      const existingDataSafety = application['meta-data'].find(
        (m) => m.$?.['android:name'] === 'com.google.android.play.core.data_safety'
      );
      if (!existingDataSafety) {
        application['meta-data'].push({
          $: {
            'android:name': 'com.google.android.play.core.data_safety',
            'android:value': 'true',
          },
        });
      }

      // Opt-in to edge-to-edge enforcement (Android 15)
      application.$['android:enableOnBackInvokedCallback'] = 'true';
    }

    // Add granular media permissions for Android 13+ (API 33+)
    // These replace READ_EXTERNAL_STORAGE / WRITE_EXTERNAL_STORAGE
    const permissions = manifest['uses-permission'] || [];

    const addPermission = (name, maxSdk) => {
      const exists = permissions.find(p => p.$?.['android:name'] === name);
      if (!exists) {
        const perm = { $: { 'android:name': name } };
        if (maxSdk) {
          perm.$['android:maxSdkVersion'] = String(maxSdk);
        }
        permissions.push(perm);
      }
    };

    // Granular photo/video permissions (Android 13+)
    addPermission('android.permission.READ_MEDIA_IMAGES');
    addPermission('android.permission.READ_MEDIA_VIDEO');

    // Photo picker support (Android 14+)
    addPermission('android.permission.READ_MEDIA_VISUAL_USER_SELECTED');

    // Limit legacy storage permissions to older Android
    const legacyRead = permissions.find(
      p => p.$?.['android:name'] === 'android.permission.READ_EXTERNAL_STORAGE'
    );
    if (legacyRead) {
      legacyRead.$['android:maxSdkVersion'] = '32';
    }

    const legacyWrite = permissions.find(
      p => p.$?.['android:name'] === 'android.permission.WRITE_EXTERNAL_STORAGE'
    );
    if (legacyWrite) {
      legacyWrite.$['android:maxSdkVersion'] = '32';
    }

    // Foreground service type for camera (required Android 14+)
    addPermission('android.permission.FOREGROUND_SERVICE_CAMERA');

    // POST_NOTIFICATIONS for Android 13+ push notifications
    addPermission('android.permission.POST_NOTIFICATIONS');

    manifest['uses-permission'] = permissions;

    return config;
  });

  // Set target SDK and compile SDK to 35
  config = withGradleProperties(config, (config) => {
    const properties = config.modResults;

    // Set target SDK 35 (Android 15)
    const existingTarget = properties.find(p => p.key === 'android.targetSdkVersion');
    if (existingTarget) {
      existingTarget.value = '35';
    } else {
      properties.push({ type: 'property', key: 'android.targetSdkVersion', value: '35' });
    }

    // Set compile SDK 35
    const existingCompile = properties.find(p => p.key === 'android.compileSdkVersion');
    if (existingCompile) {
      existingCompile.value = '35';
    } else {
      properties.push({ type: 'property', key: 'android.compileSdkVersion', value: '35' });
    }

    return config;
  });

  return config;
}

module.exports = withAndroidCompliance;
