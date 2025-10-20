# EatPal Mobile App - Complete Expo Migration & Submission Plan

## 🎯 Objective
Migrate EatPal from Capacitor to Expo and submit to both iOS App Store and Google Play Store.

---

## 📋 Current State Analysis

**Current Setup:**
- ✅ Web app built with React + Vite
- ✅ Supabase backend integrated
- ✅ TypeScript codebase
- ⚠️ Capacitor installed (needs removal per best practices)
- ❌ No Expo configuration yet
- ❌ No EAS Build setup

**Target State:**
- ✅ Expo SDK 54 with React Native
- ✅ EAS Build configured for iOS and Android
- ✅ Platform-aware code throughout
- ✅ Production-ready mobile apps
- ✅ Submitted to both app stores

---

## 🚀 Implementation Phases

### Phase 1: Expo Setup & Capacitor Removal (Week 1)

#### Step 1.1: Remove Capacitor Dependencies
```bash
# Remove Capacitor packages
npm uninstall @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios @capacitor-community/barcode-scanner

# Remove Capacitor-specific scripts from package.json
# Delete capacitor.config.ts
```

#### Step 1.2: Install Expo Dependencies
```bash
# Install Expo SDK 54
npx expo install expo@~54.0.0

# Install core Expo packages
npx expo install react-native@0.81.4
npx expo install react@19.1.0 react-dom@19.1.0
npx expo install expo-router expo-linking expo-constants expo-status-bar

# Install navigation
npx expo install react-native-screens react-native-safe-area-context

# Install commonly needed Expo modules
npx expo install expo-camera          # For barcode scanning (replaces Capacitor)
npx expo install expo-image-picker    # For photo uploads
npx expo install expo-file-system     # For file management
npx expo install expo-secure-store    # For secure storage
npx expo install expo-splash-screen   # For splash screens

# Install EAS CLI globally
npm install -g eas-cli

# Login to Expo
eas login
```

#### Step 1.3: Create Expo Configuration Files

**`app.config.js`** (Dynamic configuration):
```javascript
export default {
  expo: {
    name: "EatPal",
    slug: "eatpal",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./public/icon-512x512.png",
    userInterfaceStyle: "automatic",
    splash: {
      image: "./public/splash.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff"
    },
    assetBundlePatterns: [
      "**/*"
    ],
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.eatpal.app",
      buildNumber: "1",
      infoPlist: {
        NSCameraUsageDescription: "EatPal needs camera access to scan barcodes for nutrition information",
        NSPhotoLibraryUsageDescription: "EatPal needs photo library access to let you add food images",
        NSLocationWhenInUseUsageDescription: "EatPal uses your location to find nearby grocery stores"
      }
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./public/icon-512x512.png",
        backgroundColor: "#ffffff"
      },
      package: "com.eatpal.app",
      versionCode: 1,
      permissions: [
        "CAMERA",
        "READ_EXTERNAL_STORAGE",
        "WRITE_EXTERNAL_STORAGE",
        "ACCESS_FINE_LOCATION"
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
          "cameraPermission": "Allow EatPal to access your camera to scan barcodes"
        }
      ]
    ],
    extra: {
      eas: {
        projectId: "YOUR_PROJECT_ID_HERE" // Will be generated
      }
    }
  }
};
```

**`eas.json`** (EAS Build configuration):
```json
{
  "cli": {
    "version": ">= 15.3.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "ios": {
        "simulator": true
      }
    },
    "preview": {
      "distribution": "internal",
      "channel": "preview",
      "ios": {
        "simulator": false
      },
      "android": {
        "buildType": "apk"
      }
    },
    "production": {
      "distribution": "store",
      "channel": "production",
      "autoIncrement": true
    }
  },
  "submit": {
    "production": {
      "ios": {
        "appleId": "YOUR_APPLE_ID@email.com",
        "ascAppId": "YOUR_APP_STORE_CONNECT_APP_ID",
        "appleTeamId": "YOUR_TEAM_ID"
      },
      "android": {
        "serviceAccountKeyPath": "./google-service-account.json",
        "track": "internal"
      }
    }
  }
}
```

**`metro.config.cjs`** (Metro bundler):
```javascript
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Add path aliases
config.resolver.alias = {
  '@': path.resolve(__dirname, 'src'),
};

// Support platform-specific extensions
config.resolver.sourceExts = ['expo.tsx', 'expo.ts', 'expo.js', 'tsx', 'ts', 'js', 'json'];

module.exports = config;
```

**`.easignore`**:
```
# Git
.git
.gitignore

# Dependencies
node_modules/.cache

# Build artifacts
dist
dist-ssr
build
.expo
.expo-shared

# Logs
*.log
logs

# OS
.DS_Store
Thumbs.db

# IDE
.vscode
.idea

# Testing
coverage
__tests__
*.test.ts
*.test.tsx
*.spec.ts
*.spec.tsx

# Docs (except README)
docs
*.md
!README.md

# Environment
.env.local
.env.*.local

# Large assets
public/assets/*.mp4
public/assets/*.mov

# Capacitor (being removed)
android/
ios/
capacitor.config.ts
```

#### Step 1.4: Update package.json Scripts
```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    
    "expo:start": "npx expo start",
    "expo:android": "npx expo start --android",
    "expo:ios": "npx expo start --ios",
    "expo:web": "npx expo start --web",
    
    "eas:build:ios:preview": "eas build --platform ios --profile preview",
    "eas:build:ios:production": "eas build --platform ios --profile production",
    "eas:build:android:preview": "eas build --platform android --profile preview",
    "eas:build:android:production": "eas build --platform android --profile production",
    "eas:build:all:preview": "eas build --platform all --profile preview",
    "eas:build:all:production": "eas build --platform all --profile production",
    
    "eas:submit:ios": "eas submit --platform ios",
    "eas:submit:android": "eas submit --platform android",
    
    "prebuild": "npx expo prebuild --clean"
  }
}
```

---

### Phase 2: Make Code Platform-Aware (Week 1-2)

#### Critical Files to Update:

**1. `src/contexts/AppContext.tsx`** - Make platform-safe:
```typescript
import { Platform } from 'react-native';

const isWeb = Platform.OS === 'web';

// Replace window references
const redirectToAuth = () => {
  if (isWeb && typeof window !== 'undefined') {
    window.location.href = '/auth';
  } else {
    // Use expo-router navigation
    router.push('/auth');
  }
};
```

**2. `src/hooks/use-mobile.tsx`** - Add React Native detection:
```typescript
import { Platform, useWindowDimensions } from 'react-native';

export const useIsMobile = () => {
  const { width } = useWindowDimensions();
  
  // On native, always consider mobile
  if (Platform.OS !== 'web') {
    return true;
  }
  
  // On web, check width
  return width < 768;
};
```

**3. Replace Capacitor Barcode Scanner:**
```typescript
// Old: @capacitor-community/barcode-scanner
// New: expo-camera

import { Camera } from 'expo-camera';

const BarcodeScanner = () => {
  const [hasPermission, setHasPermission] = useState(null);
  
  useEffect(() => {
    (async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
    })();
  }, []);
  
  // ... scanner implementation
};
```

---

### Phase 3: Create Mobile Entry Point (Week 2)

**Create `App.tsx`** (Expo entry point):
```typescript
import 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/components/ThemeProvider';
import { AppProvider } from '@/contexts/AppContext';
import { Router } from './app/_layout';

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppProvider>
          <Router />
          <StatusBar style="auto" />
        </AppProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
```

**Create `app/_layout.tsx`** (Expo Router layout):
```typescript
import { Stack } from 'expo-router';
import { useColorScheme } from 'react-native';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: {
          backgroundColor: colorScheme === 'dark' ? '#000' : '#fff'
        }
      }}
    />
  );
}
```

**Create mobile screens in `app/` directory:**
- `app/index.tsx` - Home/Landing
- `app/dashboard.tsx` - Dashboard
- `app/planner.tsx` - Meal Planner
- `app/pantry.tsx` - Pantry Management
- `app/auth.tsx` - Authentication
- etc.

---

### Phase 4: Create App Assets (Week 2)

#### Required Assets:

**Icon (1024x1024px):**
- `public/icon-1024x1024.png` - App Store icon
- `public/icon-512x512.png` - Android adaptive icon

**Splash Screen:**
- `public/splash.png` - 1284x2778px (iPhone 13 Pro Max)

**Adaptive Icon (Android):**
- Foreground: 1024x1024px with safe zone
- Background: Solid color or simple pattern

**Asset Generator Commands:**
```bash
# Use Expo's asset generator
npx expo-asset-generator --icon ./design/icon-source.png
```

---

### Phase 5: Configure App Store Connect (Week 3)

#### iOS App Store Setup:

1. **Create App Store Connect App:**
   - Go to https://appstoreconnect.apple.com
   - Apps → + → New App
   - Bundle ID: `com.eatpal.app`
   - Name: "EatPal"
   - Primary Language: English
   - SKU: `eatpal-001`

2. **App Information:**
   - Privacy Policy URL: `https://tryeatpal.com/privacy`
   - Category: Health & Fitness
   - Subcategory: Diet & Nutrition
   - Age Rating: 4+

3. **App Store Metadata:**
   - **Name:** EatPal - Meal Planner for Picky Eaters
   - **Subtitle:** Plan meals, track nutrition, expand food choices
   - **Description:**
     ```
     EatPal helps parents of picky eaters create balanced meal plans, 
     track safe foods, and gradually introduce new foods using 
     evidence-based techniques.

     KEY FEATURES:
     • AI-powered meal planning
     • Allergen-safe food database
     • Visual meal calendar
     • Grocery list generation
     • Progress tracking
     • Food chaining recommendations
     ```
   - **Keywords:** meal planning, picky eater, nutrition, kids meals, allergen free, meal tracker
   - **Screenshots:** 6.5" iPhone (required), 12.9" iPad (optional)

#### Google Play Setup:

1. **Create Google Play Console App:**
   - Go to https://play.google.com/console
   - All apps → Create app
   - Name: "EatPal - Meal Planner"
   - Package: `com.eatpal.app`
   - Category: Health & Fitness

2. **Store Listing:**
   - **Short description** (80 chars):
     "Meal planning for picky eaters with allergen safety and nutrition tracking"
   
   - **Full description** (4000 chars):
     Similar to iOS description above
   
   - **Screenshots:** Phone (at least 2), Tablet (optional)
   - **Feature Graphic:** 1024x500px
   - **App Icon:** 512x512px

---

### Phase 6: First Build (Week 3)

#### Pre-Build Checklist:
```bash
# 1. Verify versions
npx expo install --check

# 2. Fix any mismatches
npx expo install --fix

# 3. Test config
npx expo config

# 4. Test local start
npx expo start

# 5. Configure EAS project
eas init
```

#### Build Commands:

**iOS Preview Build:**
```bash
eas build --platform ios --profile preview --non-interactive
```

**Android Preview Build:**
```bash
eas build --platform android --profile preview --non-interactive
```

**Both Platforms:**
```bash
eas build --platform all --profile preview
```

---

### Phase 7: Production Builds & Submission (Week 4)

#### iOS Production:

```bash
# Build
eas build --platform ios --profile production

# Wait for build to complete (~10-15 minutes)
# Download IPA or proceed to submit

# Submit to App Store
eas submit --platform ios --latest
```

#### Android Production:

```bash
# Build AAB (Android App Bundle)
eas build --platform android --profile production

# Submit to Google Play
eas submit --platform android --latest
```

---

## 📦 App Store Requirements

### iOS App Store:

**Required:**
- [ ] Apple Developer Account ($99/year)
- [ ] App Store Connect app created
- [ ] Bundle Identifier: `com.eatpal.app`
- [ ] Privacy Policy URL
- [ ] App Icon (1024x1024px)
- [ ] Screenshots (6.5" iPhone)
- [ ] App Description
- [ ] Age Rating questionnaire
- [ ] Export Compliance information

**Timeline:**
- Review time: 24-48 hours (typically)
- Approval: ~2-3 days average

### Google Play Store:

**Required:**
- [ ] Google Play Developer Account ($25 one-time)
- [ ] Google Play Console app created
- [ ] Package Name: `com.eatpal.app`
- [ ] Privacy Policy URL
- [ ] App Icon (512x512px)
- [ ] Feature Graphic (1024x500px)
- [ ] Screenshots (at least 2)
- [ ] Content Rating questionnaire
- [ ] Target Audience

**Timeline:**
- Review time: Few hours to few days
- Approval: ~1-3 days average

---

## 🎨 Design Assets Needed

### App Icons:
- [ ] 1024x1024px PNG (iOS App Store)
- [ ] 512x512px PNG (Android Play Store)
- [ ] Adaptive icon foreground (Android)
- [ ] Adaptive icon background (Android)

### Splash Screen:
- [ ] 1284x2778px PNG (iPhone 13 Pro Max)
- [ ] Simple design, logo centered

### Screenshots:
- [ ] iPhone 6.5" (2778x1284px) - 6-10 images
- [ ] Android Phone (1080x1920px) - 2-8 images
- [ ] iPad 12.9" (optional) - 6-10 images
- [ ] Android Tablet (optional) - 2-8 images

### Feature Graphic (Android):
- [ ] 1024x500px PNG
- [ ] Showcases app name and key feature

---

## 🔧 Technical Requirements

### Environment Variables:

Create `.env` file:
```env
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

### Permissions Needed:

**iOS (`app.config.js` → ios.infoPlist):**
- Camera (barcode scanning)
- Photo Library (food images)
- Location (nearby stores) - optional

**Android (`app.config.js` → android.permissions):**
- CAMERA
- READ_EXTERNAL_STORAGE
- WRITE_EXTERNAL_STORAGE
- ACCESS_FINE_LOCATION - optional

---

## 📊 Testing Plan

### Phase 1: Local Testing
```bash
# Web testing
npm run dev

# iOS Simulator
npx expo start --ios

# Android Emulator
npx expo start --android
```

### Phase 2: Internal Testing
```bash
# Build preview versions
eas build --platform all --profile preview

# Install on physical devices via QR code
```

### Phase 3: TestFlight / Internal Testing
- iOS: TestFlight (up to 100 users)
- Android: Internal testing track (up to 100 users)

### Phase 4: Beta Testing
- iOS: TestFlight External testing
- Android: Open testing or Closed testing

---

## 🚨 Common Issues & Solutions

### Build Failures:

**Issue:** "Unable to resolve module react-router-dom"
```typescript
// Solution: Make imports platform-aware
import { Platform } from 'react-native';

let useNavigate: any = () => ({});
if (Platform.OS === 'web') {
  const ReactRouterDOM = require('react-router-dom');
  useNavigate = ReactRouterDOM.useNavigate;
}
```

**Issue:** Version mismatches
```bash
# Solution: Use expo install
npx expo install --fix
```

**Issue:** Missing assets
```bash
# Solution: Verify paths in app.config.js
# Ensure files exist at specified paths
```

### Submission Issues:

**iOS: Missing Privacy Manifest**
- Add privacy declarations in `app.config.js`

**Android: Missing API declarations**
- Complete Data Safety form in Play Console

---

## 📅 Timeline Summary

| Week | Phase | Key Deliverables |
|------|-------|------------------|
| 1 | Setup | Expo installed, Capacitor removed, configs created |
| 2 | Code Migration | Platform-aware code, mobile entry point, screens |
| 3 | Assets & Build | Icons, splash, first preview builds |
| 4 | Submission | Production builds, store submissions |

**Total Time:** 4 weeks to first submission

---

## ✅ Success Checklist

Before submitting:
- [ ] All Capacitor code removed
- [ ] Expo SDK 54 installed
- [ ] All code is platform-aware
- [ ] Assets created (icons, splash)
- [ ] App Store Connect app created (iOS)
- [ ] Google Play Console app created (Android)
- [ ] Privacy policy published
- [ ] Tested on physical devices
- [ ] Preview builds successful
- [ ] Production builds successful
- [ ] Store metadata complete
- [ ] Screenshots uploaded

---

## 📞 Support Resources

- **Expo Docs:** https://docs.expo.dev
- **EAS Build:** https://docs.expo.dev/build/introduction/
- **App Store Connect:** https://developer.apple.com/app-store-connect/
- **Google Play Console:** https://support.google.com/googleplay/android-developer

---

**Next Steps:**
1. Review this plan
2. Confirm app name, bundle IDs, and branding
3. Begin Phase 1: Expo Setup
4. Follow the plan week by week

---

**Status:** ✅ Plan Complete - Ready to Execute
**Last Updated:** January 10, 2025
**Est. Completion:** 4 weeks from start

