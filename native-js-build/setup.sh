#!/bin/bash
# Setup script for Native JavaScript Build
# Run this once after cloning/creating the project

set -e

echo "🎉 Setting up EatPal Native JavaScript Build..."
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

echo "✅ Node.js version: $(node --version)"
echo ""

# Install npm dependencies
echo "📦 Installing npm dependencies..."
npm install
echo "✅ Dependencies installed"
echo ""

# Setup iOS (macOS only)
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "🍎 Detected macOS - Setting up iOS..."

    # Check for CocoaPods
    if ! command -v pod &> /dev/null; then
        echo "⚠️  CocoaPods not found. Installing..."
        sudo gem install cocoapods
    fi

    echo "📦 Installing iOS dependencies (CocoaPods)..."
    cd ios
    pod install
    cd ..
    echo "✅ iOS setup complete"
else
    echo "⏭️  Skipping iOS setup (not on macOS)"
fi

echo ""

# Setup Android
echo "🤖 Setting up Android..."

# Check for Java
if ! command -v java &> /dev/null; then
    echo "⚠️  Warning: Java (JDK) not found. You'll need JDK 17 for Android builds."
else
    echo "✅ Java version: $(java -version 2>&1 | head -n 1)"
fi

# Make Gradle wrapper executable
if [ -f "android/gradlew" ]; then
    chmod +x android/gradlew
    echo "✅ Gradle wrapper configured"
else
    echo "⚠️  Gradle wrapper not found. You may need to initialize it."
fi

echo ""
echo "🎉 Setup complete!"
echo ""
echo "Next steps:"
echo "  • For iOS development: npm run ios"
echo "  • For Android development: npm run android"
echo "  • Read QUICKSTART.md for more information"
echo ""
