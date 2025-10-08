# 🚀 Quick Start - Mobile Deployment

## Super Quick Setup

```bash
# 1. Install dependencies
# Note: Uses --legacy-peer-deps (configured in .npmrc) due to Capacitor 7 compatibility
npm install

# 2. Build the web app
npm run build

# 3. Add mobile platforms
npm run mobile:add:android    # For Android
npm run mobile:add:ios        # For iOS (Mac only)

# 4. Open in native IDE
npm run mobile:open:android   # Opens Android Studio
npm run mobile:open:ios       # Opens Xcode
```

## Quick Development Workflow

```bash
# Build and run on Android
npm run mobile:run:android

# Build and run on iOS
npm run mobile:run:ios

# Just sync changes (after npm run build)
npm run mobile:sync
```

## 📋 What's Already Done

✅ Capacitor configured  
✅ Barcode scanner plugin installed  
✅ Multi-API lookup edge function ready  
✅ Camera permissions configured  
✅ Mobile app name: "Munch Maker Mate"  
✅ App ID: com.eatpal.munchmatemaker

## 🎯 Key Features

- **Barcode Scanner**: Scan any product barcode
- **Multi-API Lookup**: Searches Open Food Facts → USDA → FoodRepo
- **Auto-add Nutrition**: Scanned products go straight to your database
- **Works offline**: Local nutrition database

## 📱 Testing the Scanner

1. Open app on physical device (simulator won't work for camera)
2. Go to Admin/Nutrition page
3. Click "Scan Barcode"
4. Point at any product barcode
5. View nutrition info and add to database!

## 🐛 Common Issues

**Black screen on scanner?**

- Grant camera permissions in device settings

**"SDK not found" on Android?**

- Open Android Studio once to auto-configure

**Build fails?**

```bash
# Clean and retry
npm run build
npx cap sync
```

## 📖 Full Documentation

See `MOBILE_DEPLOYMENT.md` for complete step-by-step guide.

---

**Ready to go!** 🎉 Just run `npm run mobile:run:android` or `npm run mobile:run:ios`
