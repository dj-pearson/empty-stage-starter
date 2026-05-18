# EatPal Android — Release Guide

End-to-end walkthrough for shipping the native Android app to Google Play, from generating your first signing keystore to fully automated signed-AAB builds via GitHub Actions. Designed to be checked off step-by-step — every actionable item has a `- [ ]` box.

> **Audience**: Someone with no prior Android release experience but comfortable with `git`, the terminal, and Android Studio. iOS is already live on the App Store at `com.eatpal.app`, so this guide assumes parity decisions (same name, same icon, same screenshots, same privacy policy URL) wherever possible.
>
> **Stack snapshot** (verify these still match your repo before running the steps):
> - AGP 8.7.3
> - Gradle 8.13
> - Kotlin 2.x
> - Android Studio Koala / Panda 2
> - Package name (`applicationId`): `com.eatpal.app` (locked — matches iOS bundle ID)
>
> **Time budget**:
> - First deploy through manual upload to Play Console: 4–6 hours spread across 2 days (most of the time is filling forms + waiting on Play account verification).
> - New-account testing requirement adds **at least 14 days** before production release.
> - GitHub Actions automation after that: 30 minutes.

---

## Table of contents

1. [Pre-flight checklist](#1-pre-flight-checklist)
2. [Create the upload keystore (one-time)](#2-create-the-upload-keystore-one-time)
3. [Wire local signing](#3-wire-local-signing)
4. [Build a signed AAB locally](#4-build-a-signed-aab-locally)
5. [Play Console: create developer account + app](#5-play-console-create-developer-account--app)
6. [Play Console: App content checklist](#6-play-console-app-content-checklist)
7. [Privacy policy + Data safety form](#7-privacy-policy--data-safety-form)
8. [Content rating questionnaire](#8-content-rating-questionnaire)
9. [Store listing (Main store listing)](#9-store-listing-main-store-listing)
10. [Upload the first AAB to Internal Testing](#10-upload-the-first-aab-to-internal-testing)
11. [Closed testing + new-account 20/14 requirement](#11-closed-testing--new-account-2014-requirement)
12. [Promote to Production](#12-promote-to-production)
13. [Firebase project setup (for FCM push)](#13-firebase-project-setup-for-fcm-push)
14. [Google Cloud service account (Play Developer API)](#14-google-cloud-service-account-play-developer-api)
15. [GitHub Actions automation](#15-github-actions-automation)
16. [Versioning convention](#16-versioning-convention)
17. [Troubleshooting](#17-troubleshooting)
18. [Quick-reference: minimum viable first release](#18-quick-reference-minimum-viable-first-release)

---

## 1. Pre-flight checklist

Before opening Play Console for the first time, confirm:

- [ ] **Google Play Developer account paid** — $25 one-time fee at <https://play.google.com/console/signup>. **Allow 24–48 hours for verification**; for new accounts created in 2023+, Google requires phone + ID verification before any uploads.
- [ ] **Account type chosen correctly** — Personal vs. Organization. Organization (recommended for EatPal under Pearson Media LLC) requires a **D-U-N-S number** which takes 1–2 weeks to obtain free from <https://www.dnb.com/duns/get-a-duns.html>. If you don't already have one, register as Personal first and switch later.
- [ ] **Android Studio Koala / Panda 2 (2024.1+)** installed.
- [ ] **JDK 21** available — Android Studio bundles a JBR (verify under `Settings → Build, Execution, Deployment → Build Tools → Gradle → Gradle JDK`).
- [ ] **Windows long paths enabled** (Windows-only) — `HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem\LongPathsEnabled = 1`. Reboot required after first setting. Without this, `./gradlew :app:bundleRelease` fails on the `dependencies-accessors` rename. Verify with:
  ```powershell
  (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem' -Name LongPathsEnabled).LongPathsEnabled
  # Expect: 1
  ```
- [ ] **Project builds clean** — `cd android-native; .\gradlew :app:assembleDebug` succeeds.
- [ ] **Privacy policy URL chosen and live** — same one filed for iOS App Store. Required URL field on Play Console; the page must be publicly reachable at submission time.
- [ ] **App icon already in place** — should already match iOS (verify with commit `6331cbf`).
- [ ] **iOS App Store listing copy accessible** — you'll reuse the description, screenshots (where the UI matches), and Data Safety answers.
- [ ] **Sentry DSN known** (already wired in iOS — same DSN works for Android).
- [ ] **Supabase URL + anon key known** (already wired — same backend serves both platforms).

You do **NOT** need any of these for v1:

- A Mac (Android works on any OS).
- A second Google account (you can launch under your existing one).
- Firebase / `google-services.json` (push can be added in v1.1).
- Service-account JSON for automated Play uploads (manual upload via the web UI is fine for the first few releases).

---

## 2. Create the upload keystore (one-time)

A keystore is a single `.jks` file containing the cryptographic key Google uses to verify every update is from you.

> **CRITICAL**: If you lose this `.jks` file or its password, you can **never publish updates** to the same app on Play Store. Google's recovery flow exists but is slow and lossy. Back it up before touching anything else.

### 2a. Generate the keystore

The keystore must use a 25-year+ validity, RSA, 2048-bit minimum.

**Windows (PowerShell):**

- [ ] Decide where the keystore will live. Recommended: `C:\Users\pears\keys\eatpal-release.jks` (outside the repo, outside OneDrive sync paths).
- [ ] Create the folder if needed:
  ```powershell
  New-Item -ItemType Directory -Force "C:\Users\pears\keys"
  ```
- [ ] Run keytool with the Android Studio JBR (do NOT use any other JDK to avoid algorithm-compat issues):
  ```powershell
  & "C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe" `
    -genkeypair -v `
    -keystore "C:\Users\pears\keys\eatpal-release.jks" `
    -keyalg RSA -keysize 2048 -validity 10950 `
    -alias eatpal-upload `
    -dname "CN=EatPal, OU=EatPal, O=Pearson Media LLC, L=West Des Moines, ST=Iowa, C=US"
  ```
- [ ] When prompted, set a **strong keystore password** (mix of letters / numbers / symbols, 16+ chars). Write it down NOW.
- [ ] When prompted again for the **key password**, press **Enter** to reuse the keystore password (recommended — one password to track).
- [ ] Verify the keystore was created and contains the right alias:
  ```powershell
  & "C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe" -list -v -keystore "C:\Users\pears\keys\eatpal-release.jks" -storepass <YOUR_PASSWORD>
  ```
  Expected output includes `Alias name: eatpal-upload`, `Entry type: PrivateKeyEntry`, and a SHA-256 fingerprint.

**macOS / Linux:**

```bash
keytool -genkeypair -v \
  -keystore ~/keys/eatpal-release.jks \
  -keyalg RSA -keysize 2048 -validity 10950 \
  -alias eatpal-upload \
  -dname "CN=EatPal, O=Pearson Media LLC, L=West Des Moines, ST=Iowa, C=US"
```

`-validity 10950` = 30 years. Google requires ≥25 years on the upload key.

### 2b. Back it up — DO THIS NOW, NOT LATER

- [ ] **Save the keystore password to your password manager** under an entry named "EatPal Android Upload Key". Include: store password, key alias (`eatpal-upload`), key password (same as store password if you reused).
- [ ] **Copy the `.jks` to a second physical location** — external drive, second laptop, or USB key.
- [ ] **Encrypted cloud backup** — attach the `.jks` to a 1Password / Bitwarden secure note, OR upload to encrypted iCloud Drive / encrypted folder in Dropbox.
- [ ] **Confirm you can read the backup back** — pull the file from the backup location and run `keytool -list -v` on the copy. If the password works, you're set.

> Three copies in three different places is the minimum. Hardware failure happens. Treat this file like a financial recovery seed.

---

## 3. Wire local signing

Once the keystore exists, tell Gradle where it is.

### 3a. Create `keystore.properties`

- [ ] At the **repo root** (sibling of `package.json`, NOT inside `android-native/`), create the file `keystore.properties`:
  ```properties
  storeFile=C:/Users/pears/keys/eatpal-release.jks
  storePassword=YOUR_KEYSTORE_PASSWORD
  keyAlias=eatpal-upload
  keyPassword=YOUR_KEY_PASSWORD
  ```
- [ ] Use **forward slashes** in the path even on Windows.
- [ ] Verify `keystore.properties` is gitignored:
  ```bash
  git check-ignore keystore.properties
  # Expect: keystore.properties
  ```
  If it prints nothing, ADD `keystore.properties` to `.gitignore` immediately before continuing.

### 3b. Confirm Gradle picks it up

- [ ] From `android-native/`:
  ```powershell
  .\gradlew :app:signingReport
  ```
- [ ] Look for a `Variant: release` block. If `Store: ...` shows your `.jks` path, you're wired. If `Store: null` appears under release variant, Gradle did not find `keystore.properties` — re-check it lives at repo root, not inside `android-native/`.
- [ ] **Record the SHA-1 fingerprint** of the release variant — you'll need this for Firebase setup (§13).

---

## 4. Build a signed AAB locally

- [ ] From `android-native/`:
  ```powershell
  .\gradlew :app:bundleRelease
  ```
- [ ] On success, output lands at:
  `android-native\app\build\outputs\bundle\release\app-release.aab`
- [ ] Verify the bundle is signed with your upload key:
  ```powershell
  & "C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe" -printcert -jarfile "C:\Users\pears\Documents\EatPal\empty-stage-starter\android-native\app\build\outputs\bundle\release\app-release.aab"
  ```
  The SHA-256 fingerprint shown should match the one from `signingReport` in §3b.
- [ ] Confirm `versionCode` and `versionName` are what you expect (see §16 for the convention):
  ```powershell
  Select-String -Path android-native\app\build.gradle.kts -Pattern "versionCode|versionName"
  ```

### Alternative: Android Studio UI

If you prefer clicking:

1. **Build → Generate Signed App Bundle / APK…**
2. Pick **Android App Bundle**.
3. Browse to your `.jks`, type passwords, pick the alias (`eatpal-upload`).
4. Pick the **release** variant.
5. Click **Create**.

Both paths produce the same `app-release.aab`.

---

## 5. Play Console: create developer account + app

Sign in at <https://play.google.com/console>.

### 5a. Complete developer account setup

- [ ] Pay the **$25 one-time fee** if not already done.
- [ ] Choose **Organization** (Pearson Media LLC) — not Personal, since you have an LLC.
- [ ] Provide D-U-N-S number for Pearson Media LLC.
- [ ] Verify the account email (Google sends a confirmation).
- [ ] Complete **identity verification** (photo ID upload). Allow up to 48 hours.
- [ ] Complete **payments profile** under <https://payments.google.com/> — required for paid apps OR in-app purchases. EatPal has subscriptions, so yes.
- [ ] **Tax form** (W-9 for US LLC) — required before any earnings.
- [ ] **Bank account** for payouts (Pearson Media LLC business checking).

### 5b. Create the app

- [ ] In Play Console → **All apps → Create app**.
- [ ] Fill the form:
  | Field | Value |
  |---|---|
  | App name | `EatPal — Picky Eater Meal Planner` (≤30 chars, match iOS marketing name) |
  | Default language | English (United States) |
  | App or game | App |
  | Free or paid | **Free** (in-app purchases come via Play Billing, app itself is free) |
  | Developer Program Policies | ✓ Accept |
  | US export laws | ✓ Accept |
- [ ] Click **Create app**.
- [ ] Play assigns the package name automatically from your first AAB upload — it will be `com.eatpal.app` from your `applicationId`. **Do not touch the package name** — it's locked forever once set.

After creation you land on the app dashboard. The left sidebar is your map for the next sections.

### 5c. Link to Play Console payments (for IAP later)

- [ ] **Monetize → Products → Subscriptions** — leave this for after v1.0 ships. Setting up Play Billing subs requires the app to already be in at least closed testing.

---

## 6. Play Console: App content checklist

Left sidebar → **App content**. Play Console blocks publishing until every section here is green. Go through them in order.

### 6a. Privacy policy

- [ ] **App content → Privacy policy → Manage**.
- [ ] Paste your iOS privacy policy URL (e.g. `https://tryeatpal.com/privacy`).
- [ ] Confirm the page is reachable AND mentions every data type listed in §7.

### 6b. App access

- [ ] **App content → App access → Manage**.
- [ ] Choose **All or some functionality is restricted**.
- [ ] Click **Add new instructions**. Provide:
  - **Username**: a real Supabase test account email you've set up specifically for app reviewers (e.g. `review+google@tryeatpal.com`).
  - **Password**: a unique password used only for reviewers.
  - **Any other information**: e.g. "Sign in via email + password. The app's main features (Pantry, Planner, Grocery) are accessible immediately after sign-in. To test subscription flows, the test account has been upgraded to Premium."
- [ ] Save.

> **Set up this test account in Supabase before submitting**. Reviewers will use it.

### 6c. Ads

- [ ] **App content → Ads → Manage**.
- [ ] Answer: **No, my app does not contain ads.** (EatPal does not show ads.)

### 6d. Content rating

- See [§8](#8-content-rating-questionnaire) for the full questionnaire walkthrough. Start it here but full details below.

### 6e. Target audience and content

- [ ] **App content → Target audience → Manage**.
- [ ] Select **all age groups your app targets**: at minimum `18+` (parents). You probably also want `Ages 13-15`, `Ages 16-17` (teens may use planning features themselves).
- [ ] **Do NOT check** ages 5 and under, 6-8, or 9-12. EatPal helps parents plan kids' meals; the app is for parents, not directly for kids.
- [ ] Question: "Is your app designed for children?" → **No**. (Critical — answering Yes triggers the Designed for Families / Teacher Approved program, which has heavy Google Play Families Policy requirements and bans certain SDKs.)
- [ ] Question about appealing to children unintentionally → **No, my app isn't appealing to children**.
- [ ] Save.

### 6f. News app declaration

- [ ] **App content → News apps → Manage**.
- [ ] Answer: **No, my app isn't a news app**.

### 6g. COVID-19 contact tracing

- [ ] **App content → COVID-19 contact tracing and status apps → Manage**.
- [ ] Answer: **My app is neither a publicly available COVID-19 contact tracing and status app, nor a developer-related testing version**.

### 6h. Data safety

- See [§7](#7-privacy-policy--data-safety-form). Long form.

### 6i. Government apps

- [ ] **App content → Government apps → Manage**.
- [ ] Answer: **No**.

### 6j. Financial features

- [ ] **App content → Financial features → Manage**.
- [ ] Answer: **My app doesn't have any financial features**. (Subscriptions are NOT considered financial features in Play's sense — those are personal loans, crypto, tax filing, etc.)

### 6k. Health

- [ ] **App content → Health apps → Manage** (only appears if you declare health features).
- [ ] If you ship Health Connect integration in v1: answer **Yes**, and declare:
  - Categories: **Nutrition**, **Health measurements**.
  - Whether you collect health data for medical purposes: **No** (lifestyle, not medical).
- [ ] If Health Connect is shipping in a later version, you may skip this until you turn it on.

### 6l. Advertising ID

- [ ] **App content → Advertising ID → Manage**.
- [ ] Question: "Does your app use advertising ID?" → **No**. (You don't use AdMob, Firebase Analytics' advertising IDs, or marketing attribution SDKs.)

### 6m. Permission declarations & restricted permissions

Play Console scans your AAB on upload and flags any **restricted permissions** that require justification, a video demo, or are outright forbidden for your app's category. Address these BEFORE you hit "Send for review" — they're the most common Day-1 rejection reason.

#### 6m-1. Permissions you must REMOVE from the manifest (forbidden for EatPal)

EatPal does NOT qualify as an alarm-clock or calendar app, so the following permission is **forbidden** by Play policy and will cause a hard rejection:

- [ ] **`USE_EXACT_ALARM`** — Remove from `app/src/main/AndroidManifest.xml`. Restricted to dedicated alarm-clock or calendar apps only. EatPal's pantry-expiry reminders use `SCHEDULE_EXACT_ALARM` (different permission, allowed for our use case) and `canScheduleExactAlarms() / setExactAndAllowWhileIdle()` — `USE_EXACT_ALARM` is never actually invoked in code and should not be declared.

  Verify with:
  ```bash
  grep -n "USE_EXACT_ALARM" android-native/app/src/main/AndroidManifest.xml
  # Expect: no results
  ```

#### 6m-2. Permissions requiring a video demonstration

These permissions are allowed, but Play requires a publicly-accessible video URL showing the permission being used in context. Without the URL, the AAB is unpublishable.

- [ ] **`FOREGROUND_SERVICE_DATA_SYNC`** — Used by `GroceryTripService` (the Android equivalent of the iOS Live Activity for grocery shopping). Required video demonstrating the ongoing shopping-trip notification.

  **How to record the video** (~10 min total):

  1. Start an emulator (Android Studio → AVD Manager → Pixel 7 / API 34) or use a real device.
  2. Install a release-mode build: `.\gradlew :app:installRelease` (or run from the IDE).
  3. Start a screen recording — emulator: camera icon → **Record screen**; physical device: built-in screen recorder; desktop: [OBS Studio](https://obsproject.com/).
  4. Follow this 60-second script:

     | Time | Action | On-screen caption |
     |---|---|---|
     | 0–5s | Show EatPal home screen | "EatPal — grocery shopping mode demo" |
     | 5–15s | Navigate to Grocery list with several unchecked items | "Starting a shopping trip" |
     | 15–25s | Tap "Start trip" → pull down the notification shade → show *"Shopping trip — 0 of N checked"* | "Foreground service starts. Persistent notification shows progress." |
     | 25–45s | Check off 2–3 items in-app → pull down shade again → show updated *"Shopping trip — 3 of N — Last: <item>"* | "Notification updates as items are checked off, even when app is backgrounded." |
     | 45–55s | Tap **Finish trip** action on the notification | "Trip complete — foreground service stops." |
     | 55–60s | Show notification gone | "Used only while user is actively shopping. Equivalent to iOS Live Activity." |

  5. **Upload to YouTube as Unlisted** (NOT Public, NOT Private — Play reviewers need the link to work but it shouldn't surface in search). Title: `EatPal — Grocery Shopping FGS Demo`.
  6. Copy the share URL.

  **Submit in Play Console**:
  - Path: **Policy → App content → Foreground services** (or the permission declaration banner that appeared on upload).
  - Paste the YouTube URL.
  - Paste this justification text:
    > EatPal's `GroceryTripService` displays an ongoing progress notification while the user is shopping at a grocery store. The notification shows the count of items checked off vs. total, and the last item added. This mirrors the iOS Live Activity equivalent. The service starts only when the user explicitly begins a shopping trip from the in-app Grocery list, and stops when the user taps "Finish trip" or completes all items. The `dataSync` foreground service type is used because the service is synchronizing the user's shopping progress against the in-app grocery list state.

#### 6m-3. Permissions requiring text-only justification

These need a one-line explanation in the permission declaration form — no video.

- [ ] **`SCHEDULE_EXACT_ALARM`** → *"Used to remind users about pantry items expiring at user-chosen times. Exact alarms are required so reminders fire at the time the user picked (e.g. 8:00 AM Monday) rather than within Android's lax windowing. The app falls back gracefully to inexact alarms if the user denies the permission via `canScheduleExactAlarms()`."*
- [ ] **`CAMERA`** → *"Barcode scanning for pantry intake. Images are processed locally on-device via ML Kit and never uploaded."* (Only if barcode scanner ships in v1.)
- [ ] **`RECORD_AUDIO`** → *"Voice input for recipe and grocery-item dictation. Audio is processed by Android's on-device SpeechRecognizer and never leaves the device."* (Remove from manifest if voice input isn't shipping in v1.)
- [ ] **`POST_NOTIFICATIONS`** → Standard runtime permission; no Play declaration required.
- [ ] **`FOREGROUND_SERVICE`** → Standard, no extra justification (the more-specific FGS type subtype is what gets reviewed).
- [ ] **`com.android.vending.BILLING`** → Standard for Play Billing subscriptions; no extra justification.

#### 6m-4. Submission

- [ ] Confirm the manifest contains exactly these permissions (no more, no less):
  ```
  INTERNET
  ACCESS_NETWORK_STATE
  POST_NOTIFICATIONS
  SCHEDULE_EXACT_ALARM
  CAMERA
  RECORD_AUDIO          (only if voice input ships in v1)
  com.android.vending.BILLING
  FOREGROUND_SERVICE
  FOREGROUND_SERVICE_DATA_SYNC
  ```
- [ ] Rebuild the AAB after any manifest change. **Bump `versionCode`** (see §16a) — Play does NOT accept the same `versionCode` even when the previous upload was a rejected draft.
- [ ] Re-upload the AAB to Internal Testing.
- [ ] Submit all the permission-declaration forms.
- [ ] Verify the **Policy → App content** dashboard now shows no red flags.

### 6n. App category

- [ ] **Store presence → Main store listing → Category** (in §9).
- [ ] Choose **Food & Drink** primary, **Parenting** secondary. Or swap if Parenting feels more aligned.

After all of 6a–6n are green, you've cleared the App content gate.

---

## 7. Privacy policy + Data safety form

### 7a. Privacy policy content checklist

The policy at your URL must mention every data type the app collects. EatPal collects:

- [ ] Account email + display name (Supabase Auth)
- [ ] Optional kid profiles: names, ages, dietary restrictions, allergens
- [ ] Food, recipe, meal plan, grocery list user content
- [ ] Subscription status (from Play Billing receipts)
- [ ] Health data — only if user enables Health Connect
- [ ] Photos — only if user uses receipt scan / pantry photo / fridge photo features
- [ ] Crash diagnostics (Sentry — scrubbed of PII)
- [ ] Performance / usage metrics (Sentry traces)

Mirror the iOS App Store Privacy disclosure exactly. If iOS doesn't disclose something, don't disclose it on Play either (and vice versa — Play and Apple Privacy declarations must be consistent or you risk takedown on both).

### 7b. Data safety form

Found at **App content → Data safety → Manage**. ~30 minutes to fill. Reviewer expects answers to match the privacy policy exactly.

#### Section 1: Data collection and security

- [ ] **Does your app collect or share any of the required user data types?** → **Yes**.
- [ ] **Is all of the user data collected by your app encrypted in transit?** → **Yes** (Supabase is HTTPS-only).
- [ ] **Do you provide a way for users to request that their data is deleted?** → **Yes**. Link to your in-app "Delete account" flow or `tryeatpal.com/account/delete`.
- [ ] **Have you committed to following the Play Families Policy?** → **No** (this is only Yes for kid-targeted apps, see §6e).

#### Section 2: Data types

For each data type, mark whether you collect it, share it (= send to a third party), purposes, optional/required.

| Data type | Collected | Shared | Purposes | Optional? |
|---|---|---|---|---|
| **Email address** | Yes | No | Account management | No (required for auth) |
| **Name** | Yes | No | Account management | Yes |
| **User IDs** | Yes | No | Account management, App functionality | No |
| **App activity** (in-app actions: meal plans, grocery items) | Yes | No | App functionality | No (core feature) |
| **Health & fitness** (nutrition data, Health Connect) | Yes | No | App functionality | Yes (Health Connect opt-in) |
| **Photos** (receipt / fridge photos) | Yes | No | App functionality | Yes |
| **Crash logs** | Yes | No (Sentry is a processor under your control, NOT shared) | App functionality, Analytics | No |
| **Diagnostics** (perf metrics) | Yes | No | App functionality, Analytics | No |
| **Approximate location** | No (unless you've added location-based grocery store lookup) | — | — | — |
| **Precise location** | No | — | — | — |
| **Contacts** | No | — | — | — |
| **Calendar** | No | — | — | — |
| **Financial info** | No | — | — | — |
| **Payment info** | No (Google Play handles all billing, you never see the card) | — | — | — |
| **Personal info — race, ethnicity, etc.** | No | — | — | — |

> **About Sentry**: Play distinguishes "collect" (you have it) from "share" (you give it to a third party for their own use). Sentry is a data processor acting on your behalf — like AWS or Supabase. You **collect** crash logs but you do **NOT share** them. Same logic applies to Supabase, Cloudflare.

#### Section 3: Security practices

- [ ] **Data is encrypted in transit** → Yes.
- [ ] **You can request that data is deleted** → Yes.
- [ ] **Have you followed Play Families Policy?** → No (not a kid-targeted app).
- [ ] **Independent security review** → No (skip unless you've done a SOC 2 / pen test).

After saving, Play generates a Data Safety section that auto-publishes on your listing. Verify it matches the iOS one.

---

## 8. Content rating questionnaire

**App content → Content ratings → Start questionnaire**.

### Step 1: Category

- [ ] Email: use the same monitored inbox as your Play Console developer account.
- [ ] Category: **All other app types** (NOT "Reference, News, or Educational" — those are reserved for content publishers).

### Step 2: Answer the questionnaire

For EatPal, every answer is **No** except where noted. The questionnaire covers:

- [ ] Violence (including cartoon violence) → No
- [ ] Sexuality / nudity → No
- [ ] Language / profanity → No
- [ ] Controlled substances → No
- [ ] Gambling / simulated gambling → No
- [ ] User-generated content → **Yes, but only sharable with people the user has explicitly invited** (the household/family-sharing flow). Justification: "Users can share meal plans and grocery lists with household members they explicitly invite by email."
- [ ] Location sharing → No
- [ ] Personal info sharing with other users → No (household sharing is private to the household)
- [ ] Digital purchases → **Yes** (the subscription)
- [ ] Unrestricted internet → No (the app makes only HTTPS calls to your own backend and Supabase)

### Step 3: Submit and get ratings

After submission, IARC generates ratings for all regions. Expected outcomes for EatPal:

| Region | Rating |
|---|---|
| IARC Generic | Everyone / 3+ |
| ESRB (US) | Everyone |
| PEGI (EU) | 3 |
| USK (Germany) | 0 |
| ACB (Australia) | G |

- [ ] Confirm ratings are reasonable. If something unexpected (e.g. Teen / 12+), go back and re-check the user-generated-content answer — that's the most common source of an inflated rating.
- [ ] Click **Apply ratings** to publish.

---

## 9. Store listing (Main store listing)

Left sidebar → **Grow users → Store presence → Main store listing**.

### 9a. App details

- [ ] **App name**: `EatPal — Picky Eater Meal Planner` (≤30 chars).
- [ ] **Short description** (≤80 chars): Example: `Plan kid-friendly meals, build smart grocery lists, win dinner. Free trial.`
- [ ] **Full description** (≤4000 chars): Reuse iOS App Store description verbatim. Lead with the value prop, list the headline features (Pantry, Planner, Grocery, Tonight Mode, Voting), end with a CTA.

### 9b. Graphic assets

- [ ] **App icon** — 512×512 PNG, 32-bit, ≤1 MB. Use the same icon you ported to Android launcher (commit `6331cbf`). Export at 512×512 from your master.
- [ ] **Feature graphic** — 1024×500 PNG/JPG, ≤15 MB. **Required, no skip.** Make a simple branded banner with the EatPal logo and tagline. Don't put fine text — Play downscales.
- [ ] **Phone screenshots** — 2 minimum, 8 maximum. Aspect ratio between 9:16 and 1.78:1. Min 1080px on the shorter side. Recommended: 6 screenshots showing Pantry, Planner, Grocery, Tonight Mode, Voting, Premium upsell. **Reuse iOS screenshots if the UI matches**; Play accepts iOS-formatted PNGs.
- [ ] **7-inch tablet screenshots** — Optional but recommended. Increases tablet visibility.
- [ ] **10-inch tablet screenshots** — Optional. Skip for v1 if you don't have a tablet build.

### 9c. Categorization

- [ ] **App category**: Food & Drink (or Parenting — pick the primary fit).
- [ ] **Tags**: Add up to 5 tags from the Play list (e.g. Family meal planning, Recipes, Grocery list, Nutrition).
- [ ] **Contact details**:
  - Email: a monitored inbox (e.g. `support@tryeatpal.com`).
  - Phone: optional but builds trust.
  - Website: `tryeatpal.com`.

### 9d. External marketing

- [ ] **Privacy policy URL** (already set in §6a — Play shows it here too).

After saving, Play marks **Main store listing** complete.

---

## 10. Upload the first AAB to Internal Testing

Always upload to **Internal Testing** for the very first build. It's instant (no Play review), available immediately, and lets you smoke-test on real devices.

### 10a. Create the internal testing track

- [ ] **Testing → Internal testing → Create new release**.
- [ ] If prompted about **Play App Signing**: choose **Use Google Play App Signing** (default). Google stores the actual signing key in HSM; you upload with your "upload key" and Google re-signs with the real key. This is what lets you recover if your `.jks` is ever lost.
  - You'll be asked to either:
    - **Export and upload an existing key** (the `.jks` you made in §2) — recommended
    - **Let Google generate a key** — fine too but you lose ability to ship the same app on other stores with the same signature.
  - For EatPal: choose **Export and upload** — point to your `.jks` and enter passwords.

### 10b. Upload the bundle

- [ ] Click **Upload** and select:
  `C:\Users\pears\Documents\EatPal\empty-stage-starter\android-native\app\build\outputs\bundle\release\app-release.aab`
- [ ] Wait for processing (~2 min).
- [ ] If Play flags anything (e.g. "Restricted permissions" for `SCHEDULE_EXACT_ALARM`), provide the justification from §6m.

### 10c. Release name and notes

- [ ] **Release name**: defaults to `1.0.0 (1)` — leave as-is or add a marketing tag like `1.0.0 — Initial Android release`.
- [ ] **Release notes** (per language):
  ```
  Welcome to EatPal! Plan kid-friendly meals, build smart grocery lists, and win dinner.

  This is our initial Android release. We'd love your feedback — email support@tryeatpal.com.
  ```

### 10d. Add testers

- [ ] **Testers** tab on the Internal testing page → **Create email list**.
- [ ] Name: `EatPal Internal Testers`.
- [ ] Emails: your own Gmail at minimum, plus anyone smoke-testing.
- [ ] **Feedback URL**: leave blank or use `support@tryeatpal.com`.
- [ ] Save the list and assign it to the Internal Testing track.

### 10e. Roll it out

- [ ] Back on the release page → **Review release** → **Start rollout to internal testing**.
- [ ] Within ~5 min, the opt-in link appears under the **Testers** tab. URL looks like `https://play.google.com/apps/internaltest/<numeric-id>`.
- [ ] Open the opt-in URL on your Android phone, accept, then open the link to install.
- [ ] Smoke test:
  - [ ] Sign in with the review test account (proves App access creds work).
  - [ ] Add a pantry item, build a plan, generate a grocery list.
  - [ ] Force-close + reopen — confirm state persists.
  - [ ] Check Sentry dashboard — your test session should be visible with no crashes.

---

## 11. Closed testing + new-account 20/14 requirement

> **NEW DEVELOPER ACCOUNT RULE** (in effect since Nov 2023): Personal accounts created after Nov 13, 2023 must run a **closed test with ≥20 testers for ≥14 consecutive days** before being eligible for production release. Organization accounts (you, as Pearson Media LLC) are typically **exempt**, but Google has been tightening this for newer org accounts too. Plan for it.

### 11a. Check if the rule applies to you

- [ ] Open Play Console → **Publishing overview**. If a banner says *"Your app must complete closed testing with at least 20 testers..."*, the rule applies.
- [ ] If no banner: you can promote from Internal → Closed (optional) → Production immediately once App content is green.

### 11b. If the rule applies — set up Closed testing

- [ ] **Testing → Closed testing → Create track**. Name it `Beta` or `Alpha`.
- [ ] Upload the same AAB (or promote from Internal).
- [ ] **Testers**: create a list of **at least 20 unique Gmail addresses**.
  - Recruit from: existing iOS TestFlight beta testers, friends/family, /r/Beta_Testers on Reddit, BetaTesting.com, internal team.
  - Each tester must **opt in via the link** AND **install the app** for the counter to tick.
- [ ] **Countries**: open to your launch markets.
- [ ] Track all 20 testers' install confirmations. Play counts only those who installed.
- [ ] **Run for 14 consecutive days minimum**. The clock starts when the 20th tester installs.

### 11c. While testing

- [ ] Push at least one update during the 14 days (Play views this as healthy iteration).
- [ ] Respond to any in-Play tester feedback.
- [ ] Monitor Sentry for crashes — fix before production.

After 14 days with 20+ active testers, the **Apply for production access** button unlocks.

---

## 12. Promote to Production

- [ ] **Production → Create new release**.
- [ ] **Promote from**: select your Closed testing release (or Internal if 11a confirmed no rule).
- [ ] **Countries / regions**: Start with US-only for v1.0 to limit blast radius; add more in v1.1 once stable.
- [ ] **Staged rollout**: pick **1% to start**. Increment as crash-free sessions stay above 99.5%.
  - Day 1: 1%
  - Day 3: 5% (if no crash spike)
  - Day 7: 25%
  - Day 14: 100%
- [ ] Submit for review. Google typically reviews production releases in 1–7 days for new apps, faster for updates.

### 12a. After approval

- [ ] Verify the app appears in Play Store search for `EatPal`.
- [ ] Confirm the listing matches your iOS App Store listing (assets, description, contact).
- [ ] Monitor crash-free sessions in Sentry AND in Play Console → **Quality → Android vitals**.
- [ ] Watch the **User feedback** section for early reviews.

---

## 13. Firebase project setup (for FCM push)

EatPal's `app/build.gradle.kts:234-235` already includes Firebase BOM and Messaging deps. The `EatPalMessagingService` is wired in the manifest but dormant until you add the project config.

### 13a. Create the Firebase project

- [ ] Sign in at <https://console.firebase.google.com/>.
- [ ] **Add project** → name: `EatPal` (or `eatpal-prod`).
- [ ] **Google Analytics**: optional — recommended **disabled** for v1 (you already have Sentry; less data collection is better for the Data Safety form).
- [ ] Click through and wait for the project to finish provisioning (~1 min).

### 13b. Add the Android app (production)

- [ ] In the Firebase console → **Project settings** (gear icon) → **General** → **Your apps** → **Add app** → **Android**.
- [ ] **Android package name**: `com.eatpal.app`.
- [ ] **App nickname**: `EatPal Production`.
- [ ] **Debug signing certificate SHA-1**: paste the release SHA-1 you noted in §3b (this is the upload key fingerprint — Firebase Auth's Google Sign-In needs it).
- [ ] Click **Register app**.
- [ ] **Download `google-services.json`**.
- [ ] Move the file to: `C:\Users\pears\Documents\EatPal\empty-stage-starter\android-native\app\google-services.json`.
- [ ] Verify it's gitignored:
  ```bash
  git check-ignore android-native/app/google-services.json
  ```
  If not, add `android-native/app/google-services.json` to `.gitignore` now.

### 13c. Add the Android app (debug variant)

- [ ] Same flow as 13b, but:
  - Package name: `com.eatpal.app.debug` (matches the `applicationIdSuffix = ".debug"`).
  - App nickname: `EatPal Debug`.
  - SHA-1: get the **debug keystore** fingerprint:
    ```powershell
    & "C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe" -list -v -keystore "$env:USERPROFILE\.android\debug.keystore" -alias androiddebugkey -storepass android -keypass android
    ```
- [ ] Download the SECOND `google-services.json`.
- [ ] Decide: do you want a separate Firebase project per build variant? Easiest for v1 is to **register both apps in the same Firebase project**, then merge the two `google-services.json` files (Firebase's tooling auto-generates a merged file when you download from project settings with multiple Android apps registered).

### 13d. Apply the Gradle plugin

- [ ] Edit `android-native/build.gradle.kts` (the **project-level** one), add to the `plugins { }` block:
  ```kotlin
  plugins {
      // ... existing plugins ...
      id("com.google.gms.google-services") version "4.4.2" apply false
  }
  ```
- [ ] Edit `android-native/app/build.gradle.kts` (the **module-level** one), add to the `plugins { }` block:
  ```kotlin
  plugins {
      // ... existing plugins ...
      id("com.google.gms.google-services")
  }
  ```
- [ ] Sync Gradle. The first sync after adding the plugin will read `google-services.json` and fail with a clear error if the package names don't match — that's the validation working.

### 13e. Smoke test push

- [ ] Build a debug build, install on a device.
- [ ] In Logcat, filter for `EatPalMessagingService` — you should see `onNewToken: <fcm-token>` shortly after launch.
- [ ] Copy that token, then in Firebase console → **Cloud Messaging** → **Send test message** → paste token → send.
- [ ] Verify the notification arrives.

### 13f. CI integration

When you add CI (§15), the `google-services.json` needs to be available in the runner. Don't commit it:

- [ ] Base64-encode and store as a GitHub secret named `ANDROID_GOOGLE_SERVICES_JSON_BASE64`:
  ```powershell
  [Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\Users\pears\Documents\EatPal\empty-stage-starter\android-native\app\google-services.json")) | Set-Clipboard
  ```
- [ ] In your `.github/workflows/android-release.yml`, decode before the build step (workflow update covered in §15).

---

## 14. Google Cloud service account (Play Developer API)

This is the API setup you remember. **Skip until you've manually shipped at least 2–3 releases** — automation is convenient but it's a long way to fall if the pipeline pushes a broken bundle to production.

### 14a. Enable the Google Play Android Developer API

- [ ] Visit <https://console.cloud.google.com/>.
- [ ] **Top bar → project picker → New project** (if you don't have one yet). Name: `EatPal` or similar. Note the **Project ID** — you'll need it.
- [ ] **APIs & Services → Library** → search for **Google Play Android Developer API** → **Enable**.

### 14b. Create the service account

- [ ] **APIs & Services → Credentials → Create credentials → Service account**.
- [ ] **Service account name**: `play-publisher`.
- [ ] **Service account ID**: auto-fills to `play-publisher`.
- [ ] **Description**: `Used by GitHub Actions to upload AABs to Play Console`.
- [ ] Click **Create and continue**.
- [ ] **Grant this service account access to project** → leave blank, click **Continue**.
- [ ] **Grant users access to this service account** → leave blank, click **Done**.

### 14c. Create a JSON key

- [ ] On the Service Accounts list → click the `play-publisher@...` account.
- [ ] **Keys** tab → **Add key → Create new key → JSON**.
- [ ] A `.json` file downloads. **Save it to your password manager NOW** — Google does not let you re-download. If lost, you have to delete and re-create.

### 14d. Link the service account to Play Console

- [ ] Switch to Play Console → **Setup → API access**.
- [ ] If prompted "Link a Google Cloud project": pick the project from §14a.
- [ ] Under **Service accounts**, the `play-publisher@<project-id>.iam.gserviceaccount.com` account should appear. Click **Grant access**.
- [ ] **App permissions**: add EatPal to the list (or grant account-wide).
- [ ] **Account permissions** for now:
  - ✅ **View app information and download bulk reports** (allows reading)
  - ✅ **Manage testing tracks and release apps to testing tracks** (allows pushing to Internal / Closed)
  - ❌ **Release to production** — leave UNCHECKED for v1. Manually promote to production from Play Console UI until you fully trust the pipeline.
- [ ] **Save changes**.

### 14e. Base64 the JSON for GitHub Actions

- [ ] PowerShell:
  ```powershell
  [Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\to\play-publisher-key.json")) | Set-Clipboard
  ```
- [ ] Paste as GitHub secret `PLAY_PUBLISHER_SERVICE_ACCOUNT_JSON_BASE64` (see §15).

---

## 15. GitHub Actions automation

Once the manual flow works end-to-end and a build is live in at least Internal Testing, switch ongoing releases to CI.

### 15a. Required GitHub Actions secrets

Go to **Settings → Secrets and variables → Actions → New repository secret** and add:

| Secret | Value | How to obtain |
|---|---|---|
| `ANDROID_KEYSTORE_BASE64` | base64 of `eatpal-release.jks` | `[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\Users\pears\keys\eatpal-release.jks")) \| Set-Clipboard` |
| `ANDROID_KEYSTORE_PASSWORD` | the `.jks` password | Same as `storePassword` in `keystore.properties` |
| `ANDROID_KEY_ALIAS` | upload key alias | `eatpal-upload` |
| `ANDROID_KEY_PASSWORD` | the per-key password | Same as `keyPassword` in `keystore.properties` |
| `SUPABASE_URL` | `https://<project>.supabase.co` | Already set if iOS CI works |
| `SUPABASE_ANON_KEY` | Supabase anon JWT | Already set if iOS CI works |
| `SENTRY_DSN` | Sentry project DSN | Optional. From Sentry project settings |
| `GOOGLE_WEB_CLIENT_ID` | Google OAuth client ID | Optional. Only needed for Google Sign-In via Supabase |
| `ANDROID_GOOGLE_SERVICES_JSON_BASE64` | base64 of `google-services.json` | See §13f |
| `PLAY_PUBLISHER_SERVICE_ACCOUNT_JSON_BASE64` | base64 of the SA JSON | See §14e |

### 15b. Trigger a build

The workflow `.github/workflows/android-release.yml` fires on:

- **Manual dispatch**: Actions tab → `android-release` → **Run workflow** → pick a track. Use for ad-hoc release candidates.
- **Tag push**: `git tag android/v1.0.1 && git push origin android/v1.0.1`. Use for official releases (mirrors the iOS `ios/v*` convention).

The signed AAB and R8 mapping file land as workflow artifacts. Download `eatpal-release-<name>-<code>.aab` and upload manually to Play Console for the first few CI-built releases until you trust the pipeline.

### 15c. Optional: automated Play Console upload via CI

Once `PLAY_PUBLISHER_SERVICE_ACCOUNT_JSON_BASE64` is set, the workflow's `publish` job will detect it and push the AAB to Play. The workflow uses [`r0adkll/upload-google-play`](https://github.com/r0adkll/upload-google-play).

- Release notes path: `android-native/app/src/main/play/release-notes/<lang>/<track>.txt`
- Track names: `internal`, `alpha` (closed), `beta` (open), `production`.

Start by targeting `internal` only. Once a few rounds of CI → Internal → manual promotion to Production work cleanly, expand the workflow.

---

## 16. Versioning convention

Bump both `versionCode` and `versionName` in `android-native/app/build.gradle.kts` for every release Play Console accepts:

- `versionCode` — integer, **must increase monotonically**. Play rejects a code ≤ the latest live build.
- `versionName` — semver string the user sees. Match the iOS marketing version when shipping cross-platform parity.

> **Critical rule**: ANY upload to Play Console **consumes** that `versionCode`, even if:
> - You created a release draft and didn't submit it.
> - The release was rejected at App content validation.
> - The release was discarded from the dashboard.
> - The AAB only made it to processing and never got attached to a release.
>
> If a previous AAB attempt at `versionCode = N` failed for ANY reason and you need to re-upload after fixing it, you MUST bump to `N+1`. Play remembers every uploaded versionCode forever and treats them as burned. You cannot "un-upload" a versionCode.

Recommended scheme:

| iOS | Android |
|---|---|
| `MARKETING_VERSION = 1.0.0`, `CURRENT_PROJECT_VERSION = 1` | `versionName = "1.0.0"`, `versionCode = 1` |
| `1.0.1` build 5 | `versionName = "1.0.1"`, `versionCode = 6` (always +1, even for hotfixes) |

For a clean cross-platform tag scheme the iOS workflow already uses `ios/v1.0.0` — mirror with `android/v1.0.0` so a tag fires the matching CI.

### 16a. Bump procedure for each release

- [ ] Open `android-native/app/build.gradle.kts`.
- [ ] Increment `versionCode` by 1.
- [ ] Update `versionName` to match what you want users to see.
- [ ] Commit on the release branch: `chore(android): bump to <versionName> (<versionCode>)`.
- [ ] Tag: `git tag android/v<versionName> && git push origin android/v<versionName>`.

---

## 17. Troubleshooting

### `./gradlew :app:bundleRelease` says "release signing config is missing"

`haveReleaseSigning` returned false. Either `keystore.properties` doesn't exist at the repo root, or it's missing one of the four required fields. Re-check the path with `ls ../keystore.properties` from `android-native/`.

### Gradle sync fails with `AccessDeniedException` on `dependencies-accessors`

Path length exceeded Windows' 260-char `MAX_PATH`. Verify:
```powershell
(Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem' -Name LongPathsEnabled).LongPathsEnabled
# Expect: 1
```
If it's 0, set it (admin PowerShell), reboot, then:
```powershell
Get-Process java,javaw -ErrorAction SilentlyContinue | Stop-Process -Force
cmd /c "rmdir /s /q C:\Users\pears\Documents\EatPal\empty-stage-starter\android-native\.gradle"
```
Re-sync. Also confirm `gradle-wrapper.properties` is on Gradle 8.11+ — older versions have a race condition in `AssignImmutableWorkspaceStep`.

### R8 fails with `Missing class java.lang.management.ManagementFactory`

Ktor's `IntellijIdeaDebugDetector` references JVM-only classes. Already handled in `app/proguard-rules.pro` with `-dontwarn java.lang.management.**` rules. If you see this error, that section was removed — re-add it.

### Play Console flags `USE_EXACT_ALARM` on upload

Hard reject. EatPal is not an alarm-clock or calendar app, so this permission is forbidden by Play policy. Open `app/src/main/AndroidManifest.xml` and remove `<uses-permission android:name="android.permission.USE_EXACT_ALARM"/>`. Keep `SCHEDULE_EXACT_ALARM` — different permission, different rules, allowed for pantry-expiry reminders. Then bump `versionCode` (see §16) and rebuild. The code uses `canScheduleExactAlarms() / setExactAndAllowWhileIdle()` which only needs `SCHEDULE_EXACT_ALARM`, so removing `USE_EXACT_ALARM` requires no Kotlin changes.

### Play Console flags `FOREGROUND_SERVICE_DATA_SYNC` and requires a video

Expected. `GroceryTripService` uses this for the Android equivalent of the iOS Live Activity. See §6m-2 for the full 60-second video script and submission steps. The justification text and YouTube-Unlisted upload path are there too. Do not remove the permission unless you also remove `GroceryTripService.kt` and the `<service>` declaration from the manifest — the FGS is real and load-bearing.

### Play Console says "version code N has already been used"

You uploaded an AAB at this `versionCode` previously, even if you never submitted it. Bump `versionCode` in `app/build.gradle.kts` (see §16) and rebuild. Play burns every uploaded versionCode permanently — drafts, rejections, and discards all count.

### Play Console rejects the AAB with "package already exists"

Someone else (or an old EAS build) already claimed `com.eatpal.app` on this developer account. Check **All apps** for ghost entries. If you want to keep that entry, you must use the existing keystore — not a new one — to upload.

### Play Console says "upload key fingerprint mismatch"

You're trying to update an app with a different keystore than the original. Either use the original keystore, or follow Play App Signing key reset (Settings → App integrity → App Signing → Request upload key reset).

### `./gradlew :app:bundleRelease` succeeds but the AAB is huge (>50 MB)

R8 didn't run. Confirm `isMinifyEnabled = true` is still set under `buildTypes.release`. If the build log shows `Minifying release` but the bundle is still huge, check `proguard-rules.pro` for over-broad `-keep` rules.

### CI fails on "ANDROID_KEYSTORE_BASE64 is not set"

The secret name is exactly `ANDROID_KEYSTORE_BASE64` (case-sensitive). If you pasted into the wrong organization or repo, the secret won't be visible to this workflow.

### CI builds, but Play upload fails with "service account does not have permission"

The Google Cloud service account isn't linked to Play Console yet, or it's missing the **Release manager** role for the target track. Go to **Setup → API access**, find the SA email, click **Grant access**, verify the track permission, save. Re-run the workflow.

### App installs from internal testing but crashes on launch

Likely Sentry will have the stack trace. If not, hook USB and run `adb logcat | grep -i eatpal`. Most common: the release `BuildConfig` got placeholder Supabase keys because the env wasn't passed. Verify the `SUPABASE_URL` / `SUPABASE_ANON_KEY` secrets are set and not empty.

### Firebase push notification doesn't arrive

1. Confirm `google-services.json` is at `android-native/app/google-services.json`.
2. Confirm the `com.google.gms.google-services` plugin is applied in `app/build.gradle.kts`.
3. Confirm Logcat shows `onNewToken` from `EatPalMessagingService` after a fresh install.
4. Confirm the SHA-1 in Firebase Console matches the keystore that signed the installed build.
5. If still failing, send a test message via the Firebase Console (Cloud Messaging → Send test message) — bypasses your backend logic entirely.

### `keytool` command not found in PowerShell

`keytool` isn't on PATH on Windows. Use the Android Studio JBR version explicitly:
```powershell
& "C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe" <args>
```

### Closed testing won't promote — "20 testers / 14 days not met"

Check **Testing → Closed testing → Testers tab**. Play counts only testers who have **opted in via the link AND installed the app**. Add more testers; remind existing testers to actually install.

---

## 18. Quick-reference: minimum viable first release

For the impatient. Assumes §1 is complete.

```powershell
# 1. Generate keystore (one-time)
& "C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe" `
  -genkeypair -v `
  -keystore "C:\Users\pears\keys\eatpal-release.jks" `
  -keyalg RSA -keysize 2048 -validity 10950 `
  -alias eatpal-upload `
  -dname "CN=EatPal, OU=EatPal, O=Pearson Media LLC, L=West Des Moines, ST=Iowa, C=US"

# 2. Create keystore.properties at the repo root
@"
storeFile=C:/Users/pears/keys/eatpal-release.jks
storePassword=...
keyAlias=eatpal-upload
keyPassword=...
"@ | Out-File -Encoding utf8 keystore.properties

# 3. Build the AAB
cd android-native; .\gradlew :app:bundleRelease

# 4. Upload to Play Console Internal Testing via the web UI:
#    https://play.google.com/console
#    → All apps → EatPal → Testing → Internal testing → Create new release → Upload
#    File: app\build\outputs\bundle\release\app-release.aab
```

After it works once manually, set up the GitHub Actions secrets in §15 and trigger `android-release` from the Actions tab. From then on, every `git tag android/v1.0.x && git push --tags` produces a signed AAB ready for Play.

---

## Master checklist

Tear-off version of the whole flow. Check off as you go.

### Preparation
- [ ] Play Developer account created, paid, verified
- [ ] D-U-N-S number obtained for Pearson Media LLC (Organization account)
- [ ] Payments + tax profile complete
- [ ] Windows long paths enabled + rebooted
- [ ] Privacy policy live at public URL
- [ ] App icon + screenshots ready

### Keystore + Signing
- [ ] Keystore generated with 25+ year validity
- [ ] Keystore backed up to 3 locations
- [ ] Password saved in password manager
- [ ] `keystore.properties` at repo root, gitignored
- [ ] `./gradlew :app:signingReport` shows release variant signed correctly
- [ ] SHA-1 fingerprint recorded for Firebase

### First Build
- [ ] `./gradlew :app:bundleRelease` produces signed AAB
- [ ] AAB fingerprint verified via `keytool -printcert -jarfile`

### Play Console — Account
- [ ] App created
- [ ] Test reviewer account credentials set up in Supabase

### Play Console — App Content
- [ ] Privacy policy URL filed
- [ ] App access reviewer credentials provided
- [ ] Ads → No
- [ ] Target audience → 18+, 16-17, 13-15 only
- [ ] News app → No
- [ ] COVID-19 → No
- [ ] Government → No
- [ ] Financial features → No
- [ ] Health → declared if Health Connect shipping
- [ ] Advertising ID → No
- [ ] `USE_EXACT_ALARM` removed from manifest (forbidden for non-alarm/calendar apps)
- [ ] `FOREGROUND_SERVICE_DATA_SYNC` video recorded, uploaded YouTube-Unlisted, URL submitted
- [ ] Permission justifications filed (SCHEDULE_EXACT_ALARM, CAMERA, RECORD_AUDIO as applicable)
- [ ] `versionCode` bumped after every Play upload, including rejected drafts

### Play Console — Data Safety
- [ ] All data types declared per §7b
- [ ] Encryption in transit → Yes
- [ ] Data deletion request flow → Yes (linked)

### Play Console — Content Rating
- [ ] Questionnaire complete
- [ ] Ratings reasonable (Everyone / 3+ expected)

### Play Console — Store Listing
- [ ] App name, descriptions filed
- [ ] App icon uploaded (512×512)
- [ ] Feature graphic uploaded (1024×500)
- [ ] 2–8 phone screenshots uploaded
- [ ] Category + tags chosen
- [ ] Contact details filed

### First Release
- [ ] Play App Signing configured
- [ ] AAB uploaded to Internal Testing
- [ ] Release notes filed
- [ ] Testers added
- [ ] Internal release rolled out
- [ ] Smoke test passed on real device

### Pre-Production
- [ ] Closed testing track created (if new-account 20/14 rule applies)
- [ ] 20+ testers opted in AND installed
- [ ] 14 days elapsed
- [ ] No production-blocking crashes in Sentry

### Production
- [ ] Production release created
- [ ] Countries chosen
- [ ] Staged rollout starting at 1%
- [ ] Submitted for review

### Post-Launch
- [ ] App visible in Play Store search
- [ ] Crash-free sessions > 99.5%
- [ ] User feedback monitored

### Firebase (optional v1.1)
- [ ] Firebase project created
- [ ] Production Android app registered with release SHA-1
- [ ] Debug Android app registered with debug SHA-1
- [ ] `google-services.json` placed and gitignored
- [ ] `com.google.gms.google-services` plugin applied
- [ ] Test push received successfully

### CI Automation (optional v1.2)
- [ ] Service account created, JSON key downloaded
- [ ] Service account linked to Play Console with Release Manager (non-prod) role
- [ ] All GitHub secrets pasted (keystore, supabase, sentry, firebase, play SA)
- [ ] First CI-driven AAB uploaded to Internal successfully
- [ ] Tag-triggered release flow validated
