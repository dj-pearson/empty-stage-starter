#!/bin/bash
# Build script for Android Release APK/AAB
# Pure JavaScript Native Build

set -e

echo "🚀 Starting Android build process..."

# Change to native-js-build directory
cd "$(dirname "$0")"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Clean previous builds
echo "🧹 Cleaning previous builds..."
cd android
./gradlew clean
cd ..

# Bundle JavaScript
echo "📦 Bundling JavaScript for Android..."
npm run bundle:android

# Build Release APK
echo "🔨 Building Release APK..."
cd android
./gradlew assembleRelease

echo "✅ Build complete!"
echo "📱 APK location: android/app/build/outputs/apk/release/app-release.apk"

# For AAB (Google Play Store)
# ./gradlew bundleRelease
# echo "📱 AAB location: android/app/build/outputs/bundle/release/app-release.aab"
