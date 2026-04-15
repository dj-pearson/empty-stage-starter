# 📱 Mobile Deployment Guide - Munch Maker Mate

This guide walks you through deploying the Munch Maker Mate app to iOS and Android devices.

## 🎯 Features Already Configured

✅ **Capacitor Setup** - Mobile framework configured  
✅ **Barcode Scanner** - Camera-based barcode scanning with `@capacitor-community/barcode-scanner`  
✅ **Multi-API Lookup** - Automatic product lookup from:

- 🥇 Open Food Facts (primary, free, no API key needed)
- 🥈 USDA FoodData Central (optional, requires API key)
- 🥉 FoodRepo (final fallback)  
  ✅ **Auto-add to Nutrition** - Scanned products automatically populate the nutrition database

---

## 📋 Prerequisites

Before starting, make sure you have:

- [ ] Node.js (v18 or later) installed
- [ ] npm or bun package manager
- [ ] Git installed
- [ ] For Android:
  - Android Studio installed
  - Android SDK configured
- [ ] For iOS (Mac only):
  - Xcode installed (latest version)
  - Xcode Command Line Tools
  - CocoaPods installed (`sudo gem install cocoapods`)

---

## 🚀 Step-by-Step Deployment

### 1. Export and Clone Repository

```bash
# If you haven't already, clone your repository
git clone https://github.com/dj-pearson/empty-stage-starter.git
cd empty-stage-starter

# Or if you're already in the directory, make sure you're up to date
git pull origin main
```

### 2. Install Dependencies

```bash
npm install
# Note: The project uses --legacy-peer-deps (configured in .npmrc)
# This is needed because the barcode scanner plugin hasn't updated to Capacitor 7 yet
# It will work fine despite the peer dependency warning

# or if using bun:
# bun install
```

### 3. Configure Environment Variables (Optional)

If you want to use USDA FoodData Central as a fallback:

1. Get a free API key from: https://fdc.nal.usda.gov/api-key-signup.html
2. Add it to your Supabase project:
   - Go to Supabase Dashboard → Project Settings → Edge Functions → Environment Variables
   - Add: `USDA_API_KEY` with your key

### 4. Build the Web Project

```bash
npm run build
```

This creates the `dist` folder that Capacitor will use.

### 5. Add Mobile Platforms

#### For Android:

```bash
npx cap add android
```

#### For iOS (Mac only):

```bash
npx cap add ios
```

### 6. Sync Native Projects

After building, sync the web assets with native projects:

```bash
npx cap sync
```

This command:

- Copies the built web app to native projects
- Updates native dependencies
- Configures plugins

### 7. Configure Native Permissions

#### Android Permissions

The camera permission is already configured in `android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-feature android:name="android.hardware.camera" />
```

If not present, add these manually.

#### iOS Permissions

The camera permission is configured in `ios/App/Info.plist`:

```xml
<key>NSCameraUsageDescription</key>
<string>This app needs camera access to scan product barcodes</string>
```

If not present, add this manually.

### 8. Update Production Configuration

For production builds, update `capacitor.config.ts`:

```typescript
const config: CapacitorConfig = {
  appId: "com.eatpal.munchmatemaker",
  appName: "Munch Maker Mate",
  webDir: "dist",
  // Comment out or remove the server config for production
  // server: {
  //   url: 'https://...',
  //   cleartext: true
  // },
  plugins: {
    BarcodeScanner: {
      hideWebcam: true,
    },
  },
};
```

Then rebuild and sync:

```bash
npm run build
npx cap sync
```

### 9. Run on Device

#### Android:

```bash
# Open in Android Studio
npx cap open android

# Or run directly (if device/emulator is connected)
npx cap run android
```

In Android Studio:

1. Connect your Android device via USB (with USB debugging enabled)
2. Select your device from the device dropdown
3. Click the green "Run" button ▶️

#### iOS (Mac only):

```bash
# Open in Xcode
npx cap open ios

# Or run directly (if device/simulator is ready)
npx cap run ios
```

In Xcode:

1. Select your team for code signing (Xcode → Preferences → Accounts)
2. Connect your iOS device via USB
3. Select your device from the device dropdown
4. Click the "Play" button ▶️

---

## 🔄 Development Workflow

When making changes to your web app:

```bash
# 1. Make your changes in src/

# 2. Build the project
npm run build

# 3. Sync with native projects
npx cap sync

# 4. Run on device
npx cap run android
# or
npx cap run ios
```

### Live Reload (Development Mode)

For faster development, keep the server URL in `capacitor.config.ts` during development:

```typescript
server: {
  url: 'http://YOUR_LOCAL_IP:5173', // Your dev server URL
  cleartext: true
}
```

Then run:

```bash
npm run dev
npx cap sync
npx cap run android  # or ios
```

The app will reload when you make changes!

---

## 📱 Testing Barcode Scanner

1. Open the app on your device
2. Navigate to the Admin/Nutrition management page
3. Click "Scan Barcode"
4. Grant camera permissions when prompted
5. Point camera at any product barcode (UPC/EAN)
6. The app will:
   - Scan the barcode
   - Look it up in Open Food Facts → USDA → FoodRepo
   - Display nutrition information
   - Allow you to add it to your database

### Test Barcodes

Try these well-known barcodes for testing:

- **737628064502** - Coca-Cola
- **028400047685** - Cheerios
- **016000275287** - Skippy Peanut Butter
- **041220971879** - Oreo Cookies

---

## 🐛 Troubleshooting

### Android Issues

**Problem:** "SDK location not found"

```bash
# Create local.properties in android/ folder:
echo "sdk.dir=/Users/YOUR_USERNAME/Library/Android/sdk" > android/local.properties
# (Adjust path for your system)
```

**Problem:** Gradle build fails

```bash
cd android
./gradlew clean
cd ..
npx cap sync
```

**Problem:** Camera not working

- Check AndroidManifest.xml has camera permissions
- Grant camera permission in device settings
- Ensure target SDK version is 33 or lower for Android 13+

### iOS Issues

**Problem:** Code signing error

- Add your Apple Developer account in Xcode
- Select your team in project settings
- Xcode will auto-manage signing

**Problem:** CocoaPods error

```bash
cd ios/App
pod install
cd ../..
npx cap sync
```

**Problem:** Camera not working

- Check Info.plist has NSCameraUsageDescription
- Grant camera permission in device settings

### General Issues

**Problem:** Barcode scanner shows black screen

- Check camera permissions are granted
- Ensure `hideWebcam: true` is in config
- Try restarting the app

**Problem:** API lookup fails

- Check internet connection
- Check Supabase edge function is deployed
- View logs in Supabase Dashboard → Edge Functions → Logs

---

## 📦 Building for Production

### Android APK/AAB

```bash
cd android
./gradlew assembleRelease  # For APK
./gradlew bundleRelease    # For AAB (Google Play)
cd ..
```

APK location: `android/app/build/outputs/apk/release/app-release.apk`
AAB location: `android/app/build/outputs/bundle/release/app-release.aab`

### iOS IPA

1. Open in Xcode: `npx cap open ios`
2. Select "Any iOS Device (arm64)" as target
3. Product → Archive
4. Follow the distribution workflow for App Store or Ad-Hoc

---

## 🔐 App Store Preparation

### Android (Google Play)

1. Create signed release build with keystore
2. Update version in `android/app/build.gradle`
3. Create privacy policy
4. Prepare store listings and screenshots
5. Upload AAB to Google Play Console

### iOS (App Store)

1. Register app in App Store Connect
2. Configure app icons and launch screens
3. Update version in `ios/App/App/Info.plist`
4. Create privacy policy
5. Prepare store listings and screenshots
6. Archive and upload via Xcode

---

## 📚 Additional Resources

- [Capacitor Documentation](https://capacitorjs.com/docs)
- [Barcode Scanner Plugin](https://github.com/capacitor-community/barcode-scanner)
- [Open Food Facts API](https://world.openfoodfacts.org/data)
- [USDA FoodData Central](https://fdc.nal.usda.gov/)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)

---

## 💡 Tips

- Test on real devices, not just simulators/emulators
- The barcode scanner requires a physical device (won't work in simulator)
- Keep the development server URL commented out for production builds
- Use `npm run build` before every `npx cap sync`
- Monitor Supabase logs for API lookup debugging

---

**Need help?** Check the GitHub issues or contact the development team.

Happy scanning! 📱🎉
