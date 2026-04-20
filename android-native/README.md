# EatPal — Native Android (Kotlin + Jetpack Compose)

This module is the **native Android** counterpart to the iOS Swift app at
`ios/EatPal/`. It mirrors the iOS service architecture 1:1 so Supabase rows
round-trip between the two without a translation layer.

It lives alongside the existing `android/` React-Native/Expo host. Once feature
parity is reached, `android/` can be retired in favor of this module.

## Stack

| Layer | iOS | Android |
|---|---|---|
| UI | SwiftUI | Jetpack Compose (Material 3) |
| State | `@MainActor ObservableObject` | `StateFlow` + `AppStateStore` (Hilt singleton) |
| Async | Swift Concurrency | Kotlin Coroutines / Flow |
| DI | Singletons | Hilt |
| Navigation | `NavigationStack` | Navigation-Compose (stubbed) |
| DB client | `supabase-swift` | `supabase-kt` (`io.github.jan-tennert.supabase`) |
| Offline | SwiftData (`CachedFood`/`PendingMutation`) | Room (same entities, same semantics) |
| Realtime | `client.realtimeV2.channel(...)` | `client.channel(...).postgresChangeFlow<PostgresAction>` |
| Network monitor | `NWPathMonitor` | `ConnectivityManager.NetworkCallback` |
| Crash reporting | Sentry Cocoa | Sentry Android |
| Image loading | `AsyncImage` | Coil |
| Push | APNs + UNUserNotification | FCM (PRD) |
| Health | HealthKit | Health Connect (PRD) |
| Billing | StoreKit 2 | Google Play Billing (PRD) |

## Build

1. Put secrets in `env.local.properties` at the repo root (same dir as `package.json`):
   ```
   SUPABASE_URL=https://api.tryeatpal.com
   SUPABASE_ANON_KEY=eyJ...
   SENTRY_DSN=
   ```
   The Gradle script reads these at build time and exposes them via
   `BuildConfig` — never commit real keys.

2. Open `android-native/` in Android Studio (Koala or newer), sync Gradle.

3. Run on a device/emulator with API 26+.

## Wire contract with iOS

All `@Serializable` data classes use `@SerialName` snake_case names matching the
Swift `CodingKeys`. That's the load-bearing contract — if you rename a column
on one platform, rename it on the other in the same PR, or realtime events from
the opposite client will silently fail to decode.

## Parity checklist

See `../prd.json` for the full roadmap (UI screens, Health Connect, Play Billing,
Glance widgets, App Shortcuts, Share target, AI services, notifications,
MLKit barcode/OCR, etc.).
