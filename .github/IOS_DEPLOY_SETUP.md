# iOS App Store Deploy - Setup Guide

## Required GitHub Secrets

Go to **Settings > Secrets and variables > Actions** and add these secrets:

### Code Signing

| Secret | Description | How to Get It |
|--------|-------------|---------------|
| `IOS_P12_CERTIFICATE_BASE64` | Base64-encoded .p12 distribution certificate | Export from Keychain Access, then `base64 -i cert.p12` |
| `IOS_P12_PASSWORD` | Password for the .p12 certificate | Set when exporting from Keychain |
| `IOS_KEYCHAIN_PASSWORD` | Temporary keychain password (any random string) | Generate: `openssl rand -hex 16` |
| `IOS_PROVISIONING_PROFILE_BASE64` | Base64-encoded App Store provisioning profile | Download from Apple Developer portal, then `base64 -i profile.mobileprovision` |

### App Store Connect API

| Secret | Description | How to Get It |
|--------|-------------|---------------|
| `APP_STORE_CONNECT_API_KEY_ID` | API Key ID (e.g., `ABC123DEFG`) | App Store Connect > Users and Access > Keys |
| `APP_STORE_CONNECT_ISSUER_ID` | Issuer ID (UUID format) | Same page as API Key |
| `APP_STORE_CONNECT_API_KEY_BASE64` | Base64-encoded .p8 API key file | Download .p8 key, then `base64 -i AuthKey.p8` |

### App Configuration

| Secret | Description |
|--------|-------------|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | Your Supabase anonymous/public key |

## Step-by-Step Setup

### 1. Apple Developer Certificate

```bash
# In Keychain Access:
# 1. Open Keychain Access
# 2. Find your "Apple Distribution" certificate
# 3. Right-click > Export (choose .p12 format)
# 4. Set a password

# Base64 encode it:
base64 -i Certificates.p12 | pbcopy
# Paste into IOS_P12_CERTIFICATE_BASE64 secret
```

### 2. Provisioning Profile

```bash
# 1. Go to https://developer.apple.com/account/resources/profiles
# 2. Create or download an "App Store" provisioning profile for com.eatpal.app
# 3. Base64 encode:
base64 -i EatPal_AppStore.mobileprovision | pbcopy
# Paste into IOS_PROVISIONING_PROFILE_BASE64 secret
```

### 3. App Store Connect API Key

```bash
# 1. Go to https://appstoreconnect.apple.com/access/api
# 2. Click "+" to generate a new key
# 3. Name: "GitHub Actions", Access: "App Manager"
# 4. Download the .p8 key file (only available once!)
# 5. Note the Key ID and Issuer ID
# 6. Base64 encode:
base64 -i AuthKey_XXXXXXXXXX.p8 | pbcopy
# Paste into APP_STORE_CONNECT_API_KEY_BASE64 secret
```

## Running the Workflow

1. Go to **Actions** tab in GitHub
2. Select **iOS App Store Deploy**
3. Click **Run workflow**
4. Enter:
   - **Version**: Semver format (e.g., `1.0.0`, `1.1.0`, `2.0.0`)
   - **Build number**: Leave empty for auto-generated, or enter manually
   - **Release notes**: What changed
   - **Submit for review**: Check to auto-submit after upload
5. Click **Run workflow**

## Version Strategy

- **Major** (2.0.0): Breaking changes, major redesigns
- **Minor** (1.1.0): New features, significant improvements
- **Patch** (1.0.1): Bug fixes, small tweaks
- **Build**: Auto-generated as `YYYYMMDD.run_number` or manually specified

Each successful deploy creates a git tag: `ios/v1.0.0+20260214.42`
