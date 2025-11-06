# Quick Start Guide - Native JavaScript Build

## 🚀 Get Started in 5 Minutes

### Step 1: Install Dependencies
```bash
cd native-js-build
npm install
```

### Step 2: Run on Your Platform

**For iOS (macOS only):**
```bash
cd ios && pod install && cd ..
npm run ios
```

**For Android:**
```bash
npm run android
```

### Step 3: Build for Production

**Android APK:**
```bash
./build-android.sh
```
Find your APK at: `android/app/build/outputs/apk/release/app-release.apk`

**iOS IPA (macOS only):**
```bash
./build-ios.sh
```
Find your IPA at: `ios/build/EatPal.ipa`

## 📱 Testing on Physical Devices

### Android
1. Enable USB debugging on your device
2. Connect via USB
3. Run: `npm run android`

### iOS
1. Open Xcode workspace: `ios/EatPal.xcworkspace`
2. Connect your iPhone
3. Select your device in Xcode
4. Click Run (▶️)

## ⚡ Why This Build is Better for App Stores

✅ **Pure JavaScript** - No TypeScript compilation errors
✅ **Native Builds** - Direct control over iOS/Android
✅ **Proven Stability** - JavaScript has fewer edge cases
✅ **Faster Builds** - No type checking overhead
✅ **App Store Ready** - Built with production in mind

## 🔧 Common Commands

```bash
# Start Metro bundler
npm start

# Run on iOS simulator
npm run ios

# Run on Android emulator
npm run android

# Build Android release
./build-android.sh

# Build iOS release
./build-ios.sh

# Clear cache
npm start -- --reset-cache
```

## 📝 Before Submitting to App Stores

### Android (Google Play)
- [ ] Sign your APK/AAB with a release keystore
- [ ] Update version code in `android/app/build.gradle`
- [ ] Test on multiple Android devices
- [ ] Create store listing in Google Play Console

### iOS (App Store)
- [ ] Configure signing in Xcode
- [ ] Update version in `ios/EatPal-Info.plist`
- [ ] Test on multiple iOS devices
- [ ] Create app listing in App Store Connect

## 🆘 Need Help?

See full documentation in `README.md` or check:
- React Native Docs: https://reactnative.dev
- Android Publishing: https://reactnative.dev/docs/signed-apk-android
- iOS Publishing: https://reactnative.dev/docs/publishing-to-app-store

---

**Note:** This build is completely separate from your main Expo build and won't affect it in any way!
