# EatPal Watch — manual setup (US-237)

This folder ships the Swift source for the EatPal watchOS companion app
+ its complications. **The Xcode targets themselves still need to be added
manually** — Apple's xcodeproj format is not safely scriptable from
outside Xcode.

## What's already in this folder

- `EatPalWatchApp.swift` — `@main` SwiftUI App entry point
- `WatchSessionStore.swift` — WCSession delegate; receives snapshots from
  the iPhone and writes grocery toggles back
- `Views/RootWatchView.swift`, `TodayView.swift`, `GroceryWatchView.swift`
  — the two-screen TabView
- `Complications/EatPalWatchComplications.swift` — WidgetKit-based Tonight
  + Grocery complications
- `../Shared/WatchSnapshot.swift` — shared payload model (also referenced
  by the iOS app target)
- `../EatPal/Services/WatchConnectivityService.swift` — the iPhone-side
  glue, already wired into `EatPalApp.task` and `AppState`'s widget-snapshot
  pipeline

## Xcode steps to wire this up

1. **Add a watchOS target.** In Xcode: `File → New → Target → watchOS →
   App`. Use `EatPalWatch` as the product name and bundle id
   `com.eatpal.app.watchkitapp`. Embed in `EatPal`. Untick "Include
   Notification Scene" (we don't need it yet).
2. **Replace the generated source.** Delete the placeholder files Xcode
   created and add the existing files in this folder (`EatPalWatchApp.swift`,
   `WatchSessionStore.swift`, `Views/*`, `Complications/*`) to the
   `EatPalWatch Watch App` target. Make sure they're *only* in that
   target's Compile Sources, not the iPhone target.
3. **Share `WatchSnapshot.swift`.** Add `ios/EatPal/Shared/WatchSnapshot.swift`
   to BOTH targets (iPhone `EatPal` + `EatPalWatch Watch App`). This is the
   one file that needs to compile in both processes.
4. **Add the complications target.** `File → New → Target → watchOS →
   Widget Extension`. Untick "Include Configuration Intent". Name it
   `EatPalWatchComplications`. Replace the generated source with
   `Complications/EatPalWatchComplications.swift`. Embed in the watch app.
5. **Watch entitlements.** The watch app target needs the same App Group
   (`group.com.eatpal.app`) the iPhone app already declares — that's how
   the complications read the cached snapshot from `WatchSessionStore`.
6. **Add `WatchConnectivity.framework`** to the iPhone `EatPal` target's
   "Frameworks, Libraries, and Embedded Content" — `WatchConnectivityService`
   imports it but the framework isn't auto-linked.
7. **Build settings.** Both watchOS targets should have iOS Deployment
   Target ≥ 10.0 and watchOS Deployment Target ≥ 10.0.

## Smoke testing

- Launch the iPhone app and the watch app on the simulator pair.
- Add or check a grocery item on the iPhone — the change should reach the
  watch within a few seconds (1.5s debounce + WCSession latency).
- Tap a grocery row on the watch; the iPhone should remove it from the
  unchecked list when the message arrives.
- Add the "Tonight" or "Grocery" complication to a watch face and confirm
  it shows the cached values.

## Known limitations / follow-ups

- **Log meal result from watch** — referenced in the AC but not yet
  implemented. Adding it requires a confirmation flow that fits the watch
  screen; deferred to a follow-up ticket.
- **Live Activity start from watch** — same scope concern; the existing
  `GroceryTripActivityService.start()` is iPhone-only.
- **Telemetry** — the `watch_action_count` event from the AC isn't wired
  yet. AnalyticsService runs on iPhone only; the watch would need its own
  lightweight breadcrumb forwarding.
- The complications refresh on a 15-30 minute timeline policy. WidgetKit
  doesn't surface a way to invalidate from the iPhone process directly;
  if real-time freshness becomes important, switch to
  `WidgetCenter.shared.reloadAllTimelines()` from inside `WatchSessionStore`
  on each snapshot receive.
