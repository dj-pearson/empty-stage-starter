#!/bin/bash
# Build script for iOS Release IPA
# Pure JavaScript Native Build

set -e

echo "🚀 Starting iOS build process..."

# Change to native-js-build directory
cd "$(dirname "$0")"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Install CocoaPods dependencies
echo "📦 Installing iOS dependencies (CocoaPods)..."
cd ios
pod install
cd ..

# Bundle JavaScript
echo "📦 Bundling JavaScript for iOS..."
npm run bundle:ios

# Build for iOS
echo "🔨 Building iOS app..."
cd ios
xcodebuild -workspace EatPal.xcworkspace \
           -scheme EatPal \
           -configuration Release \
           -sdk iphoneos \
           -archivePath build/EatPal.xcarchive \
           archive

echo "📦 Exporting IPA..."
xcodebuild -exportArchive \
           -archivePath build/EatPal.xcarchive \
           -exportOptionsPlist exportOptions.plist \
           -exportPath build/

echo "✅ Build complete!"
echo "📱 IPA location: ios/build/EatPal.ipa"
