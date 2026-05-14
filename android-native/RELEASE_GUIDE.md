# EatPal Android — Release Guide

End-to-end walkthrough for shipping the native Android app to Google Play, from generating your first signing keystore to fully automated signed-AAB builds via GitHub Actions.

> **Audience**: someone with no prior Android release experience but comfortable with `git`, the terminal, and Android Studio.
>
> **Time budget**:
> - First deploy via Android Studio + Play Console: 2–3 hours (mostly waiting on Play Console review).
> - GitHub Actions setup after that: 20 minutes.

---

## Table of contents

1. [Pre-flight checklist](#1-pre-flight-checklist)
2. [Create the upload keystore (one-time)](#2-create-the-upload-keystore-one-time)
3. [Wire local signing](#3-wire-local-signing)
4. [Build a signed AAB locally](#4-build-a-signed-aab-locally)
5. [Play Console first-time setup](#5-play-console-first-time-setup)
6. [Required listing assets](#6-required-listing-assets)
7. [Privacy policy + Data safety form](#7-privacy-policy--data-safety-form)
8. [Content rating questionnaire](#8-content-rating-questionnaire)
9. [Upload the first AAB](#9-upload-the-first-aab)
10. [Promote internal → production](#10-promote-internal--production)
11. [Automate with GitHub Actions](#11-automate-with-github-actions)
12. [Optional: Firebase / FCM push](#12-optional-firebase--fcm-push)
13. [Versioning convention](#13-versioning-convention)
14. [Troubleshooting](#14-troubleshooting)

---

## 1. Pre-flight checklist

Before you start, confirm:

- [ ] **Play Console developer account active** ($25 one-time, registered to a real legal entity or person).
- [ ] **Android Studio installed** (Koala / Panda 2 or newer; this repo expects AGP 8.x).
- [ ] **JDK 17** installed and `JAVA_HOME` set (Android Studio bundles one — check `Settings → Build Tools → Gradle`).
- [ ] **Repo cloned** and `./gradlew :app:assembleDebug` already builds clean from `android-native/`.
- [ ] **Privacy policy URL** picked (e.g. `https://tryeatpal.com/privacy`). The page itself can ship after you create the Play listing — but you need the URL chosen.
- [ ] **App icon + screenshots** prepared (sizes in [§6](#6-required-listing-assets)).

You do **not** need any of these for v1:

- Firebase project / `google-services.json` — push notifications can be added later.
- Service-account JSON for automated Play uploads — manual upload through the web console is fine for the first few releases.
- A Mac — Android signing + builds work on any OS.

---

## 2. Create the upload keystore (one-time)

A keystore is a single `.jks` file containing the cryptographic key Google uses to verify every update is from you. **If you lose it (or the password) you can never publish updates again** — Play has a recovery flow but it's slow and lossy.

### Generate it

From any terminal, replace `CHANGE_ME` and the `dname` fields with your own:

```bash
keytool -genkey -v \
  -keystore eatpal-release.jks \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10950 \
  -alias eatpal-upload \
  -storepass 'CHANGE_ME' \
  -keypass 'CHANGE_ME' \
  -dname "CN=EatPal, O=Your Name LLC, L=Your City, ST=Your State, C=US"
```

The `-validity 10950` is 30 years — Play requires at least 25 years on the upload key.

### Store it somewhere safe

Move `eatpal-release.jks` somewhere outside the repo. Recommended:

- macOS / Linux: `~/keys/eatpal-release.jks`
- Windows: `C:\Users\<you>\keys\eatpal-release.jks`

Put the **passwords** in your password manager under an entry called something like "EatPal Android upload key". You will need them every time you sign — and the GitHub Actions secrets you set up later store them too.

### Back it up

Copy the `.jks` file to:

- A second physical drive
- An encrypted cloud backup (1Password attachment, encrypted iCloud Drive, Bitwarden Secure Note attachment)

If your laptop dies and you don't have a backup, Google's Play App Signing recovery process can rotate the key but it's friction-heavy. Don't skip this step.

---

## 3. Wire local signing

Once the keystore exists, tell Gradle where it is.

### 3a. Create `keystore.properties`

At the **repo root** (sibling of `package.json` and `env.local.properties`), create `keystore.properties`:

```properties
# Path to the .jks (use forward slashes on Windows).
storeFile=C:/Users/yourname/keys/eatpal-release.jks
storePassword=THE_PASSWORD_YOU_TYPED_TWICE
keyAlias=eatpal-upload
keyPassword=THE_KEY_PASSWORD
```

A template lives at `keystore.properties.example` — copy it and fill in the real values.

This file is **gitignored** (see the `keystore.properties` line in `.gitignore`). Don't commit it.

### 3b. Confirm Gradle picks it up

```bash
cd android-native
./gradlew :app:signingReport
```

Look for a `Variant: release` block. If `Store: ...` shows your `.jks` path, you're wired. If you see `Variant: release` with no Store line, Gradle didn't find the properties — re-check the file lives at the repo root, not inside `android-native/`.

---

## 4. Build a signed AAB locally

```bash
cd android-native
./gradlew :app:bundleRelease
```

Output lands at `android-native/app/build/outputs/bundle/release/app-release.aab`. That's the file you'll upload to Play Console.

You can also use Android Studio's UI:

1. **Build → Generate Signed App Bundle / APK…**
2. Pick **Android App Bundle**.
3. Browse to your `.jks`, type passwords, pick the alias.
4. Pick the **release** variant.
5. Click **Create**.

Both paths produce the same `app-release.aab`.

### Verify the bundle

Useful sanity checks before uploading:

```bash
# Inspect signing
keytool -printcert -jarfile android-native/app/build/outputs/bundle/release/app-release.aab

# Compare to the public-key fingerprint shown by `signingReport` above.

# Confirm versionCode bumped from any previous release
unzip -p android-native/app/build/outputs/bundle/release/app-release.aab BundleConfig.pb | strings | head
```

---

## 5. Play Console first-time setup

Sign in at <https://play.google.com/console>. Assuming the developer account is already paid for:

### 5a. Create the app

1. **All apps → Create app**
2. App name: `EatPal — Picky Eater Meal Planner` (or your final marketing name; can be 30 chars).
3. Default language: `English (United States)`.
4. App or game: **App**.
5. Free or paid: **Free** (in-app purchases via Play Billing are still allowed).
6. Accept the developer-program policies.

### 5b. Set up the internal testing track

Internal testing lets you upload signed bundles immediately without Play review. **Always use this for the first deploy** — review takes hours and rejected first builds delay launch by days.

1. **Testing → Internal testing → Create new release**
2. Add testers by email (your own email, plus anyone who'll smoke-test).
3. Save the release form for later — you'll come back to it after preparing assets.

### 5c. Set the app's package name

Already chosen by `applicationId = "com.eatpal.app"` in `app/build.gradle.kts`. Don't change this; Play locks the package name to your app forever.

> **Note**: debug builds use `com.eatpal.app.debug` (the `applicationIdSuffix`), so you can keep both installed side-by-side.

---

## 6. Required listing assets

Play Console blocks publication until **all** of these exist. Prepare them before you start filling out the listing — bouncing back and forth is painful.

| Asset | Spec | Where it appears |
|---|---|---|
| App icon | 512×512 PNG, 32-bit | Play Store header. Must match the in-app launcher icon visually. |
| Feature graphic | 1024×500 PNG/JPG | Top of your store listing. No text smaller than ~24pt — Play may downscale. |
| Phone screenshots | 2–8 images, 16:9 or 9:16, ≥320px on the short side | Carousel on the listing. Show the headline features (Pantry, Planner, Grocery, Tonight Mode). |
| 7" tablet screenshots | Optional, recommended for tablet visibility | Same idea, 7" form factor. |
| 10" tablet screenshots | Optional, recommended | Same idea, 10" form factor. |
| Short description | 80 chars | Appears under the app name in search. |
| Full description | 4000 chars | Main listing copy. SEO matters here. |
| App category | Pick from list | Best fit: **Food & Drink** or **Parenting**. |
| Contact email | Public | Use a monitored inbox — Play forwards user complaints here. |
| Privacy policy URL | Public, hosted | See [§7](#7-privacy-policy--data-safety-form). |

**Quick screenshot tip**: run the app in Android Studio's emulator (Pixel 6 frame), use **View → Tool Windows → Logcat → camera icon**, save PNGs. Frame them with <https://www.shotbot.io/> or just upload raw — Play accepts both.

---

## 7. Privacy policy + Data safety form

### Privacy policy

Required, must be hosted at a stable public URL. The web app is the natural host: drop a `<PrivacyPolicy />` page at `tryeatpal.com/privacy` if it doesn't already exist.

The policy must mention every data type the app collects. EatPal collects (cross-reference with the iOS App Privacy disclosure):

- Account email + name (for auth)
- Optional kid profiles (names, ages, allergens — all under the parent's account)
- Food, recipe, meal plan, grocery data the parent enters
- Health data (only if user enables Health Connect)
- Photos (only if user uses receipt scan / fridge photo)
- Crash diagnostics (Sentry, scrubbed of PII)

### Data safety form (Play Console)

Found at **App content → Data safety → Manage**. This is a long form — answers must match the privacy policy or Play will reject the listing.

Mirror the iOS Privacy disclosures already filed for the App Store. Quick crib sheet:

| Data type | Collected? | Linked to user? | Used for tracking? | Optional? |
|---|---|---|---|---|
| Email address | Yes | Yes | No | No (required for auth) |
| Name | Yes | Yes | No | Yes |
| User-generated content (recipes, meal plans) | Yes | Yes | No | No (core feature) |
| Health & fitness | Yes | Yes | No | Yes (Health Connect opt-in) |
| Photos | Yes | Yes | No | Yes (scan/fridge) |
| Crash logs | Yes | No | No | No |
| Diagnostics (perf metrics) | Yes | No | No | No |

Encryption in transit: **Yes**. Users can request data deletion: **Yes** — link to a deletion-request flow (the existing in-app "Delete account" or a `tryeatpal.com/account/delete` page).

---

## 8. Content rating questionnaire

**App content → Content ratings → Start questionnaire**

EatPal has no violence, sexual content, gambling, profanity, or drugs/alcohol references. Expected outcomes:

- **IARC rating**: Everyone / 3+
- **ESRB**: Everyone
- **PEGI**: 3
- **USK**: 0

Answer the form honestly; the ratings populate automatically from your answers.

---

## 9. Upload the first AAB

1. **Testing → Internal testing → Create new release** (or open the saved draft from §5b).
2. **Upload** the `app-release.aab` from §4.
3. **Release name**: defaults to `<versionName> (<versionCode>)`. Leave it unless you want a marketing tag.
4. **Release notes**: use one of the following:
   - In the Play Console UI, fill in `What's new in this release?` per language.
   - OR commit notes to `android-native/app/src/main/play/release-notes/<lang>/internal.txt` (the GitHub Actions publish job will pick those up automatically — see [§11](#11-automate-with-github-actions)).
5. Click **Save → Review release → Start rollout to internal testing**.

Within a few minutes the AAB shows up in the Internal Testing track. Add yourself as a tester (already done in §5b) and install via the Play Store opt-in link Play emails you.

> **First-time prompts**: Play may flag "Restricted permissions" for `SCHEDULE_EXACT_ALARM` / `USE_EXACT_ALARM` (used by the local-notification scheduler). Justify in the prompt: "Used to remind users about expiring pantry items at user-chosen times." Apple's equivalent is `UNUserNotification` requestAuthorization, granted same justification.

---

## 10. Promote internal → production

The standard promotion path:

1. **Internal testing** — your team. Verify the build works, no crashes.
2. **Closed testing** — a private group (e.g. design partners, friends-and-family). Optional but recommended for ≥1 week.
3. **Open testing** — public opt-in beta. Optional.
4. **Production** — live on the Play Store, all users.

Promote via **Testing → <track> → Promote release → Production**. Each promotion can carry the same AAB or you can upload a new build.

> **Production rollout**: pick a percentage (1% → 5% → 25% → 100%) so you can halt if a crash spike appears in Sentry.

---

## 11. Automate with GitHub Actions

Once the manual flow works end-to-end and a build is live in production, switch ongoing releases to CI.

### 11a. Required GitHub Actions secrets

Go to **Settings → Secrets and variables → Actions → New repository secret** and add:

| Secret | What goes in it | How to get it |
|---|---|---|
| `ANDROID_KEYSTORE_BASE64` | base64 of your `eatpal-release.jks` | macOS: `base64 -i ~/keys/eatpal-release.jks \| pbcopy` <br> Windows PS: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("$HOME\keys\eatpal-release.jks")) \| Set-Clipboard` |
| `ANDROID_KEYSTORE_PASSWORD` | the `.jks` password | Same as `storePassword` in `keystore.properties` |
| `ANDROID_KEY_ALIAS` | upload key alias | `eatpal-upload` (or whatever you used in §2) |
| `ANDROID_KEY_PASSWORD` | the per-key password | Same as `keyPassword` in `keystore.properties` |
| `SUPABASE_URL` | `https://api.tryeatpal.com` | Already set if iOS CI is working |
| `SUPABASE_ANON_KEY` | Supabase anon JWT | Already set if iOS CI is working |
| `SENTRY_DSN` | Sentry project DSN | Optional. From Sentry project settings |
| `GOOGLE_WEB_CLIENT_ID` | Google OAuth client ID | Optional. Only needed for Google Sign-In via Supabase |

> **Optional** — only needed if you want CI to push the AAB directly to Play Console:
> | `PLAY_PUBLISHER_SERVICE_ACCOUNT_JSON_BASE64` | base64 of a GCP service-account JSON | See [§11c](#11c-optional-automated-play-console-upload) below |

### 11b. Trigger a build

The workflow `.github/workflows/android-release.yml` fires on:

- **Manual dispatch**: Actions tab → `android-release` → **Run workflow** → pick a track. Use this for ad-hoc release candidates.
- **Tag push**: `git tag android/v1.0.1 && git push origin android/v1.0.1`. Use for official releases (mirrors the iOS `ios/v*` convention).

The signed AAB and R8 mapping file land as workflow artifacts. Download `eatpal-release-<name>-<code>.aab` and upload manually to Play Console for the first few CI-built releases until you trust the pipeline.

### 11c. Optional: automated Play Console upload

Skip this until you've manually uploaded at least 2–3 CI-built AABs and seen them install cleanly. Automation is convenient but it's a long way to fall if the pipeline pushes a broken bundle to production.

When you're ready:

1. **Google Cloud Console** → create a service account in the same GCP project as the Play Console linkage.
2. Grant it the **Service Account User** role in Cloud, then in Play Console **Setup → API access** add the SA and grant **Release manager** (Internal/Closed/Open) — never grant Production write to a CI account in v1.
3. Download the SA JSON, base64 it, paste as the `PLAY_PUBLISHER_SERVICE_ACCOUNT_JSON_BASE64` secret.
4. Run the workflow manually, pick a track. The `publish` job will detect the secret and push the AAB to Play.

The workflow uses [`r0adkll/upload-google-play`](https://github.com/r0adkll/upload-google-play). Release notes can be committed to `android-native/app/src/main/play/release-notes/<lang>/<track>.txt` and the action picks them up automatically.

---

## 12. Optional: Firebase / FCM push

Push notifications via FCM are stubbed in the manifest (`EatPalMessagingService`) but the service is dormant until the Firebase config lands. To enable:

1. Create a Firebase project at <https://console.firebase.google.com/>.
2. Add Android app: package name `com.eatpal.app` (and `com.eatpal.app.debug` as a separate app entry for dev).
3. Download both `google-services.json` files.
4. Drop the production one at `android-native/app/google-services.json` (it's gitignored — distribute via 1Password / shared vault).
5. In `android-native/app/build.gradle.kts` apply the plugin:
   ```kotlin
   plugins {
       // … existing plugins …
       id("com.google.gms.google-services")
   }
   ```
6. Add the classpath in `android-native/build.gradle.kts`:
   ```kotlin
   plugins {
       // … existing plugins …
       id("com.google.gms.google-services") version "4.4.2" apply false
   }
   ```
7. Rebuild. `EatPalMessagingService` will start receiving FCM tokens and surfacing them via `PushTokenService.uploadToken(...)`.

> **CI**: also drop the `google-services.json` into a base64 secret (`ANDROID_GOOGLE_SERVICES_JSON_BASE64`) and decode it in the workflow before `bundleRelease`. Update the workflow when you reach this step.

---

## 13. Versioning convention

Bump both `versionCode` and `versionName` in `android-native/app/build.gradle.kts` for every release Play Console accepts:

- `versionCode` — integer, **must increase monotonically**. Play rejects a code <= the latest live build.
- `versionName` — semver string the user sees. Match the iOS marketing version when shipping cross-platform parity.

Recommended scheme:

| iOS | Android |
|---|---|
| `MARKETING_VERSION = 1.0.0`, `CURRENT_PROJECT_VERSION = 1` | `versionName = "1.0.0"`, `versionCode = 1` |
| `1.0.1` build 5 | `versionName = "1.0.1"`, `versionCode = 6` (always +1, even for hotfixes) |

For a clean cross-platform tag scheme the iOS workflow already uses `ios/v1.0.0` — mirror with `android/v1.0.0` so a tag fires the matching CI.

---

## 14. Troubleshooting

### `./gradlew :app:bundleRelease` says "release signing config is missing"

`haveReleaseSigning` returned false. Either `keystore.properties` doesn't exist at the repo root, or it's missing one of the four required fields. Re-check the path with `ls ../keystore.properties` from `android-native/`.

### Play Console rejects the AAB with "package already exists"

Someone else (or an old EAS build) already claimed `com.eatpal.app` on this developer account. Check **All apps** for ghost entries. If you want to keep that entry, you must use the existing keystore — not a new one — to upload.

### Play Console says "upload key fingerprint mismatch"

You're trying to update an app with a different keystore than the original. Either use the original keystore, or follow Play App Signing key reset (Settings → App integrity → App Signing → Request upload key reset).

### `./gradlew :app:bundleRelease` succeeds but the AAB is huge (>50 MB)

R8 didn't run. Confirm `isMinifyEnabled = true` is still set under `buildTypes.release`. If the build log shows `Minifying release` but the bundle is still huge, check `proguard-rules.pro` for over-broad `-keep` rules.

### CI fails on "ANDROID_KEYSTORE_BASE64 is not set"

The secret name is exactly `ANDROID_KEYSTORE_BASE64` (case-sensitive). If you pasted into the wrong organization or repo, the secret won't be visible to this workflow.

### CI builds, but Play upload fails with "service account does not have permission"

The Google Cloud service account isn't linked to Play Console yet. Go to **Setup → API access**, find the SA email, click **Grant access**, give it **Release manager** for the relevant track. Re-run the workflow.

### App installs from internal testing but crashes on launch

Likely Sentry will have the stack trace. If not, hook USB and run `adb logcat | grep -i eatpal`. Most common: the release `BuildConfig` got placeholder Supabase keys because the env wasn't passed. Verify the `SUPABASE_URL` / `SUPABASE_ANON_KEY` secrets are set and not empty.

---

## Quick-reference: minimum viable first release

For the impatient. Assumes you've done §1.

```bash
# 1. Generate keystore (one-time)
keytool -genkey -v \
  -keystore ~/keys/eatpal-release.jks \
  -keyalg RSA -keysize 2048 -validity 10950 \
  -alias eatpal-upload \
  -dname "CN=EatPal, O=Your Name LLC, L=City, ST=State, C=US"

# 2. Create keystore.properties at the repo root
cat > keystore.properties <<EOF
storeFile=/Users/you/keys/eatpal-release.jks
storePassword=...
keyAlias=eatpal-upload
keyPassword=...
EOF

# 3. Build the AAB
cd android-native && ./gradlew :app:bundleRelease

# 4. Upload to Play Console internal testing track manually via the web UI
#    (path: app/build/outputs/bundle/release/app-release.aab)
```

After it works once manually, set up the GitHub Actions secrets in §11 and trigger `android-release` from the Actions tab. From then on, every `git tag android/v1.0.x && git push --tags` produces a signed AAB ready for Play.
