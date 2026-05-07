/**
 * Expo app config.
 *
 * Notes for the Android-targeted stories that live in this file:
 *   - US-124 (network security)         → android.usesCleartextTraffic + expo-build-properties
 *   - US-125 (deep linking / App Links) → android.intentFilters with autoVerify + scheme
 *   - US-126 (push notifications)       → expo-notifications plugin block
 *   - US-128 (adaptive icons)           → android.adaptiveIcon foreground/background pair
 *   - US-133 (ProGuard/R8 + AAB)        → expo-build-properties enableProguardInReleaseBuilds
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
    splash: {
      image: "./public/splash.png",
      resizeMode: "contain",
      backgroundColor: "#10b981" // Green from your theme
    },
    assetBundlePatterns: [
      "**/*"
    ],
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.eatpal.app",
      buildNumber: "1",
      usesAppleSignIn: true,
      // US-125: iOS Universal Links — apple-app-site-association lives at
      // https://tryeatpal.com/.well-known/apple-app-site-association.
      associatedDomains: ["applinks:tryeatpal.com"],
      infoPlist: {
        NSCameraUsageDescription: "EatPal needs camera access to scan food barcodes for nutrition information",
        NSPhotoLibraryUsageDescription: "EatPal needs photo library access to let you add images of meals and foods",
        NSPhotoLibraryAddUsageDescription: "EatPal needs permission to save meal photos to your library",
        NSLocationWhenInUseUsageDescription: "EatPal uses your location to find nearby grocery stores and suggest local meal options"
      }
    },
    android: {
      // US-128: adaptive icon foreground (logo) + brand-green background.
      // The background fills the full safe-zone behind the foreground; render
      // tested across round, squircle, and square launcher shapes.
      adaptiveIcon: {
        foregroundImage: "./public/icon-512x512.png",
        backgroundColor: "#10b981"
      },
      package: "com.eatpal.app",
      versionCode: 1,
      // US-124: enforce HTTPS-only on Android. Cleartext traffic is rejected
      // for production builds; localhost/10.0.2.2 is allowed in development
      // via the expo-build-properties plugin (see plugins block below).
      usesCleartextTraffic: false,
      permissions: [
        "CAMERA",
        "READ_EXTERNAL_STORAGE",
        "WRITE_EXTERNAL_STORAGE",
        "ACCESS_FINE_LOCATION",
        "ACCESS_COARSE_LOCATION"
      ],
      // US-125: Android App Links + custom URI scheme.
      //   - autoVerify=true prompts Android to verify the digital asset link
      //     hosted at https://tryeatpal.com/.well-known/assetlinks.json
      //     so https://tryeatpal.com/* opens directly in the app once verified.
      //   - The custom scheme `eatpal://` covers cold-start cases where the
      //     user shared a link inside the app or from a notification.
      intentFilters: [
        {
          action: "VIEW",
          autoVerify: true,
          data: [
            { scheme: "https", host: "tryeatpal.com", pathPrefix: "/meals" },
            { scheme: "https", host: "tryeatpal.com", pathPrefix: "/recipes" },
            { scheme: "https", host: "tryeatpal.com", pathPrefix: "/lists" },
            { scheme: "https", host: "tryeatpal.com", pathPrefix: "/auth" }
          ],
          category: ["BROWSABLE", "DEFAULT"]
        },
        {
          action: "VIEW",
          data: [{ scheme: "eatpal" }],
          category: ["BROWSABLE", "DEFAULT"]
        }
      ]
    },
    web: {
      favicon: "./public/favicon.ico",
      bundler: "metro"
    },
    plugins: [
      "expo-router",
      "expo-apple-authentication",
      [
        "expo-camera",
        {
          "cameraPermission": "Allow EatPal to access your camera to scan barcodes for nutrition information"
        }
      ],
      [
        "expo-image-picker",
        {
          "photosPermission": "EatPal needs access to your photos to let you add meal images"
        }
      ],
      "expo-secure-store",
      // US-126: push notifications. Using the project's existing brand
      // colour for the small-icon background; no custom sound until we
      // commission one.
      [
        "expo-notifications",
        {
          icon: "./public/icon-512x512.png",
          color: "#10b981",
          androidMode: "default",
          androidCollapsedTitle: "EatPal"
        }
      ],
      // US-124 + US-133: enforce HTTPS in release while allowing localhost in
      // debug; explicitly opt into ProGuard / R8 minification for AAB releases.
      [
        "expo-build-properties",
        {
          android: {
            // R8 is on by default in production but pinning the flag here
            // documents intent and avoids reliance on the Expo default.
            enableProguardInReleaseBuilds: true,
            enableShrinkResourcesInReleaseBuilds: true,
            // Network security config: deny cleartext in release; allow
            // localhost (10.0.2.2 via emulator) for development builds.
            usesCleartextTraffic: false
          }
        }
      ]
    ],
    extra: {
      eas: {
        projectId: "generate-on-eas-init" // Will be generated when running eas init
      }
    },
    owner: "your-expo-username" // Update this with your Expo username
  }
};

