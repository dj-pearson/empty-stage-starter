/**
 * EatPal - Expo Configuration
 *
 * This config is used ONLY for mobile builds (iOS/Android).
 * The web app uses Vite (vite.config.ts) and is completely isolated.
 *
 * Compliance:
 * - Apple: PrivacyInfo.xcprivacy via config plugin, ATT declarations, Required Reason APIs
 * - Google: Target SDK 35, granular permissions, Data Safety declarations
 */
export default {
  expo: {
    name: "EatPal",
    slug: "eatpal",
    version: "1.0.0",
    scheme: "eatpal",
    orientation: "portrait",
    icon: "./public/icon-512x512.png",
    userInterfaceStyle: "automatic",
    entryPoint: "./index.mobile.js",

    // New architecture (Fabric) support
    newArchEnabled: true,

    splash: {
      image: "./public/splash.png",
      resizeMode: "contain",
      backgroundColor: "#10b981",
    },

    assetBundlePatterns: [
      "public/**/*",
      "app/**/*",
    ],

    // ─── iOS Configuration ─────────────────────────────────────────
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.eatpal.app",
      buildNumber: "1",
      requireFullScreen: false,

      // iOS deployment target
      deploymentTarget: "16.0",

      // Apple privacy & permissions declarations
      infoPlist: {
        // Camera for barcode scanning
        NSCameraUsageDescription:
          "EatPal needs camera access to scan food barcodes for nutrition information.",

        // Photo library for meal photos
        NSPhotoLibraryUsageDescription:
          "EatPal needs photo library access to let you add images of meals and foods.",
        NSPhotoLibraryAddUsageDescription:
          "EatPal needs permission to save meal photos to your library.",

        // Location for nearby grocery stores
        NSLocationWhenInUseUsageDescription:
          "EatPal uses your location to find nearby grocery stores.",

        // App Tracking Transparency (ATT) - We don't track, but declare it
        NSUserTrackingUsageDescription:
          "EatPal does not track you across apps. This permission is requested for analytics opt-in only.",

        // Face ID for secure store
        NSFaceIDUsageDescription:
          "Use Face ID to securely access your EatPal account.",

        // Required for background data sync
        UIBackgroundModes: ["fetch", "remote-notification"],

        // Privacy Nutrition Label keys
        ITSAppUsesNonExemptEncryption: false,

        // Minimum iOS version
        MinimumOSVersion: "16.0",

        // Prevent screenshots of sensitive data
        UIApplicationSupportsIndirectInputEvents: true,
      },

      // Entitlements
      entitlements: {
        "aps-environment": "production",
        "com.apple.developer.applesignin": ["Default"],
      },

      // Associated domains for deep linking
      associatedDomains: [
        "applinks:tryeatpal.com",
        "webcredentials:tryeatpal.com",
      ],

      // Privacy manifest for required reason APIs (Apple 2024+ requirement)
      privacyManifests: {
        NSPrivacyAccessedAPITypes: [
          {
            NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryUserDefaults",
            NSPrivacyAccessedAPITypeReasons: ["CA92.1"],
          },
          {
            NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryFileTimestamp",
            NSPrivacyAccessedAPITypeReasons: ["C617.1"],
          },
          {
            NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategorySystemBootTime",
            NSPrivacyAccessedAPITypeReasons: ["35F9.1"],
          },
          {
            NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryDiskSpace",
            NSPrivacyAccessedAPITypeReasons: ["E174.1"],
          },
        ],
      },
    },

    // ─── Android Configuration ─────────────────────────────────────
    android: {
      adaptiveIcon: {
        foregroundImage: "./public/icon-512x512.png",
        backgroundColor: "#10b981",
      },
      package: "com.eatpal.app",
      versionCode: 1,

      // Permissions - using granular Android 13+ permissions
      permissions: [
        "CAMERA",
        "READ_MEDIA_IMAGES",
        "READ_MEDIA_VIDEO",
        "READ_MEDIA_VISUAL_USER_SELECTED",
        "ACCESS_FINE_LOCATION",
        "ACCESS_COARSE_LOCATION",
        "POST_NOTIFICATIONS",
        "VIBRATE",
      ],

      // Block list for permissions we do NOT want
      blockedPermissions: [
        "READ_EXTERNAL_STORAGE",
        "WRITE_EXTERNAL_STORAGE",
        "READ_PHONE_STATE",
        "READ_CONTACTS",
      ],

      // Intent filters for deep linking
      intentFilters: [
        {
          action: "VIEW",
          autoVerify: true,
          data: [
            { scheme: "https", host: "tryeatpal.com", pathPrefix: "/app" },
            { scheme: "eatpal" },
          ],
          category: ["BROWSABLE", "DEFAULT"],
        },
      ],

      // Android 12+ splash screen config
      splash: {
        image: "./public/splash.png",
        resizeMode: "contain",
        backgroundColor: "#10b981",
      },
    },

    // ─── Web Configuration ──────────────────────────────────────────
    // Web is handled entirely by Vite. This section is minimal.
    web: {
      favicon: "./public/favicon.ico",
      bundler: "metro",
    },

    // ─── Plugins ────────────────────────────────────────────────────
    plugins: [
      // File-based routing
      "expo-router",

      // Camera with barcode scanning
      [
        "expo-camera",
        {
          cameraPermission: "Allow EatPal to access your camera to scan barcodes for nutrition information.",
          microphonePermission: false,
        },
      ],

      // Image picker for meal photos
      [
        "expo-image-picker",
        {
          photosPermission: "EatPal needs access to your photos to let you add meal images.",
          cameraPermission: false,
        },
      ],

      // Secure storage for auth tokens
      "expo-secure-store",

      // Splash screen management
      "expo-splash-screen",

      // Apple Privacy Manifest generation
      "./app/plugins/withPrivacyManifest.js",

      // Android compliance (SDK 35, granular permissions)
      "./app/plugins/withAndroidCompliance.js",
    ],

    // ─── EAS Build Configuration ────────────────────────────────────
    extra: {
      eas: {
        projectId: "generate-on-eas-init",
      },
      // Environment variables accessible in the app via Constants.expoConfig.extra
      supabaseUrl: process.env.VITE_SUPABASE_URL || "https://api.tryeatpal.com",
      supabaseAnonKey: process.env.VITE_SUPABASE_ANON_KEY || "",
      sentryDsn: process.env.VITE_SENTRY_DSN || "",
    },

    owner: "your-expo-username",

    // ─── Updates Configuration (OTA) ────────────────────────────────
    updates: {
      fallbackToCacheTimeout: 0,
      url: "https://u.expo.dev/generate-on-eas-init",
    },

    // Runtime version policy for OTA updates
    runtimeVersion: {
      policy: "appVersion",
    },
  },
};
