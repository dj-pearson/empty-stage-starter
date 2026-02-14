# EatPal iOS - Native Swift App

Native iOS client for EatPal (Munch Maker Mate) built with SwiftUI and targeting iOS 17+.

## Requirements

- Xcode 15.0+
- iOS 17.0+
- Swift 5.9+

## Setup

1. Open `EatPal/Package.swift` in Xcode (File > Open > select Package.swift)
2. Xcode will resolve the Supabase Swift SDK dependency automatically
3. Configure your Supabase credentials:
   - Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` as build settings or in the scheme environment

## Architecture

- **Pattern**: MVVM with SwiftUI
- **State Management**: `@EnvironmentObject` with `AppState` (mirrors web AppContext)
- **Networking**: Supabase Swift SDK (async/await)
- **Auth**: Supabase Auth (email/password, Apple Sign-In)
- **Design System**: `AppTheme` with centralized colors, spacing, radii, animations
- **Feedback**: Toast notifications, haptic feedback, offline banner

## Project Structure

```
EatPal/
├── App/                    # App entry point, root view, global state
│   ├── EatPalApp.swift     # @main entry
│   ├── RootView.swift      # Auth routing (loading/unauth/auth/onboarding)
│   └── AppState.swift      # Central state with toast + haptic integration
├── Models/                 # Codable data models matching Supabase schema
│   ├── Food.swift
│   ├── Kid.swift
│   ├── Recipe.swift
│   ├── PlanEntry.swift
│   └── GroceryItem.swift
├── Services/               # Backend communication
│   ├── SupabaseClient.swift
│   ├── AuthService.swift
│   └── DataService.swift
├── ViewModels/             # View-specific logic
│   └── AuthViewModel.swift
├── Views/
│   ├── Auth/               # Sign in, sign up, forgot password, onboarding
│   ├── Dashboard/          # Tab view, home dashboard, more menu
│   ├── Pantry/             # Food management with categories
│   ├── Grocery/            # Grocery list with check-off
│   ├── MealPlan/           # Weekly calendar meal planner
│   ├── Kids/               # Child profile management
│   ├── Recipes/            # Recipe browser and creator
│   ├── Settings/           # Account, notifications, appearance
│   └── Components/         # CachedAsyncImage, skeleton loaders, shared UI
├── Utilities/              # Design system, toast, haptics, network monitor
│   ├── AppTheme.swift      # Colors, spacing, radii, animations
│   ├── ToastManager.swift  # Toast notification system
│   ├── HapticManager.swift # Haptic feedback
│   ├── NetworkMonitor.swift # Connectivity monitoring + offline banner
│   ├── DateFormatters.swift
│   └── PasswordValidator.swift
└── Resources/              # Assets, Info.plist
```

## Features Included

- **Auth**: Email/password sign in & sign up with password strength validation, Apple Sign-In, forgot password
- **Onboarding**: 5-screen first-time user walkthrough with skip option
- **Meal Planner**: Weekly calendar view, per-child meal slots, result logging (ate/tasted/refused)
- **Pantry**: Full food management, category filtering, safe/try-bite toggles, allergen display
- **Grocery List**: Categorized items, check-off, priority, swipe-to-delete, clear completed
- **Recipes**: Browse, create, detail view with nutrition info, difficulty filtering, ingredient selection
- **Kids**: Child profiles with age, allergens, pickiness level, eating stats
- **Food Tracker**: Result history with ate/tasted/refused statistics
- **Insights**: Pantry distribution, food safety stats, weekly coverage
- **Settings**: Account info, notifications, appearance (light/dark/system), sign out
- **Toast Notifications**: Success/error/warning/info feedback on all CRUD operations
- **Haptic Feedback**: Native tactile feedback on interactions (save, delete, toggle)
- **Network Monitor**: Offline detection with banner, graceful error handling
- **Async Images**: Remote profile pictures and recipe thumbnails with placeholder
- **Skeleton Loading**: Shimmer loading states during data fetch
- **Accessibility**: Labels, hints, VoiceOver support throughout

## CI/CD: App Store Deployment

A GitHub Actions workflow at `.github/workflows/ios-app-store-deploy.yml` handles building and uploading to the App Store.

**Manual trigger with version input:**
1. Go to Actions > iOS App Store Deploy > Run workflow
2. Enter semver version (e.g., `1.0.0`)
3. Optionally set build number, release notes, auto-submit for review

See `.github/IOS_DEPLOY_SETUP.md` for required secrets and setup instructions.

## Not Included (Web Only)

- Homepage / marketing landing page
- Admin dashboard
- Blog CMS
- AI Coach / AI Planner (future iOS release)
- Grocery delivery integrations
- Barcode scanning (future iOS release)
