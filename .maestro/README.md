# Maestro iOS UI smoke tests

End-to-end UI flows that drive the **actual built `EatPal.app`** on a simulator
— the layer that XCTest (logic) and Playwright (web) don't cover. This is the
"is the app broken on launch" gate to run before turning on Apple Search Ads.

## Layout

```
.maestro/
  flows/
    smoke/            # No credentials, no backend — always run in CI
      01-cold-start.yaml
      02-auth-screen.yaml
    authenticated/    # Opt-in — needs a seeded test account + real backend
      login-and-navigate.yaml
```

The **smoke** flows run with placeholder Supabase creds: the session check
fails, the app falls through to `AuthView`, and we assert it renders and the
sign-in/sign-up toggle works. That catches launch crashes, broken initial
render, and dead auth controls without any test data.

## Run locally

```bash
# 1. Install Maestro (one-time)
curl -Ls https://get.maestro.mobile.dev | bash

# 2. Build + install the app on a booted simulator
cd ios/EatPal
xcodegen generate
xcodebuild build \
  -project EatPal.xcodeproj -scheme EatPal \
  -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 16' \
  -configuration Debug -derivedDataPath build \
  SUPABASE_URL="https://placeholder.supabase.co" \
  SUPABASE_ANON_KEY="placeholder" \
  CODE_SIGNING_ALLOWED=NO
xcrun simctl install booted build/Build/Products/Debug-iphonesimulator/EatPal.app

# 3. Run the smoke flows
maestro test .maestro/flows/smoke

# 4. (Optional) authenticated flow against a real backend
export MAESTRO_TEST_EMAIL="qa+ci@tryeatpal.com"
export MAESTRO_TEST_PASSWORD="..."
maestro test .maestro/flows/authenticated
```

## CI

`.github/workflows/ios-ui-smoke.yml` runs the `smoke` folder on every PR that
touches `ios/**`. The `authenticated` folder is only run when the
`MAESTRO_TEST_EMAIL` / `MAESTRO_TEST_PASSWORD` repo secrets are present and the
build is pointed at a real Supabase project.

## Hardening: accessibility identifiers

Text matching is brittle (e.g. "Sign In" is both a segment label and the submit
button). The durable fix is to add stable IDs in SwiftUI and match on them:

```swift
TextField("you@example.com", text: $authViewModel.email)
    .accessibilityIdentifier("auth.email")
Button { ... } label: { Text(submitButtonTitle) }
    .accessibilityIdentifier("auth.submit")
```

Then in a flow: `- tapOn: { id: "auth.submit" }`. Adding IDs to the auth fields,
the submit button, and the five tab items would let us delete the index-based
matching and write much deeper authenticated flows safely. This is the highest-
leverage next step for expanding UI coverage.
