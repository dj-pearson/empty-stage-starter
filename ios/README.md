# EatPal iOS — Native Swift App

Native iOS client for EatPal, SwiftUI, iOS 17+.

## Requirements

- Xcode 15.4+
- iOS 17.0+ deployment target
- Swift 5.9
- [XcodeGen](https://github.com/yonaskolb/XcodeGen) (`brew install xcodegen`) — the Xcode project is generated from `ios/EatPal/project.yml`.

## First-time local setup

```bash
cd ios/EatPal
brew install xcodegen     # once
xcodegen generate         # produces EatPal.xcodeproj from project.yml
open EatPal.xcodeproj
```

The generated `EatPal.xcodeproj/` is **git-ignored**. Regenerate whenever you add/rename files or change `project.yml`.

### Supabase credentials

The app reads `SUPABASE_URL` and `SUPABASE_ANON_KEY` from `Info.plist` (substituted from build settings). For local dev, set them in the scheme's Run > Arguments > Environment Variables, or pass to `xcodebuild`:

```bash
xcodebuild build \
  -project EatPal.xcodeproj \
  -scheme EatPal \
  -destination "platform=iOS Simulator,name=iPhone 15" \
  SUPABASE_URL="https://api.tryeatpal.com" \
  SUPABASE_ANON_KEY="<your-anon-key>"
```

## Project layout

```
ios/EatPal/
├── project.yml                   # XcodeGen spec — single source of truth
├── ExportOptions.plist           # IPA export config for App Store
├── EatPal/                       # App target sources
│   ├── App/                      # Entry point, AppDelegate, AppState
│   ├── Models/                   # Codable models matching Supabase schema
│   ├── Services/                 # Supabase, auth, realtime, notifications,
│   │                             #   StoreKit, barcode, AI coach/meal, image upload
│   ├── ViewModels/
│   ├── Views/                    # Dashboard, Pantry, Grocery, MealPlan, Kids,
│   │                             #   Recipes, Scanner, Settings, Subscription,
│   │                             #   AICoach, FoodChaining, Progress, Quiz
│   ├── Utilities/                # Theme, Toast, Haptics, Network monitor,
│   │                             #   DateFormatters, DeepLinkHandler, AppleSignInHelper
│   ├── Resources/
│   │   ├── Info.plist
│   │   ├── PrivacyInfo.xcprivacy
│   │   └── Assets.xcassets
│   └── EatPal.entitlements       # Push, Sign in with Apple, Associated Domains,
│                                 #   App Groups, In-App Purchase
├── EatPalWidget/                 # Home-screen widget extension (WidgetKit)
│   ├── EatPalWidget.swift
│   └── EatPalWidgetExtension.entitlements
└── EatPalTests/                  # XCTest unit tests
    └── EatPalTests.swift
```

## Capabilities (entitlements)

| Capability | File | Notes |
|---|---|---|
| Push Notifications | `EatPal.entitlements` → `aps-environment = production` | Matching provisioning profile must enable Push. |
| Sign in with Apple | `EatPal.entitlements` → `com.apple.developer.applesignin` | Used by `AppleSignInHelper`. |
| Associated Domains | `EatPal.entitlements` → `applinks:tryeatpal.com` | Universal links handled by `DeepLinkHandler`. |
| App Groups | Both entitlements files → `group.com.eatpal.app` | Shared `UserDefaults` between app and widget. |

> **Note:** In-app purchases via `StoreKitService` do NOT require an entitlement. The `com.apple.developer.in-app-payments` key is for **Apple Pay (PassKit)**, not StoreKit IAP, and is intentionally not enabled for this app.

## CI / deploy workflows

| Workflow | File | Trigger |
|---|---|---|
| iOS CI (build + tests + lint) | `.github/workflows/ios-ci.yml` | PR + push to `main` touching `ios/**` |
| iOS App Store Deploy | `.github/workflows/ios-app-store-deploy.yml` | Manual `workflow_dispatch` |

Both workflows `brew install xcodegen` and run `xcodegen generate` before `xcodebuild`, so the committed state (no `.xcodeproj/`) is always the source of truth.

### Deploying to TestFlight / App Store

1. Configure secrets per `.github/IOS_DEPLOY_SETUP.md`.
2. Go to **Actions → iOS App Store Deploy → Run workflow**.
3. Enter a semver `version` (e.g. `1.0.0`) and optional release notes.
4. The build uploads to App Store Connect; it appears in TestFlight after 15–30 minutes of Apple processing.

Each successful deploy creates a git tag `ios/v<version>+<build>`.

## Not yet included

- Auto-submission for App Store review (the workflow uploads only; submit manually in App Store Connect).
- Sentry DSN wiring on iOS (web is done, iOS uses console logging).
