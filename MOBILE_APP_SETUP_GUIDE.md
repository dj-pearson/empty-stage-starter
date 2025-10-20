# 📱 EatPal Mobile App Setup Guide

**Complete guide to building and submitting EatPal to iOS App Store and Google Play Store**

---

## 🎯 Quick Start

### Prerequisites

1. **Node.js** 18+ installed
2. **npm** or **yarn** installed
3. **Expo account** (free) - Sign up at https://expo.dev
4. **Apple Developer Account** ($99/year) - For iOS
5. **Google Play Developer Account** ($25 one-time) - For Android

### Initial Setup (5 minutes)

```bash
# 1. Install EAS CLI globally
npm install -g eas-cli

# 2. Login to Expo
eas login

# 3. Remove Capacitor (following best practices)
npm uninstall @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios @capacitor-community/barcode-scanner
rm capacitor.config.ts

# 4. Install Expo dependencies
npx expo install expo@~54.0.0
npx expo install react-native@0.81.4
npx expo install react@19.1.0 react-dom@19.1.0
npx expo install expo-router expo-linking expo-constants expo-status-bar
npx expo install react-native-screens react-native-safe-area-context
npx expo install expo-camera expo-image-picker expo-file-system expo-secure-store

# 5. Initialize EAS project
eas init

# 6. Configure project (updates app.config.js with project ID)
npx expo config

# 7. Test local setup
npx expo start
```

---

## 📋 Configuration Files Created

All configuration files have been created for you:

✅ **`app.config.js`** - Expo app configuration  
✅ **`eas.json`** - EAS Build profiles  
✅ **`metro.config.cjs`** - Metro bundler config  
✅ **`.easignore`** - Files to exclude from builds  

### What You Need to Update:

#### 1. In `app.config.js`:
```javascript
// Line 45: Update with your Expo username
owner: "YOUR_EXPO_USERNAME"

// Line 42: Will be auto-generated when you run eas init
extra: {
  eas: {
    projectId: "YOUR_PROJECT_ID"
  }
}
```

#### 2. In `eas.json`:
```json
// Only needed when submitting to stores
"submit": {
  "production": {
    "ios": {
      "appleId": "your.email@example.com",
      "ascAppId": "1234567890",
      "appleTeamId": "ABCD123456"
    }
  }
}
```

---

## 🎨 Required Assets

### Current Status:

❌ **App Icon** - Need to create `public/icon-512x512.png`  
❌ **Splash Screen** - Need to create `public/splash.png`  
✅ **Favicon** - Already exists (can be used as temporary icon)

### Asset Requirements:

#### App Icon (`public/icon-512x512.png`):
- **Size:** 512x512px (will be scaled to 1024x1024 for iOS)
- **Format:** PNG with no transparency
- **Design:** Simple, recognizable, works at all sizes
- **Colors:** Use brand colors (#10b981 green)

#### Splash Screen (`public/splash.png`):
- **Size:** 1284x2778px (iPhone 13 Pro Max)
- **Design:** Logo centered with brand color background
- **Safe Area:** Keep elements in center 1000x2000px

### Quick Asset Generation:

```bash
# Option 1: Use Figma template
# Download from: https://www.figma.com/community/file/1155362909441341285

# Option 2: Use Canva
# Search for "App Icon" and "Splash Screen" templates

# Option 3: Use existing Logo-Green.png and scale
# (Requires ImageMagick or similar)
convert public/Logo-Green.png -resize 512x512 -background white -gravity center -extent 512x512 public/icon-512x512.png
```

---

## 🚀 Build Process

### Testing Locally (Do This First!)

```bash
# 1. Verify configuration
npx expo config

# 2. Check for version issues
npx expo install --check

# 3. Fix any mismatches
npx expo install --fix

# 4. Start Expo dev server
npx expo start

# 5. Test on:
# - Press 'w' for web
# - Press 'a' for Android simulator
# - Press 'i' for iOS simulator
# - Scan QR code with Expo Go app on physical device
```

### Preview Builds (Internal Testing)

```bash
# iOS Preview (APK that can be installed on simulator)
npm run eas:build:ios:preview

# Android Preview (APK that can be installed directly)
npm run eas:build:android:preview

# Both platforms
npm run eas:build:all:preview
```

**Build Time:** ~10-15 minutes per platform

**Where to Find Builds:**
- Dashboard: https://expo.dev/accounts/[YOUR_USERNAME]/projects/eatpal/builds
- Download links provided in terminal
- QR codes for installing on devices

### Production Builds (For Store Submission)

```bash
# iOS Production (IPA for App Store)
npm run eas:build:ios:production

# Android Production (AAB for Google Play)
npm run eas:build:android:production

# Both platforms
npm run eas:build:all:production
```

---

## 🍎 iOS App Store Submission

### Step 1: Create App in App Store Connect

1. Go to https://appstoreconnect.apple.com
2. Click **My Apps** → **+** → **New App**
3. Fill in details:
   - **Platform:** iOS
   - **Name:** EatPal
   - **Primary Language:** English (U.S.)
   - **Bundle ID:** com.eatpal.app (select from dropdown)
   - **SKU:** eatpal-001
   - **User Access:** Full Access

### Step 2: Prepare App Information

**Required Information:**
- **Privacy Policy URL:** https://tryeatpal.com/privacy
- **Category:** Health & Fitness
- **Subcategory:** Diet & Nutrition
- **Age Rating:** Complete questionnaire (likely 4+)

**App Store Listing:**
- **Name:** EatPal - Meal Planner for Picky Eaters
- **Subtitle:** Plan meals, track nutrition, expand food choices
- **Promotional Text:** (160 chars) Update anytime without review
- **Description:** (4000 chars max)
  ```
  EatPal is the complete meal planning solution for parents of picky eaters. 
  Our AI-powered platform helps you create balanced, allergen-safe meal plans 
  while gradually introducing new foods using evidence-based techniques.
  
  KEY FEATURES:
  • AI-Powered Meal Planning - Generate weekly meal plans tailored to your child
  • Allergen Safety - Never suggests foods your child is allergic to
  • Visual Meal Calendar - Drag-and-drop meal planning interface
  • Smart Grocery Lists - Auto-generated from your meal plans
  • Progress Tracking - Monitor food acceptance and nutrition goals
  • Food Chaining - Suggests similar foods to expand diet safely
  • Nutrition Analysis - Track macros, vitamins, and dietary balance
  
  PERFECT FOR:
  • Parents of picky eaters (ages 1-18)
  • Managing food allergies and sensitivities
  • Expanding limited diets
  • Tracking nutrition goals
  • Reducing mealtime stress
  
  EVIDENCE-BASED APPROACH:
  Based on pediatric feeding research and validated assessment tools. 
  Uses repeated exposure techniques and food similarity mapping to 
  help children accept new foods naturally.
  
  SAFETY FIRST:
  • Triple-verified allergen filtering
  • Integrates with Open Food Facts database
  • HIPAA-like data privacy
  • No food suggestions without safety checks
  
  Download EatPal today and transform mealtime from stressful to successful!
  ```
- **Keywords:** (100 chars) meal planning, picky eater, nutrition, kids meals, allergen free
- **Support URL:** https://tryeatpal.com/support
- **Marketing URL:** https://tryeatpal.com

**Screenshots:** (Required - 6.5" iPhone)
- Need 6-10 screenshots showing:
  1. Home/Dashboard
  2. Meal Planner Calendar
  3. Food Selection
  4. Nutrition Tracking
  5. Recipe Builder
  6. Progress/Analytics

### Step 3: Submit Build

```bash
# Build and submit in one command
npm run eas:build:ios:production
npm run eas:submit:ios

# Or submit existing build manually via App Store Connect
```

### Step 4: Wait for Review

**Timeline:**
- Upload: ~10-15 minutes (build)
- Review Queue: 24-48 hours typically
- Review Process: Few hours to 2 days
- **Total: 2-4 days average**

---

## 🤖 Google Play Store Submission

### Step 1: Create App in Google Play Console

1. Go to https://play.google.com/console
2. Click **All apps** → **Create app**
3. Fill in details:
   - **App name:** EatPal - Meal Planner
   - **Default language:** English (United States)
   - **App or game:** App
   - **Free or paid:** Free
   - **Declarations:** Complete all checkboxes

### Step 2: Prepare Store Listing

**Main Store Listing:**
- **App name:** EatPal - Meal Planner
- **Short description:** (80 chars)
  ```
  Meal planning for picky eaters with allergen safety and nutrition tracking
  ```
- **Full description:** (4000 chars) - Use same as iOS
- **App icon:** 512x512px PNG
- **Feature graphic:** 1024x500px PNG (required)
- **Screenshots:** 
  - Phone: At least 2 (up to 8)
  - Tablet: Optional
  - Sizes: 1080x1920px or similar

**Categorization:**
- **App category:** Health & Fitness
- **Tags:** Nutrition, Meal Planning, Health

**Contact details:**
- **Email:** support@tryeatpal.com
- **Website:** https://tryeatpal.com
- **Privacy policy:** https://tryeatpal.com/privacy

### Step 3: Content Rating

1. Click **Content rating** → **Start questionnaire**
2. Select **Utility, productivity, communication, or other**
3. Answer questions (likely get EVERYONE rating)
4. Submit

### Step 4: App Content

Complete:
- **Privacy Policy** - Link to your policy
- **Ads** - Select "No, my app doesn't contain ads"
- **Data safety** - Fill out data collection form
- **Target audience** - Ages 1-18 (parenting app)

### Step 5: Submit Build

```bash
# Build and submit
npm run eas:build:android:production
npm run eas:submit:android
```

**Note:** First time requires creating a service account JSON key:
1. Google Cloud Console → Create Service Account
2. Grant "Service Account User" role
3. Create and download JSON key
4. Save as `google-service-account.json`
5. Reference in eas.json (already configured)

### Step 6: Release

1. **Internal testing** track (first release)
2. Review and test (1-2 days)
3. **Production** track (after testing)
4. **Review:** Few hours to 2 days

---

## ✅ Pre-Submission Checklist

### Code & Build:
- [ ] All Capacitor code removed
- [ ] Expo dependencies installed
- [ ] Configuration files updated with your info
- [ ] Local testing successful (`npx expo start`)
- [ ] No build errors (`eas build --platform all --profile preview`)

### Assets:
- [ ] App icon created (512x512px)
- [ ] Splash screen created (1284x2778px)
- [ ] Screenshots captured (6-10 for iOS, 2-8 for Android)
- [ ] Feature graphic created (1024x500px for Android)

### Legal & Compliance:
- [ ] Privacy policy published at https://tryeatpal.com/privacy
- [ ] Terms of service available
- [ ] Support email active (support@tryeatpal.com)
- [ ] Data collection disclosures complete

### Store Accounts:
- [ ] Apple Developer Account active ($99/year)
- [ ] Google Play Developer Account active ($25 one-time)
- [ ] App Store Connect app created
- [ ] Google Play Console app created

### Builds:
- [ ] iOS production build successful
- [ ] Android production build successful
- [ ] Tested on physical devices
- [ ] No critical bugs

---

## 🐛 Troubleshooting

### "Unable to resolve module react-router-dom"

This means web-specific code is being imported on mobile. Solution:

```typescript
import { Platform } from 'react-native';

// Make imports conditional
if (Platform.OS === 'web') {
  const { useNavigate } = require('react-router-dom');
}
```

### "Version mismatch" errors

```bash
# Auto-fix all version issues
npx expo install --fix
```

### "Missing asset" errors

```bash
# Verify paths in app.config.js
# Ensure files exist:
ls -la public/icon-512x512.png
ls -la public/splash.png
```

### Build fails on EAS

1. Check build logs at expo.dev
2. Look for first error in stack trace
3. Verify all dependencies are compatible
4. Remove any web-only imports

---

## 📊 Estimated Timeline

| Task | Time | Notes |
|------|------|-------|
| Remove Capacitor | 30 min | Uninstall packages, delete config |
| Install Expo | 30 min | Install dependencies, verify |
| Create Assets | 2-4 hours | Design icon, splash, screenshots |
| Configure App | 1 hour | Update configs with your info |
| First Build | 15 min | Run `eas build` |
| Test Build | 1-2 hours | Install and test on devices |
| App Store Setup | 2-3 hours | Create apps, write descriptions, upload assets |
| Submit Builds | 30 min | Run submit commands |
| **Wait for Review** | **2-4 days** | Apple & Google review process |

**Total Active Time:** 8-12 hours  
**Total Calendar Time:** 1 week (including reviews)

---

## 🎓 Learning Resources

- **Expo Docs:** https://docs.expo.dev
- **EAS Build Guide:** https://docs.expo.dev/build/introduction/
- **App Store Guidelines:** https://developer.apple.com/app-store/review/guidelines/
- **Play Store Policies:** https://support.google.com/googleplay/android-developer/topic/9858052

---

## 📞 Need Help?

### Common Questions:

**Q: Do I need a Mac for iOS builds?**  
A: No! EAS Build compiles iOS apps in the cloud. You can build iOS apps from Windows/Linux.

**Q: Can I test before submitting to stores?**  
A: Yes! Use preview builds and TestFlight (iOS) or Internal Testing (Android).

**Q: How much does this cost?**  
A: 
- Expo: Free tier sufficient for most apps
- Apple Developer: $99/year
- Google Play: $25 one-time
- **Total: ~$124 first year, ~$99/year after**

**Q: How long until my app is live?**  
A: 2-4 days for initial review, then instant updates (except major changes).

---

## 🎯 Next Steps

1. **Read this entire guide**
2. **Run the Initial Setup commands**
3. **Create required assets** (icon, splash)
4. **Test locally** with `npx expo start`
5. **Build preview** with `npm run eas:build:all:preview`
6. **Test on devices**
7. **Create store listings**
8. **Submit production builds**
9. **Wait for approval** 🎉

---

**Status:** ✅ Configuration Complete - Ready to Build  
**Last Updated:** January 10, 2025  
**Est. Time to Launch:** 1 week

