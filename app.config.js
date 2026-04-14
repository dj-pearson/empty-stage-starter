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
      infoPlist: {
        NSCameraUsageDescription: "EatPal needs camera access to scan food barcodes for nutrition information",
        NSPhotoLibraryUsageDescription: "EatPal needs photo library access to let you add images of meals and foods",
        NSPhotoLibraryAddUsageDescription: "EatPal needs permission to save meal photos to your library",
        NSLocationWhenInUseUsageDescription: "EatPal uses your location to find nearby grocery stores and suggest local meal options"
      }
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./public/icon-512x512.png",
        backgroundColor: "#10b981"
      },
      package: "com.eatpal.app",
      versionCode: 1,
      permissions: [
        "CAMERA",
        "READ_EXTERNAL_STORAGE",
        "WRITE_EXTERNAL_STORAGE",
        "ACCESS_FINE_LOCATION",
        "ACCESS_COARSE_LOCATION",
        "USE_BIOMETRIC",
        "USE_FINGERPRINT",
        "VIBRATE",
        "RECEIVE_BOOT_COMPLETED",
        "INTERNET",
        "ACCESS_NETWORK_STATE"
      ],
      allowBackup: false, // Prevent token extraction via backup
      blockedPermissions: [
        "android.permission.READ_PHONE_STATE" // No phone state access needed
      ],
      intentFilters: [
        {
          action: "VIEW",
          autoVerify: true,
          data: [
            {
              scheme: "https",
              host: "tryeatpal.com",
              pathPrefix: "/app"
            }
          ],
          category: ["BROWSABLE", "DEFAULT"]
        },
        {
          action: "VIEW",
          data: [
            {
              scheme: "eatpal",
              host: "*"
            }
          ],
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
      [
        "expo-local-authentication",
        {
          "faceIDPermission": "Allow EatPal to use Face ID to unlock the app securely"
        }
      ],
      "expo-splash-screen"
    ],
    extra: {
      eas: {
        projectId: "generate-on-eas-init" // Will be generated when running eas init
      }
    },
    owner: "your-expo-username" // Update this with your Expo username
  }
};

