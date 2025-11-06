# EatPal Native JavaScript Build

This is a **pure JavaScript** React Native build of EatPal, created to avoid TypeScript compilation issues and provide maximum compatibility with native iOS and Android builds.

## Why This Build?

- **100% JavaScript** - No TypeScript to cause build errors
- **Native React Native CLI** - Direct control over iOS and Android builds
- **App Store Ready** - Can be submitted directly to Apple App Store and Google Play Store
- **Separate from Main Build** - Doesn't affect your main Expo/TypeScript codebase

## Project Structure

```
native-js-build/
├── android/              # Android native code
│   ├── app/
│   │   ├── build.gradle
│   │   └── src/main/
│   ├── build.gradle
│   └── settings.gradle
├── ios/                  # iOS native code
│   ├── Podfile
│   ├── EatPal-Info.plist
│   └── exportOptions.plist
├── src/                  # JavaScript source code
│   ├── App.js           # Main app component
│   ├── navigation/      # Navigation setup
│   ├── screens/         # App screens
│   └── components/      # Reusable components
├── index.js             # Entry point
├── package.json         # Dependencies
└── build-*.sh          # Build scripts
```

## Prerequisites

### For Both Platforms
- Node.js 18+
- npm or yarn

### For iOS Development
- macOS with Xcode 14+
- CocoaPods (`sudo gem install cocoapods`)
- iOS Simulator or physical iOS device

### For Android Development
- Android Studio
- Android SDK (API 23+)
- Java Development Kit (JDK 17)
- Android device or emulator

## Setup Instructions

### Initial Setup

1. Navigate to the native-js-build folder:
   ```bash
   cd native-js-build
   ```

2. Install JavaScript dependencies:
   ```bash
   npm install
   ```

3. For iOS, install CocoaPods dependencies:
   ```bash
   cd ios
   pod install
   cd ..
   ```

### Development

#### Running on iOS Simulator
```bash
npm run ios
```

#### Running on Android Emulator
```bash
npm run android
```

#### Start Metro Bundler (if needed separately)
```bash
npm start
```

## Building for Production

### Android Production Build

#### Build APK (for testing)
```bash
./build-android.sh
```
The APK will be located at: `android/app/build/outputs/apk/release/app-release.apk`

#### Build AAB (for Google Play Store)
1. Edit `build-android.sh` and uncomment the AAB build lines
2. Run the script:
   ```bash
   ./build-android.sh
   ```
3. The AAB will be located at: `android/app/build/outputs/bundle/release/app-release.aab`

#### Signing the Android App
Before releasing to the Play Store, you need to sign your app:

1. Generate a signing key:
   ```bash
   keytool -genkey -v -keystore eatpal-release-key.keystore -alias eatpal-key -keyalg RSA -keysize 2048 -validity 10000
   ```

2. Edit `android/app/build.gradle` and add your signing config:
   ```gradle
   signingConfigs {
       release {
           storeFile file('eatpal-release-key.keystore')
           storePassword 'YOUR_KEYSTORE_PASSWORD'
           keyAlias 'eatpal-key'
           keyPassword 'YOUR_KEY_PASSWORD'
       }
   }
   ```

3. Update the release buildType to use the signing config:
   ```gradle
   buildTypes {
       release {
           signingConfig signingConfigs.release
           ...
       }
   }
   ```

### iOS Production Build

1. Update `ios/exportOptions.plist` with your Team ID

2. Run the build script:
   ```bash
   ./build-ios.sh
   ```
   The IPA will be located at: `ios/build/EatPal.ipa`

#### Signing the iOS App
1. In Xcode, open `ios/EatPal.xcworkspace`
2. Select the EatPal target
3. Go to "Signing & Capabilities"
4. Select your Team and provisioning profile
5. Build the archive via the script or Xcode

## Submitting to App Stores

### Google Play Store
1. Build the signed AAB (see above)
2. Go to [Google Play Console](https://play.google.com/console)
3. Create a new app or select your existing app
4. Navigate to "Release" → "Production"
5. Upload the AAB file
6. Complete the store listing and submit for review

### Apple App Store
1. Build the signed IPA (see above)
2. Upload to App Store Connect using Xcode or Transporter app
3. Go to [App Store Connect](https://appstoreconnect.apple.com)
4. Complete the app information and submit for review

## Troubleshooting

### Android Build Issues

**Gradle Build Failed**
- Clean the build: `cd android && ./gradlew clean`
- Check Java version: `java -version` (should be JDK 17)
- Update Gradle: `cd android && ./gradlew wrapper --gradle-version=8.3`

**Metro Bundler Connection Failed**
- Clear Metro cache: `npm start -- --reset-cache`
- Check that port 8081 is not in use

### iOS Build Issues

**CocoaPods Error**
```bash
cd ios
pod deintegrate
pod install
```

**Xcode Build Failed**
- Clean build folder in Xcode: Product → Clean Build Folder
- Delete derived data: `rm -rf ~/Library/Developer/Xcode/DerivedData`

**Signing Issues**
- Ensure you have a valid provisioning profile
- Check Team ID in Xcode project settings

### General Issues

**White Screen on Launch**
- Check Metro bundler is running
- Verify JavaScript bundle was created correctly
- Check for JavaScript errors in Metro logs

**App Crashes Immediately**
- Check native logs:
  - iOS: Open Console.app and filter by "EatPal"
  - Android: `adb logcat | grep EatPal`

## Key Differences from Main Build

| Feature | Main Build (Expo/TS) | Native JS Build |
|---------|---------------------|-----------------|
| Language | TypeScript | Pure JavaScript |
| Build System | Expo/EAS | React Native CLI |
| Type Safety | Yes | No |
| Build Stability | May have TS errors | More stable |
| Development | Expo Go app | Native builds only |
| Hot Reload | Yes | Yes |
| Native Modules | Via Expo plugins | Direct integration |

## Adding Features

When adding features from the main build:

1. Convert TypeScript files to JavaScript (remove types)
2. Replace Expo modules with React Native equivalents:
   - `expo-router` → `@react-navigation/native`
   - `expo-camera` → `react-native-camera`
   - `expo-image-picker` → `react-native-image-picker`
3. Test thoroughly on both platforms

## Environment Variables

Create a `.env` file for configuration:
```env
API_URL=https://your-api.com
SUPABASE_URL=your-supabase-url
SUPABASE_ANON_KEY=your-anon-key
```

Install `react-native-config`:
```bash
npm install react-native-config
```

## Performance Optimization

For production builds:
- Enable Hermes (already enabled in `gradle.properties`)
- Optimize images and assets
- Use ProGuard for Android (configured in `app/build.gradle`)
- Enable bitcode for iOS if needed

## Support

If you encounter issues:
1. Check the troubleshooting section above
2. Review React Native documentation: https://reactnative.dev
3. Check platform-specific guides:
   - iOS: https://reactnative.dev/docs/running-on-device#ios
   - Android: https://reactnative.dev/docs/running-on-device#android

## Next Steps

1. Test the app on physical devices
2. Add your app's actual features (convert from TypeScript)
3. Set up continuous integration (CI/CD)
4. Configure app signing for both platforms
5. Submit to app stores

Good luck with your app launch! 🚀
