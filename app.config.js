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
        "ACCESS_COARSE_LOCATION"
      ]
    },
    web: {
      favicon: "./public/favicon.ico",
      bundler: "metro"
    },
    plugins: [
      "expo-router",
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
      "expo-secure-store"
    ],
    extra: {
      eas: {
        projectId: "generate-on-eas-init" // Will be generated when running eas init
      }
    },
    owner: "your-expo-username" // Update this with your Expo username
  }
};

