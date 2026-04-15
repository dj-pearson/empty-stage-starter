# Expo Implementation Checklist

## ✅ Completed

### 1. Initial Setup
- [x] Installed Expo SDK 54
- [x] Installed React Native 0.81.4
- [x] Installed Expo Router and essential packages
- [x] Created `app.config.js` with proper configuration
- [x] Created `eas.json` for build configuration
- [x] Created `metro.config.cjs` for bundler configuration
- [x] Created `babel.config.js` with path aliases
- [x] Created `.easignore` to optimize build uploads
- [x] Updated `.gitignore` for Expo directories

### 2. Mobile Entry Points
- [x] Created `index.mobile.js` as the mobile entry point
- [x] Created `app/_layout.tsx` for Expo Router root layout
- [x] Created `app/index.tsx` for platform routing
- [x] Created `app/mobile/MobileApp.tsx` as initial mobile app component
- [x] Updated `src/main.tsx` with clear web-only documentation

### 3. Platform Utilities
- [x] Created `src/lib/platform.ts` for platform detection
- [x] Created `src/lib/supabase-platform.ts` for platform-aware Supabase client
- [x] Created `src/integrations/supabase/client.mobile.ts` with SecureStore adapter
- [x] Updated `src/contexts/AppContext.tsx` to use platform-aware storage

### 4. Configuration Files
- [x] Updated `app.config.js` with all required plugins
- [x] Configured permissions for iOS (camera, photos, location)
- [x] Configured permissions for Android (camera, storage, location)
- [x] Set up EAS Build profiles (development, preview, production)

### 5. Dependencies
- [x] Removed all Capacitor dependencies
- [x] Added Expo dependencies with proper version constraints
- [x] Installed Babel plugins for module resolution
- [x] Updated React to 19.1.0 for consistency

## 🚧 In Progress

### 6. Platform-Aware Code Migration
- [x] AppContext storage (completed)
- [ ] Update remaining components that use localStorage
- [ ] Update components that use browser-specific APIs
- [ ] Add Platform checks for web-only features
- [ ] Test all major features on web and mobile

## 📋 Pending

### 7. Asset Creation
- [ ] Create `public/icon-512x512.png` (app icon)
- [ ] Create `public/splash.png` (splash screen)
- [ ] Delete placeholder `.md` files
- [ ] Verify assets display correctly

**Status**: See `MOBILE_APP_ASSETS_TODO.md` for detailed instructions

### 8. Mobile UI Development
- [ ] Build out mobile navigation structure
- [ ] Create mobile-optimized versions of key screens:
  - [ ] Dashboard/Home
  - [ ] Kids management
  - [ ] Meal planner
  - [ ] Food tracker
  - [ ] Grocery list
  - [ ] Recipes
- [ ] Implement mobile-specific UI patterns
- [ ] Add bottom tab navigation
- [ ] Test responsive layouts

### 9. Feature Parity
- [ ] Barcode scanning (using expo-camera)
- [ ] Image picking (using expo-image-picker)
- [ ] Offline data sync
- [ ] Push notifications setup
- [ ] Deep linking configuration
- [ ] Share functionality

### 10. Testing & Quality
- [ ] Test on iOS simulator
- [ ] Test on Android emulator
- [ ] Test on physical iOS device
- [ ] Test on physical Android device
- [ ] Test all Supabase authentication flows
- [ ] Test all data synchronization
- [ ] Performance profiling

### 11. Build & Deploy
- [ ] Run `eas build --platform ios --profile preview`
- [ ] Run `eas build --platform android --profile preview`
- [ ] Test preview builds on physical devices
- [ ] Fix any build-specific issues
- [ ] Run production builds for both platforms
- [ ] Submit to App Store Connect
- [ ] Submit to Google Play Console

### 12. Store Listing Requirements

#### iOS App Store
- [ ] App Store screenshots (required sizes)
- [ ] App Store description
- [ ] Keywords and categories
- [ ] Privacy policy URL
- [ ] App Review information
- [ ] Age rating questionnaire
- [ ] Export compliance information

#### Google Play Store
- [ ] Play Store screenshots (required sizes)
- [ ] Play Store description
- [ ] Feature graphic (1024x500)
- [ ] Privacy policy URL
- [ ] Content rating questionnaire
- [ ] Target audience and content

## 🚀 Quick Start Commands

### Development
```bash
# Start Expo development server
npm run expo:start

# Start for specific platform
npm run expo:ios
npm run expo:android
npm run expo:web

# Clear cache if needed
npm run expo:clear
```

### Building
```bash
# Initialize EAS (first time only)
npx eas init

# Build preview for testing
npm run eas:build:ios:preview
npm run eas:build:android:preview

# Build production
npm run eas:build:ios:production
npm run eas:build:android:production

# Build for both platforms
npm run eas:build:all:production
```

### Submission
```bash
# Submit to stores
npm run eas:submit:ios
npm run eas:submit:android
```

## 📝 Notes

### Current Architecture
- **Web**: Uses Vite + React Router (existing codebase)
- **Mobile**: Uses Expo Router + React Native
- **Shared**: All business logic, contexts, and utilities work on both platforms

### Platform Detection
- Use `isWeb()`, `isMobile()`, `isIOS()`, `isAndroid()` from `src/lib/platform.ts`
- Storage automatically adapts: localStorage (web) vs SecureStore (mobile)
- Supabase client adapts: standard (web) vs SecureStore-enabled (mobile)

### Key Files
- `index.html` + `src/main.tsx` → Web entry (Vite)
- `index.mobile.js` + `app/_layout.tsx` → Mobile entry (Expo)
- `app.config.js` → Expo/EAS configuration
- `eas.json` → Build profiles
- `metro.config.cjs` → Metro bundler config
- `babel.config.js` → Babel transforms

## 🔗 Resources

- [Expo Documentation](https://docs.expo.dev/)
- [EAS Build Documentation](https://docs.expo.dev/build/introduction/)
- [EAS Submit Documentation](https://docs.expo.dev/submit/introduction/)
- [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Google Play Policy Center](https://play.google.com/about/developer-content-policy/)

## ⚠️ Important Notes

1. **EAS Project ID**: After running `eas init`, update `app.config.js` with the generated project ID
2. **Expo Username**: Update `owner` field in `app.config.js` with your Expo account username
3. **Bundle IDs**: Make sure `com.eatpal.app` is unique and matches your Apple/Google developer accounts
4. **Credentials**: EAS will manage signing certificates automatically, but you can also provide your own
5. **Testing**: Always test preview builds before creating production builds

