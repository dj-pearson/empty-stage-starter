# iOS App Store Deploy — End-to-End Setup

Everything you need to go from a fresh Apple Developer account to a TestFlight build via the `iOS App Store Deploy` GitHub Action.

Work through the phases in order. Each phase ends with the concrete artifacts you should have before moving on.

---

## Overview

| Phase | Where | What |
|---|---|---|
| 1 | Apple Developer portal | Team ID, App IDs, capabilities, signing certs, APNs key, Sign in with Apple key, App Group, provisioning profiles |
| 2 | App Store Connect | App record, bundle ID, TestFlight config, IAP products, app metadata, App Review info |
| 3 | Supabase | Apple OAuth provider, allowed redirect URLs, Edge Function secrets |
| 4 | GitHub | Repo secrets (everything the workflow consumes) |
| 5 | GitHub Actions | Run `iOS App Store Deploy` → TestFlight |

## What you can reuse from another iOS project

If you've already shipped an app from the same Apple Developer account, **most Apple-level credentials are account-wide** — don't regenerate them.

Each step below is tagged:

- 🟢 **REUSE** — account-wide, copy the value/secret from your other project
- 🟠 **REUSE-IF** — reusable under a specific condition (noted inline)
- 🔴 **NEW** — must be created fresh for EatPal (app-specific)

**Short version — if you have another iOS app already deployed:**

| Secret | Status |
|---|---|
| `APPLE_TEAM_ID` | 🟢 REUSE |
| `IOS_P12_CERTIFICATE_BASE64` + `IOS_P12_PASSWORD` | 🟢 REUSE |
| `IOS_KEYCHAIN_PASSWORD` | 🟢 REUSE (or any random string) |
| `APP_STORE_CONNECT_API_KEY_ID` / `ISSUER_ID` / `API_KEY_BASE64` | 🟢 REUSE |
| APNs `.p8` auth key | 🟢 REUSE (one key serves all team apps; Apple caps at 2) |
| Sign in with Apple `.p8` key | 🟠 REUSE-IF the key's Primary App ID is grouped with `com.eatpal.app` |
| `IOS_PROVISIONING_PROFILE_BASE64` | 🔴 NEW (bound to `com.eatpal.app`) |
| `IOS_WIDGET_PROVISIONING_PROFILE_BASE64` | 🔴 NEW (bound to `com.eatpal.app.widget`) |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | 🟠 REUSE-IF the other project uses the same Supabase project |

The only Apple secrets you must *always* regenerate are the two provisioning profiles — everything else is optional.

**Bundle IDs used by this project:**
- App: `com.eatpal.app`
- Widget extension: `com.eatpal.app.widget`
- App Group shared between them: `group.com.eatpal.app`

**Capabilities the app declares** (from `ios/EatPal/EatPal/EatPal.entitlements`):
Push Notifications · Sign in with Apple · Associated Domains (`applinks:tryeatpal.com`) · App Groups · In-App Purchase.

---

## Phase 1 — Apple Developer portal

Prerequisite: paid Apple Developer Program membership ($99/yr). Login at <https://developer.apple.com/account>.

### 1.1 Record your Team ID — 🟢 REUSE

Top-right of the developer account page (10-character alphanumeric, e.g. `ABCDE12345`).
→ Save as **`APPLE_TEAM_ID`**.

One Team ID per Developer account — same value for every app you ship.

### 1.2 Register App IDs (Identifiers) — 🔴 NEW

<https://developer.apple.com/account/resources/identifiers/list>

Create **two** App IDs (type: App IDs → App):

**App 1 — `com.eatpal.app`** (Explicit)
- Description: `EatPal`
- Enable these capabilities:
  - [x] App Groups
  - [x] Associated Domains
  - [x] In-App Purchase
  - [x] Push Notifications
  - [x] Sign in with Apple

**App 2 — `com.eatpal.app.widget`** (Explicit)
- Description: `EatPal Widget`
- Enable:
  - [x] App Groups

### 1.3 Create the App Group — 🔴 NEW

Identifiers → App Groups → `+`
- Description: `EatPal Shared`
- Identifier: `group.com.eatpal.app`

Then edit **both** App IDs above → Configure App Groups → tick `group.com.eatpal.app`.

### 1.4 Configure Associated Domains — 🔴 NEW

On `com.eatpal.app`: Configure Associated Domains is automatic — declared in the entitlements file. Host `tryeatpal.com` must serve an `apple-app-site-association` file at `https://tryeatpal.com/.well-known/apple-app-site-association` pointing to `<TEAM_ID>.com.eatpal.app`. (Not part of this workflow — deploy separately to your web host.)

### 1.5 Create the Distribution Certificate — 🟢 REUSE

If another iOS project already has an **Apple Distribution** cert exported, paste the same `IOS_P12_CERTIFICATE_BASE64` and `IOS_P12_PASSWORD` — one cert signs every app in your team (Apple caps you at 2 distribution certs, so reusing is the norm).

If you need a fresh one: Certificates → `+` → **Apple Distribution** → follow the CSR flow from Keychain Access on a Mac.

Once installed in Keychain Access:
1. Find "Apple Distribution: <Your Name>" (expand to see the private key underneath).
2. Right-click the certificate row → **Export** → `.p12` format. Set a password — save it.
3. Base64 encode:
   ```bash
   base64 -i EatPalDistribution.p12 | pbcopy
   ```
   → **`IOS_P12_CERTIFICATE_BASE64`** (GitHub secret)
   → **`IOS_P12_PASSWORD`** = the password you chose

### 1.6 Create the APNs Auth Key (Push Notifications) — 🟢 REUSE

**One APNs auth key serves every app on your team.** Apple caps you at 2 active APNs keys total, so if another project already has one, reuse its `.p8` + Key ID — do not generate a new one.

Only if you don't have one: Keys → `+` → enable **Apple Push Notifications service (APNs)** → Continue → Register. Download the `.p8` file (one-time download). Note the **Key ID** (10 chars).

You'll paste these into Supabase (see 3.3) or your push backend. Keep the `.p8` file secure — Apple will not let you re-download it.

### 1.7 Create the Sign in with Apple Key — 🟠 REUSE-IF grouped

Sign in with Apple keys are scoped to a **Primary App ID** and any App IDs *grouped under it*. Two paths:

- **Reuse path** — If another app already has a Sign in with Apple key and you want to share it with EatPal, edit that key's Primary App ID grouping to include `com.eatpal.app`. Then reuse the same `.p8` and Key ID.
- **Fresh path** — Keys → `+` → enable **Sign in with Apple** → Configure → Primary App ID = `com.eatpal.app`. Download `.p8`, note the Key ID.

Either way, these values feed into Supabase (see 3.1) to generate the client secret.

### 1.8 Create a Services ID (web Apple login) — 🟠 REUSE-IF same domain

If your web app also signs users in with Apple, create a Services ID:
Identifiers → `+` → Services IDs → e.g. `com.eatpal.app.web` → Configure → Sign in with Apple → Primary App ID `com.eatpal.app` → add your website domain and Supabase callback URL `https://<your-supabase-project>.supabase.co/auth/v1/callback`.

For iOS-only this is not required (the native Sign in with Apple flow uses the App ID directly).

### 1.9 Create App Store Provisioning Profiles — 🔴 NEW

These are always app-specific — profiles embed the App ID and entitlements, so you can't reuse another app's profile here.

Profiles → `+` → **App Store** (Distribution):

**Profile 1**
- App ID: `com.eatpal.app`
- Certificate: the Apple Distribution cert from 1.5
- Name (exact): **`EatPal App Store`**
- Download → keep the `.mobileprovision` file

**Profile 2**
- App ID: `com.eatpal.app.widget`
- Certificate: same Apple Distribution cert
- Name (exact): **`EatPal Widget App Store`**
- Download

> The names must match `ios/EatPal/ExportOptions.plist` exactly, or the export step fails. If you name them differently, edit that plist.

Base64 both:
```bash
base64 -i EatPal_AppStore.mobileprovision | pbcopy          # → IOS_PROVISIONING_PROFILE_BASE64
base64 -i EatPal_Widget_AppStore.mobileprovision | pbcopy   # → IOS_WIDGET_PROVISIONING_PROFILE_BASE64
```

### Phase 1 exit check
- [ ] Team ID saved
- [ ] Two App IDs registered with correct capabilities
- [ ] App Group `group.com.eatpal.app` created and attached to both App IDs
- [ ] `.p12` distribution cert exported and base64-encoded
- [ ] APNs `.p8` key saved
- [ ] Sign in with Apple `.p8` key saved
- [ ] Two provisioning profiles downloaded and base64-encoded

---

## Phase 2 — App Store Connect

<https://appstoreconnect.apple.com>

### 2.1 Create the App

My Apps → `+` → **New App**:
- Platform: iOS
- Name: `EatPal` (shown on the App Store — must be unique)
- Primary language: English (U.S.)
- Bundle ID: `com.eatpal.app` (select from the dropdown — if missing, re-do 1.2)
- SKU: `EATPAL_IOS_001` (any unique internal identifier)
- User Access: Full Access

### 2.2 App Information (left sidebar → App Information)

- Subtitle (30 chars): e.g. `Family Meal Planning`
- Category: Food & Drink (primary), Health & Fitness (secondary)
- Content Rights: check if you have the rights to all content
- Age Rating: complete the questionnaire (likely 4+)

### 2.3 Pricing and Availability

- Price: Free (paid tiers via IAP below)
- Availability: All countries, or restrict as needed

### 2.4 In-App Purchase products

Features → In-App Purchases → `+` → **Auto-Renewable Subscription**.
Create a subscription group `EatPal Subscriptions`, then six products matching the hardcoded IDs in `ios/EatPal/EatPal/Services/StoreKitService.swift`:

| Product ID | Duration | Tier | Price (USD) |
|---|---|---|---|
| `com.eatpal.app.pro.monthly` | 1 month | Pro | $14.99 |
| `com.eatpal.app.pro.yearly` | 1 year | Pro | $143.90 |
| `com.eatpal.app.familyplus.monthly` | 1 month | Family Plus | $24.99 |
| `com.eatpal.app.familyplus.yearly` | 1 year | Family Plus | $239.90 |
| `com.eatpal.app.professional.monthly` | 1 month | Professional | $99.00 |
| `com.eatpal.app.professional.yearly` | 1 year | Professional | $950.00 |

For each: fill in reference name, price, display name and description in at least one locale, upload a 1024×1024 review screenshot. Submit for review (IAP is reviewed alongside the first app version).

Also enable a **7-day free trial** introductory offer on all six products for new subscribers.

> The product IDs are **hardcoded** — don't rename them without updating `StoreKitService.swift`.
> Full ASO metadata, per-product display names and descriptions, feature matrix, and pricing rationale live in `documents/APP_STORE_CONNECT_SETUP.md`.

### 2.5 App Privacy

Complete the privacy questionnaire. The data you collect (per `ios/EatPal/EatPal/Resources/PrivacyInfo.xcprivacy`):
- Email Address — linked, not used for tracking, purpose: App Functionality
- Name — linked, not tracking, App Functionality
- User ID — linked, not tracking, App Functionality
- Photos — linked, not tracking, App Functionality
- Health & Fitness (nutrition info) — linked, not tracking, App Functionality

No tracking. No advertising identifiers.

### 2.6 TestFlight — Test Information

TestFlight → App Information:
- Beta App Description (what testers should know)
- Beta App Feedback Email
- Marketing URL (optional)
- Privacy Policy URL (required): e.g. `https://tryeatpal.com/privacy`

Builds uploaded by the workflow appear here after ~15–30 min of Apple processing.

### 2.7 Version metadata (for the `1.0` App Store submission)

App Store tab → 1.0:
- What's New (per locale)
- Promotional Text
- Description
- Keywords (comma-separated, max 100 chars)
- Support URL (required): e.g. `https://tryeatpal.com/support`
- Marketing URL (optional)
- Screenshots: 6.7" iPhone (required) + 5.5" iPhone + 12.9" iPad (if iPad supported). Minimum 3 per size, PNG/JPG.
- App Review Information:
  - Demo account email + password (Apple's reviewers must be able to sign in)
  - Notes explaining anything that isn't obvious (e.g. IAP flow, parental features)
- Version Release: Manually release / Automatically release after review / Scheduled

### 2.8 App Store Connect API Key (for GitHub Actions) — 🟢 REUSE

API keys are team-wide — one "App Manager" key can upload any app in the team. If another project already has a working key in CI, reuse the same `APP_STORE_CONNECT_API_KEY_ID`, `ISSUER_ID`, and `APP_STORE_CONNECT_API_KEY_BASE64` values.

Only if you need a fresh one: Users and Access → Keys tab (under **Integrations** in the new UI) → `+`:
- Name: `GitHub Actions Deploy`
- Access: **App Manager** (minimum required for `altool --upload-app`)
- Download `.p8` — only available **once**. Store it safely.
- Note the **Key ID** (10 chars) and **Issuer ID** (UUID, top of the keys page).

```bash
base64 -i AuthKey_XXXXXXXXXX.p8 | pbcopy
```
→ **`APP_STORE_CONNECT_API_KEY_BASE64`**
→ **`APP_STORE_CONNECT_API_KEY_ID`** = the Key ID
→ **`APP_STORE_CONNECT_ISSUER_ID`** = the Issuer ID

### Phase 2 exit check
- [ ] App record created with bundle ID `com.eatpal.app`
- [ ] Category, age rating, privacy questionnaire complete
- [ ] 6 IAP products created with exact IDs from `StoreKitService.swift` (Pro/Family Plus/Professional × monthly/yearly)
- [ ] TestFlight info filled (beta description, feedback email, privacy policy URL)
- [ ] App Store 1.0 metadata drafted (description, keywords, screenshots, support URL)
- [ ] App Review demo credentials prepared
- [ ] App Store Connect API key generated and base64-encoded

---

## Phase 3 — Supabase configuration

### 3.1 Enable Apple OAuth provider

Supabase dashboard → Authentication → Providers → **Apple** → Enable.

Fields required:
- **Services ID** — if you created one in 1.8, use that; otherwise use the App ID `com.eatpal.app` for native-only flows.
- **Secret Key** — Supabase will generate the JWT client secret for you if you paste:
  - **Team ID** (from 1.1)
  - **Key ID** (from 1.7)
  - **Private Key** — contents of the Sign in with Apple `.p8` file (open in a text editor, copy the full `-----BEGIN PRIVATE KEY-----` block)

Redirect URL to whitelist under Apple's Services ID config (if you created one):
```
https://<your-project-ref>.supabase.co/auth/v1/callback
```

### 3.2 Allowed redirect URLs

Authentication → URL Configuration:
- Site URL: `https://tryeatpal.com`
- Additional redirect URLs: add
  ```
  eatpal://auth-callback
  https://tryeatpal.com/auth/callback
  ```
  The `eatpal://` scheme matches `CFBundleURLSchemes` in `Info.plist`.

### 3.3 Edge Function secrets

The iOS app calls these Edge Functions (found via `client.functions.invoke` in `ios/EatPal/EatPal/Services/`):

| Function | Called by | Secrets it needs |
|---|---|---|
| `ai-coach-chat` | `AICoachService.swift` | `OPENAI_API_KEY` (or Anthropic, depending on impl — check `supabase/functions/ai-coach-chat/index.ts`) |
| `ai-meal-plan` | `AIMealService.swift` | Same as above |
| `enrich-barcodes` | `BarcodeService.swift` (if wired) | `OPENFOODFACTS_USER_AGENT` or similar |
| `create-checkout` / Stripe webhooks | not iOS — web only | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |

Set these in Supabase: **Project Settings → Edge Functions → Secrets** (or via CLI: `supabase secrets set KEY=VALUE`).

Required for iOS-relevant Edge Functions:
```
OPENAI_API_KEY=sk-proj-XXXXXXXXXXXXXXXX
```

Optional but recommended:
```
SENTRY_DSN=https://XXXX@XXXX.ingest.sentry.io/XXXX
RESEND_API_KEY=re_XXXXXXXXXXXXXXXX
```

Deploy the functions themselves from your Mac / CI:
```bash
supabase functions deploy ai-coach-chat
supabase functions deploy ai-meal-plan
```

### 3.4 APNs push configuration (if you send push via Supabase)

If push notifications are delivered through a Supabase Edge Function (check `push-notifications` function) you need to set:
```
APNS_KEY_ID=<Key ID from 1.6>
APNS_TEAM_ID=<Team ID from 1.1>
APNS_PRIVATE_KEY=<contents of APNs .p8 file>
APNS_TOPIC=com.eatpal.app
APNS_ENVIRONMENT=production
```

If you use a third-party push service (OneSignal, Airship, etc.), configure it there instead and skip this.

### Phase 3 exit check
- [ ] Apple provider enabled in Supabase Auth
- [ ] Redirect URLs include `eatpal://auth-callback`
- [ ] `OPENAI_API_KEY` set as Edge Function secret
- [ ] APNs key installed on whatever service sends push
- [ ] AI Edge Functions deployed

---

## Phase 4 — GitHub Secrets

Repository **Settings → Secrets and variables → Actions → New repository secret**.

The **Reuse** column tells you whether you can copy the value from an existing GitHub repo or your password manager instead of regenerating.

### 4.1 Code signing

| Secret | Source | Reuse? |
|---|---|---|
| `IOS_P12_CERTIFICATE_BASE64` | Phase 1.5 | 🟢 Team-wide |
| `IOS_P12_PASSWORD` | Phase 1.5 | 🟢 Team-wide |
| `IOS_KEYCHAIN_PASSWORD` | `openssl rand -hex 16` | 🟢 Any random string works |
| `IOS_PROVISIONING_PROFILE_BASE64` | Phase 1.9 (app) | 🔴 App-specific |
| `IOS_WIDGET_PROVISIONING_PROFILE_BASE64` | Phase 1.9 (widget) | 🔴 App-specific |

### 4.2 App Store Connect API

| Secret | Source | Reuse? |
|---|---|---|
| `APP_STORE_CONNECT_API_KEY_ID` | Phase 2.8 | 🟢 Team-wide |
| `APP_STORE_CONNECT_ISSUER_ID` | Phase 2.8 | 🟢 Team-wide |
| `APP_STORE_CONNECT_API_KEY_BASE64` | Phase 2.8 | 🟢 Team-wide |

### 4.3 App runtime configuration

These are baked into the built IPA via `xcodebuild` arguments (passed to `Info.plist` substitutions).

| Secret | Description | Reuse? |
|---|---|---|
| `SUPABASE_URL` | Your Supabase project URL, e.g. `https://api.tryeatpal.com` | 🟠 If same Supabase project as another EatPal platform |
| `SUPABASE_ANON_KEY` | Supabase anon/public key | 🟠 Same as above |

> The iOS app uses the built-in Supabase Functions URL derivation (same hostname under `/functions/v1/…`) so no separate `FUNCTIONS_URL` secret is needed for iOS. If you host Edge Functions on a different domain, add one and thread it through `SupabaseClient.swift` and the workflow.

### 4.4 Quick sanity script

Run this locally (macOS) to verify every secret encodes/decodes cleanly before pasting:
```bash
for f in EatPalDistribution.p12 EatPal_AppStore.mobileprovision \
         EatPal_Widget_AppStore.mobileprovision AuthKey_XXXXXXXXXX.p8; do
  echo "== $f =="
  [ -f "$f" ] || { echo "MISSING"; continue; }
  base64 -i "$f" | base64 -D | cmp -s - "$f" && echo "OK" || echo "CORRUPT"
done
```

---

## Phase 5 — Run the deploy

1. **Actions** tab → **iOS App Store Deploy** → **Run workflow**.
2. Inputs:
   - **version** — semver (e.g. `1.0.0`). Must be ≥ the version currently in App Store Connect.
   - **build_number** — leave blank for auto (`YYYYMMDD.<run>`). Must be strictly greater than the last uploaded build for the same `version`.
   - **release_notes** — short TestFlight "What to Test" note.
   - **submit_for_review** — leave unchecked for the first run; submit manually in App Store Connect once you verify on TestFlight.
3. Click Run workflow. A green run takes ~12–18 minutes.
4. On success:
   - Build lands in TestFlight → processing (~15–30 min) → installable on internal testers.
   - Git tag `ios/v<version>+<build>` is pushed.

---

## Pre-flight checklist for the first App Store submission

Code and config:
- [ ] `ios/EatPal/EatPal/Resources/Assets.xcassets/AppIcon.appiconset/` contains actual PNGs at every required size (currently only `Contents.json` — App Store will reject without icons).
- [ ] `LaunchIcon.imageset` contains a 1×/2×/3× PNG.
- [ ] `ios/EatPal/EatPal/Resources/Info.plist` bundle display name is correct.
- [ ] `apple-app-site-association` file is live at `https://tryeatpal.com/.well-known/` for universal links.
- [ ] Privacy Policy URL resolves (required for App Store review).
- [ ] Support URL resolves.

App Store Connect:
- [ ] App metadata complete for en-US (description, keywords, screenshots, promotional text).
- [ ] All 6 IAP products in `Ready to Submit` status.
- [ ] Age rating questionnaire answered.
- [ ] Privacy questionnaire matches `PrivacyInfo.xcprivacy`.
- [ ] App Review Info has demo account credentials that actually work.
- [ ] Export Compliance: the workflow sets `ITSAppUsesNonExemptEncryption = false` in Info.plist — confirm that remains accurate (only standard TLS, no custom crypto).

Supabase:
- [ ] Apple OAuth provider enabled and tested.
- [ ] Production Edge Functions deployed and responding.
- [ ] RLS policies verified for `foods`, `kids`, `recipes`, `plan_entries`, `grocery_items`, `grocery_lists`.
- [ ] A test account exists for App Review with realistic data.

GitHub:
- [ ] All 10 secrets in section 4 are set.
- [ ] `.github/workflows/ios-app-store-deploy.yml` has the bundle ID you intend (currently `com.eatpal.app`).

---

## Troubleshooting

**`No profiles for 'com.eatpal.app' were found`**
Profile name in `ExportOptions.plist` doesn't match what you created in the developer portal, or the profile isn't installed on the runner. Check section 1.9.

**`Code signing "Apple Distribution" requires a provisioning profile`**
The widget target is unsigned. Ensure `IOS_WIDGET_PROVISIONING_PROFILE_BASE64` is set and the profile's App ID is `com.eatpal.app.widget`.

**`altool: Authentication failed`**
`APP_STORE_CONNECT_API_KEY_ID` / `ISSUER_ID` / `API_KEY_BASE64` mismatch, or the key's role is below **App Manager**.

**`Invalid Bundle. The bundle … does not support the minimum OS Version`**
`IPHONEOS_DEPLOYMENT_TARGET` (17.0) in `project.yml` is higher than what some embedded framework supports. Lower it or update dependencies.

**`ITMS-90161: Invalid Provisioning Profile Signature`**
Provisioning profile was regenerated but the secret wasn't updated. Re-download and re-encode.

**`ITMS-90189: Missing Purpose String`**
Info.plist is missing a `Ns*UsageDescription` for a framework you're linking (e.g. added HealthKit but no description). Grep Info.plist for each new API.

**Build succeeds, nothing appears in TestFlight after 30 min**
Check the email associated with your Apple Developer account — Apple emails processing failures (missing icons, export compliance issues, IAP not submitted) asynchronously.

**Widget doesn't update in TestFlight**
Widget target isn't being signed/embedded. Confirm `EatPalWidgetExtension` dependency on `EatPal` target in `project.yml` has `embed: true, codeSign: true`, and regenerate with `xcodegen generate`.

---

## Version strategy

- **Major** (`2.0.0`) — breaking changes or major redesign
- **Minor** (`1.1.0`) — new features
- **Patch** (`1.0.1`) — bug fixes
- **Build** — auto `YYYYMMDD.<run_number>`, must strictly increase per version

Each successful deploy creates a git tag: `ios/v1.0.0+20260414.42`.
