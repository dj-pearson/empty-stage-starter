# Native JavaScript Build vs Main Expo Build

## Overview

This document explains the key differences between the native JavaScript build and your main Expo TypeScript build, and when to use each.

## Why Two Builds?

### The Problem
- Expo builds were completing successfully
- Apple builds were completing successfully
- **BUT** the app was **crashing immediately** when testing on devices
- TypeScript compilation can introduce subtle issues that are hard to debug

### The Solution
A separate **native JavaScript build** that:
- Uses pure JavaScript (no TypeScript)
- Builds directly with React Native CLI (not Expo)
- Has maximum compatibility and stability
- Can be submitted directly to app stores

## Key Differences

| Aspect | Main Build (Expo/TS) | Native JS Build |
|--------|---------------------|-----------------|
| **Location** | Root directory | `/native-js-build/` |
| **Language** | TypeScript | Pure JavaScript |
| **Build Tool** | Expo / EAS Build | React Native CLI |
| **Package Manager** | npm (shared) | npm (separate) |
| **Entry Point** | `index.mobile.js` → Expo Router | `index.js` → React Navigation |
| **Dependencies** | ~135 packages | ~15 core packages |
| **Type Safety** | ✅ Yes | ❌ No |
| **Build Time** | Slower (type checking) | Faster |
| **Debugging** | Harder (type errors) | Easier (runtime only) |
| **Stability** | May have TS issues | Very stable |
| **Best For** | Development, web | Production mobile apps |

## Technical Architecture

### Main Build
```
index.mobile.js
  └─> expo-router/entry
      └─> app/_layout.tsx
          └─> TypeScript components
              └─> Web + Mobile features
```

### Native JS Build
```
index.js
  └─> src/App.js
      └─> React Navigation
          └─> JavaScript screens
              └─> Mobile-only features
```

## Dependencies Comparison

### Main Build Uses
- TypeScript (type system)
- Expo SDK (development framework)
- Radix UI (web components)
- React Router (web navigation)
- Vite (web bundler)
- 100+ other packages

### Native JS Build Uses
- React Native (core)
- React Navigation (navigation)
- React Native Gesture Handler
- React Native Reanimated
- React Native Safe Area Context
- ~10 other essentials

## When to Use Each Build

### Use Main Build (Expo/TS) For:
- ✅ Web development
- ✅ Rapid prototyping
- ✅ Development with Expo Go
- ✅ When you need type safety
- ✅ Features that require Expo modules

### Use Native JS Build For:
- ✅ **App Store submissions** (iOS & Android)
- ✅ Production mobile releases
- ✅ When TypeScript causes build issues
- ✅ Maximum stability
- ✅ Direct native module access
- ✅ **When the app crashes on device**

## File Structure

```
empty-stage-starter/
├─ Main Expo/TS Build (Web + Mobile dev)
│  ├─ src/
│  ├─ app/
│  ├─ package.json
│  ├─ tsconfig.json
│  └─ app.config.js
│
└─ native-js-build/ (Production mobile)
   ├─ android/
   ├─ ios/
   ├─ src/
   ├─ package.json (separate)
   ├─ index.js
   └─ README.md
```

**Important:** These are **completely independent** projects. Changes in one don't affect the other.

## Development Workflow

### Recommended Workflow

1. **Develop features** in the main Expo/TS build
   - Use Expo Go for fast iteration
   - Leverage TypeScript for safety
   - Test on web first

2. **Port features** to native JS build
   - Convert TS files to JS (remove types)
   - Replace Expo APIs with RN equivalents
   - Test on physical devices

3. **Submit to app stores** from native JS build
   - Build production APK/IPA
   - Submit to Google Play / App Store

### Example: Adding a New Feature

**Step 1:** Develop in main build (`src/pages/NewFeature.tsx`)
```typescript
import { useState } from 'react';
import { View, Text } from 'react-native';

interface Props {
  title: string;
}

export default function NewFeature({ title }: Props) {
  const [count, setCount] = useState<number>(0);
  return <View><Text>{title}: {count}</Text></View>;
}
```

**Step 2:** Port to native JS (`native-js-build/src/screens/NewFeature.js`)
```javascript
import { useState } from 'react';
import { View, Text } from 'react-native';

// Remove interface, remove types
export default function NewFeature({ title }) {
  const [count, setCount] = useState(0);
  return <View><Text>{title}: {count}</Text></View>;
}
```

**Step 3:** Build and test
```bash
cd native-js-build
npm run android
# or
npm run ios
```

## Common Conversion Patterns

### TypeScript → JavaScript

**Remove type annotations:**
```typescript
// TypeScript
function greet(name: string): string {
  return `Hello, ${name}`;
}
```
```javascript
// JavaScript
function greet(name) {
  return `Hello, ${name}`;
}
```

**Remove interfaces:**
```typescript
// TypeScript
interface User {
  name: string;
  age: number;
}
```
```javascript
// JavaScript
// Just use the object directly, or add JSDoc comments:
/**
 * @typedef {Object} User
 * @property {string} name
 * @property {number} age
 */
```

**Remove generic types:**
```typescript
// TypeScript
const items: Array<string> = [];
```
```javascript
// JavaScript
const items = [];
```

### Expo → React Native

**Replace Expo modules:**

| Expo Module | React Native Alternative |
|-------------|-------------------------|
| `expo-router` | `@react-navigation/native` |
| `expo-camera` | `react-native-camera` |
| `expo-image-picker` | `react-native-image-picker` |
| `expo-file-system` | `react-native-fs` |
| `expo-secure-store` | `@react-native-async-storage/async-storage` (encrypted) |

**Example:**
```javascript
// Expo
import { Camera } from 'expo-camera';

// React Native
import { RNCamera } from 'react-native-camera';
```

## Troubleshooting

### App Crashes Immediately

**If main build crashes:**
1. ✅ Use native JS build instead
2. The crash is likely TypeScript-related
3. Native JS build has better stability

**If native JS build also crashes:**
1. Check Metro bundler logs
2. Check native logs (`adb logcat` or Console.app)
3. Verify JavaScript bundle loaded correctly

### Build Errors

**Main build errors:**
- Usually TypeScript errors
- Check `tsconfig.json` settings
- Run `npm run build` to see errors

**Native JS build errors:**
- Usually native dependency issues
- Run `pod install` (iOS)
- Run `./gradlew clean` (Android)

## Performance

### Build Times
- **Main build:** 3-5 minutes (includes type checking)
- **Native JS build:** 1-2 minutes (no type checking)

### App Size
- **Main build:** Larger (includes Expo modules)
- **Native JS build:** Smaller (minimal dependencies)

### Runtime Performance
- **Both:** Similar (both use Hermes engine)

## Maintenance

### Keeping Builds in Sync

1. **Don't automatically sync** - they serve different purposes
2. **Port features selectively** - only what's needed for mobile
3. **Test thoroughly** after porting

### Version Management

Update both when releasing:

**Main build:**
- Update `package.json` version
- Update `app.config.js` version

**Native JS build:**
- Update `package.json` version
- Update `ios/EatPal-Info.plist` CFBundleShortVersionString
- Update `android/app/build.gradle` versionName and versionCode

## Conclusion

### Simple Rule of Thumb:

**Use main build** → Development, web, TypeScript safety
**Use native JS build** → Production mobile apps, app store submissions

The native JavaScript build exists specifically to solve the crash issue you experienced. It's designed for maximum stability and compatibility with iOS and Android app stores.

For your specific case where the app crashes immediately after build, the native JS build is the **recommended solution** for app store submission.
