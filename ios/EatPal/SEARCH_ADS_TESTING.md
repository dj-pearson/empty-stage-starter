# Apple Search Ads — pre-launch testing plan

Scope: EatPal runs **Apple Search Ads** (App Store acquisition ads), not in-app
ad units. There is **no AdMob SDK, no banners/interstitials**, so the usual
in-app ad testing (layout, fill failure, ad-SDK crashes) does **not** apply.
What matters is: (1) paid installs land in a working app, and (2) you can
measure which campaigns convert. ATT is **not required** for Apple's
first-party attribution — only add it if you later adopt a third-party
attribution SDK (Adjust/AppsFlyer/Branch).

## 1. The thing ads actually exercise: cold start + deep links

Every paid click ends in a fresh launch and, increasingly, a deep/universal
link into a specific screen. If launch crashes or routing breaks, the spend is
wasted. This is already covered:

- **Cold start** — `.maestro/flows/smoke/01-cold-start.yaml` asserts a clean
  install boots to a rendered `AuthView`.
- **Deep-link / universal-link routing** — `EatPalTests/DeepLinkHandlerTests.swift`
  locks every `eatpal://` and `https://tryeatpal.com/app/...` route, plus the
  "don't swallow marketing URLs / foreign hosts" cases.

Before enabling campaigns, also manually verify on a **real device**:
- Tapping a `https://tryeatpal.com/app/...` link cold-opens the app to the
  right tab (universal links only work on device, not simulator).
- Custom-product-page / campaign landing deep links (if used) resolve.

## 2. Attribution (build + test) — measuring ad ROI

To attribute installs to campaigns, integrate Apple's first-party
**AdServices** framework (`import AdServices`) and fetch the attribution token
on first launch:

```swift
import AdServices
let token = try AAAttribution.attributionToken()   // POST to Apple's API server-side
```

This is **not yet integrated** (no `AdServices` usage in the codebase today).
When you add it, test:

- [ ] Token is fetched once on first launch and **never blocks UI** (run it in
      a detached `Task`; a slow/failed token must not delay the first screen).
- [ ] Failure is swallowed gracefully (no token on simulator / older OS /
      opted-out users) — app behaves identically with or without it.
- [ ] The token is sent to **Apple's attribution endpoint server-side** (via an
      edge function), never logged with PII. Add an `AnalyticsEvent` case for
      `search_ads_attribution_resolved` so it shows in the funnel — and add a
      contract test for it in `AnalyticsContractTests.swift`.
- [ ] Conversion postbacks: confirm `paywall_shown` → `purchase_completed`
      still fire (already guarded by `AnalyticsContractTests`). These are the
      events you'll measure ad ROI against.

## 3. SKAdNetwork / privacy manifest

- [ ] `PrivacyInfo.xcprivacy` declares any new data use if you add attribution.
      (Apple's own attribution token does **not** require an ATT prompt or a
      "tracking" declaration, but adding a 3rd-party SDK does.)
- [ ] If conversion-value updates are used, verify `updatePostbackConversionValue`
      calls fire at the intended funnel milestones.

## 4. Pre-ads go/no-go checklist

- [ ] `ios-ci.yml` green (build + XCTest + coverage floor + SwiftLint blocking).
- [ ] `ios-ui-smoke.yml` green (Maestro cold-start + auth-screen).
- [ ] Manual real-device pass: universal link, Apple Sign-In, onboarding,
      add kid, build a plan, scan a barcode, grocery list.
- [ ] Crash-free rate on the current TestFlight build ≥ 99.5% in Sentry
      (`SentryService`). Don't promote a build below this to the ad cohort.
- [ ] Attribution token + conversion postbacks verified end-to-end (section 2).
- [ ] Force-update gate (`ForceUpdateService`) confirmed working, so a bad
      build behind a paid push can be cut off fast.

## Not in scope (Apple Search Ads has no in-app ads)

In-app banner/interstitial layout, ad-fill failure, offline ad degradation,
AdMob test unit IDs, child-directed ad config. Revisit only if EatPal ever adds
an in-app ad network.
