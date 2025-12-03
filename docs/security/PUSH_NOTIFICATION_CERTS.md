# Push Notification Certificate Management

> **Last Updated**: 2025-12-03
> **Owner**: Mobile Team
> **Review Frequency**: Monthly

This document outlines the procedures for managing push notification certificates and keys for iOS (APNs) and Android (FCM) platforms.

## Table of Contents

1. [Overview](#overview)
2. [Certificate Inventory](#certificate-inventory)
3. [iOS APNs Setup](#ios-apns-setup)
4. [Android FCM Setup](#android-fcm-setup)
5. [Automated Monitoring](#automated-monitoring)
6. [Renewal Procedures](#renewal-procedures)
7. [Troubleshooting](#troubleshooting)

---

## Overview

### Push Notification Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   EatPal App    │────▶│   Supabase Edge  │────▶│   APNs / FCM    │
│   (iOS/Android) │     │   Functions      │     │   Servers       │
└─────────────────┘     └──────────────────┘     └─────────────────┘
        │                        │                        │
        │                        │                        │
        ▼                        ▼                        ▼
   Device Token           Auth Keys/Certs         Push Delivery
   Registration           (APNs Key, FCM Key)
```

### Key Components

| Platform | Authentication Method | Validity | Location |
|----------|----------------------|----------|----------|
| iOS (APNs) | APNs Auth Key (.p8) | Never expires | Apple Developer Portal |
| iOS (APNs) | Push Certificate (.p12) | 1 year | Apple Developer Portal |
| Android (FCM) | Server Key | Never expires | Firebase Console |
| Android (FCM) | Service Account JSON | Never expires | Firebase Console |

**Recommendation**: Use APNs Auth Keys (not certificates) for iOS as they don't expire.

---

## Certificate Inventory

### Production Credentials

| Credential | Platform | Type | Expiry | Location |
|------------|----------|------|--------|----------|
| APNs Auth Key | iOS | .p8 Key | Never | Supabase Secrets |
| APNs Key ID | iOS | Identifier | Never | Supabase Secrets |
| APNs Team ID | iOS | Identifier | Never | Supabase Secrets |
| FCM Server Key | Android | API Key | Never | Supabase Secrets |
| FCM Service Account | Android | JSON | Never | Supabase Secrets |
| Push Cert (legacy) | iOS | .p12 | YYYY-MM-DD | Vault |

### Environment Variables

```bash
# iOS APNs (Preferred: Auth Key method)
APNS_KEY_ID=XXXXXXXXXX
APNS_TEAM_ID=XXXXXXXXXX
APNS_KEY_FILE=AuthKey_XXXXXXXXXX.p8  # Or base64 encoded content

# iOS APNs (Legacy: Certificate method)
APNS_CERT_FILE=push_cert.p12
APNS_CERT_PASSWORD=your-password

# Android FCM
FCM_SERVER_KEY=AAAA...
FCM_SERVICE_ACCOUNT={"type":"service_account",...}

# Common
PUSH_ENVIRONMENT=production  # or 'sandbox' for development
```

---

## iOS APNs Setup

### Option 1: APNs Auth Key (Recommended)

Auth Keys are preferred because they:
- Never expire
- Work for all your apps under the same team
- Are simpler to manage

#### Creating an APNs Auth Key

1. **Apple Developer Portal**:
   ```
   1. Go to https://developer.apple.com/account
   2. Navigate to Certificates, Identifiers & Profiles
   3. Select Keys in the sidebar
   4. Click the + button to create a new key
   5. Enter a key name (e.g., "EatPal Push Notifications")
   6. Check "Apple Push Notifications service (APNs)"
   7. Click Continue, then Register
   8. IMPORTANT: Download the .p8 file immediately (you can only download once!)
   9. Note the Key ID displayed on the page
   ```

2. **Store the Key Securely**:
   ```bash
   # Store in a secure vault or secrets manager
   # The key file should look like:
   -----BEGIN PRIVATE KEY-----
   MIGTAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBHkwdwIBAQQg...
   -----END PRIVATE KEY-----
   ```

3. **Configure in Supabase**:
   ```bash
   # Base64 encode the key file
   base64 -i AuthKey_XXXXXXXXXX.p8 | tr -d '\n' > apns_key_base64.txt

   # Set secrets
   supabase secrets set APNS_KEY_ID=XXXXXXXXXX
   supabase secrets set APNS_TEAM_ID=YYYYYYYYYY
   supabase secrets set APNS_KEY_BASE64=$(cat apns_key_base64.txt)
   ```

#### Using the Auth Key in Edge Functions

```typescript
// functions/send-push-notification/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import * as jose from 'https://deno.land/x/jose@v4.14.4/index.ts';

const APNS_KEY_ID = Deno.env.get('APNS_KEY_ID')!;
const APNS_TEAM_ID = Deno.env.get('APNS_TEAM_ID')!;
const APNS_KEY_BASE64 = Deno.env.get('APNS_KEY_BASE64')!;

async function generateAPNsToken(): Promise<string> {
  const privateKey = atob(APNS_KEY_BASE64);
  const key = await jose.importPKCS8(privateKey, 'ES256');

  const jwt = await new jose.SignJWT({})
    .setProtectedHeader({
      alg: 'ES256',
      kid: APNS_KEY_ID,
    })
    .setIssuer(APNS_TEAM_ID)
    .setIssuedAt()
    .sign(key);

  return jwt;
}

async function sendAPNsNotification(
  deviceToken: string,
  payload: object,
  isProduction: boolean = true
): Promise<Response> {
  const token = await generateAPNsToken();
  const host = isProduction
    ? 'api.push.apple.com'
    : 'api.sandbox.push.apple.com';

  return fetch(`https://${host}/3/device/${deviceToken}`, {
    method: 'POST',
    headers: {
      'authorization': `bearer ${token}`,
      'apns-topic': 'com.eatpal.app',
      'apns-push-type': 'alert',
      'apns-priority': '10',
    },
    body: JSON.stringify(payload),
  });
}
```

### Option 2: APNs Push Certificate (Legacy)

Only use this if you have specific requirements for certificate-based auth.

#### Creating a Push Certificate

```bash
# 1. Create a Certificate Signing Request (CSR)
openssl genrsa -out push_key.pem 2048
openssl req -new -key push_key.pem -out push_csr.csr \
  -subj "/CN=EatPal Push/O=Your Company/C=US"

# 2. Upload CSR to Apple Developer Portal
#    Certificates > + > Apple Push Notification service SSL
#    Choose Production or Sandbox
#    Upload the .csr file
#    Download the .cer file

# 3. Convert to .p12 format
openssl x509 -inform DER -in aps_production.cer -out push_cert.pem
openssl pkcs12 -export -in push_cert.pem -inkey push_key.pem \
  -out push_cert.p12 -name "EatPal Push Certificate"

# 4. Verify the certificate
openssl pkcs12 -info -in push_cert.p12 -nodes
```

#### Certificate Expiry Monitoring

```bash
# Check certificate expiry date
openssl pkcs12 -in push_cert.p12 -nodes -passin pass:yourpassword | \
  openssl x509 -noout -enddate

# Output: notAfter=Dec  3 12:00:00 2025 GMT
```

---

## Android FCM Setup

### Option 1: FCM HTTP v1 API (Recommended)

Uses a service account for authentication. This is the modern, recommended approach.

#### Creating Service Account

1. **Firebase Console**:
   ```
   1. Go to https://console.firebase.google.com
   2. Select your project
   3. Go to Project Settings > Service Accounts
   4. Click "Generate new private key"
   5. Download the JSON file
   ```

2. **Store Securely**:
   ```bash
   # The JSON file contains:
   {
     "type": "service_account",
     "project_id": "eatpal-xxxxx",
     "private_key_id": "...",
     "private_key": "-----BEGIN PRIVATE KEY-----\n...",
     "client_email": "firebase-adminsdk-xxxxx@eatpal-xxxxx.iam.gserviceaccount.com",
     ...
   }
   ```

3. **Configure in Supabase**:
   ```bash
   # Base64 encode the JSON
   base64 -i firebase-service-account.json | tr -d '\n' > fcm_sa_base64.txt

   # Set secret
   supabase secrets set FCM_SERVICE_ACCOUNT_BASE64=$(cat fcm_sa_base64.txt)
   ```

#### Using Service Account in Edge Functions

```typescript
// functions/send-push-notification/fcm.ts
import { GoogleAuth } from 'https://esm.sh/google-auth-library@9.0.0';

const FCM_SERVICE_ACCOUNT_BASE64 = Deno.env.get('FCM_SERVICE_ACCOUNT_BASE64')!;

async function getFCMAccessToken(): Promise<string> {
  const serviceAccount = JSON.parse(atob(FCM_SERVICE_ACCOUNT_BASE64));

  const auth = new GoogleAuth({
    credentials: serviceAccount,
    scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
  });

  const client = await auth.getClient();
  const token = await client.getAccessToken();
  return token.token!;
}

async function sendFCMNotification(
  deviceToken: string,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<Response> {
  const accessToken = await getFCMAccessToken();
  const projectId = JSON.parse(atob(FCM_SERVICE_ACCOUNT_BASE64)).project_id;

  return fetch(
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token: deviceToken,
          notification: { title, body },
          data,
          android: {
            priority: 'high',
          },
        },
      }),
    }
  );
}
```

### Option 2: FCM Legacy Server Key

Simpler but deprecated. Still works but not recommended for new implementations.

```bash
# Get the server key from Firebase Console
# Project Settings > Cloud Messaging > Server key

supabase secrets set FCM_SERVER_KEY=AAAA...your-server-key
```

```typescript
// Legacy FCM implementation
async function sendFCMLegacy(deviceToken: string, payload: object) {
  const serverKey = Deno.env.get('FCM_SERVER_KEY')!;

  return fetch('https://fcm.googleapis.com/fcm/send', {
    method: 'POST',
    headers: {
      'Authorization': `key=${serverKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: deviceToken,
      notification: payload,
    }),
  });
}
```

---

## Automated Monitoring

### GitHub Actions Workflow

Create `.github/workflows/push-cert-monitor.yml`:

```yaml
name: Push Certificate Monitor

on:
  schedule:
    # Run daily at 9 AM UTC
    - cron: '0 9 * * *'
  workflow_dispatch:

jobs:
  check-certificates:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Check APNs Certificate Expiry
        id: check_apns
        run: |
          # This is for legacy .p12 certificates only
          # Auth keys (.p8) don't expire

          if [ -n "${{ secrets.APNS_CERT_BASE64 }}" ]; then
            echo "${{ secrets.APNS_CERT_BASE64 }}" | base64 -d > /tmp/push_cert.p12

            EXPIRY=$(openssl pkcs12 -in /tmp/push_cert.p12 \
              -passin pass:${{ secrets.APNS_CERT_PASSWORD }} \
              -nodes 2>/dev/null | \
              openssl x509 -noout -enddate | \
              cut -d= -f2)

            EXPIRY_EPOCH=$(date -d "$EXPIRY" +%s)
            NOW_EPOCH=$(date +%s)
            DAYS_LEFT=$(( (EXPIRY_EPOCH - NOW_EPOCH) / 86400 ))

            echo "days_left=$DAYS_LEFT" >> $GITHUB_OUTPUT
            echo "expiry_date=$EXPIRY" >> $GITHUB_OUTPUT

            if [ $DAYS_LEFT -lt 30 ]; then
              echo "status=warning" >> $GITHUB_OUTPUT
            elif [ $DAYS_LEFT -lt 7 ]; then
              echo "status=critical" >> $GITHUB_OUTPUT
            else
              echo "status=ok" >> $GITHUB_OUTPUT
            fi
          else
            echo "status=not_configured" >> $GITHUB_OUTPUT
            echo "Using APNs Auth Key (no expiry)" >> $GITHUB_STEP_SUMMARY
          fi

          rm -f /tmp/push_cert.p12

      - name: Check FCM Configuration
        id: check_fcm
        run: |
          if [ -n "${{ secrets.FCM_SERVICE_ACCOUNT_BASE64 }}" ]; then
            echo "status=ok" >> $GITHUB_OUTPUT
            echo "FCM Service Account is configured" >> $GITHUB_STEP_SUMMARY
          elif [ -n "${{ secrets.FCM_SERVER_KEY }}" ]; then
            echo "status=ok" >> $GITHUB_OUTPUT
            echo "FCM Server Key is configured (legacy)" >> $GITHUB_STEP_SUMMARY
          else
            echo "status=not_configured" >> $GITHUB_OUTPUT
          fi

      - name: Create Alert Issue (if needed)
        if: steps.check_apns.outputs.status == 'warning' || steps.check_apns.outputs.status == 'critical'
        uses: actions/github-script@v7
        with:
          script: |
            const daysLeft = ${{ steps.check_apns.outputs.days_left }};
            const expiryDate = '${{ steps.check_apns.outputs.expiry_date }}';
            const status = '${{ steps.check_apns.outputs.status }}';

            const title = status === 'critical'
              ? `🚨 CRITICAL: APNs Certificate expires in ${daysLeft} days!`
              : `⚠️ WARNING: APNs Certificate expires in ${daysLeft} days`;

            // Check if issue already exists
            const issues = await github.rest.issues.listForRepo({
              owner: context.repo.owner,
              repo: context.repo.repo,
              labels: 'push-cert-expiry',
              state: 'open'
            });

            if (issues.data.length === 0) {
              await github.rest.issues.create({
                owner: context.repo.owner,
                repo: context.repo.repo,
                title: title,
                body: `## Push Certificate Expiry Alert\n\n**Certificate expires**: ${expiryDate}\n**Days remaining**: ${daysLeft}\n\nPlease renew the APNs push certificate before it expires.\n\nRefer to \`docs/security/PUSH_NOTIFICATION_CERTS.md\` for renewal procedures.`,
                labels: ['push-cert-expiry', 'security', 'urgent']
              });
            }

      - name: Summary
        run: |
          echo "## Push Notification Certificate Status" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "| Platform | Status | Details |" >> $GITHUB_STEP_SUMMARY
          echo "|----------|--------|---------|" >> $GITHUB_STEP_SUMMARY
          echo "| iOS APNs | ${{ steps.check_apns.outputs.status }} | ${{ steps.check_apns.outputs.days_left || 'N/A' }} days remaining |" >> $GITHUB_STEP_SUMMARY
          echo "| Android FCM | ${{ steps.check_fcm.outputs.status }} | Configured |" >> $GITHUB_STEP_SUMMARY
```

### Supabase Edge Function for Monitoring

```typescript
// functions/check-push-certs/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  const results = {
    apns: { configured: false, method: null },
    fcm: { configured: false, method: null },
    timestamp: new Date().toISOString(),
  };

  // Check APNs configuration
  if (Deno.env.get('APNS_KEY_ID') && Deno.env.get('APNS_KEY_BASE64')) {
    results.apns.configured = true;
    results.apns.method = 'auth_key';
  } else if (Deno.env.get('APNS_CERT_BASE64')) {
    results.apns.configured = true;
    results.apns.method = 'certificate';
  }

  // Check FCM configuration
  if (Deno.env.get('FCM_SERVICE_ACCOUNT_BASE64')) {
    results.fcm.configured = true;
    results.fcm.method = 'service_account';
  } else if (Deno.env.get('FCM_SERVER_KEY')) {
    results.fcm.configured = true;
    results.fcm.method = 'server_key';
  }

  return new Response(JSON.stringify(results), {
    headers: { 'Content-Type': 'application/json' },
  });
});
```

---

## Renewal Procedures

### APNs Certificate Renewal (Legacy)

```bash
# 1. Generate new CSR (or reuse existing key)
openssl req -new -key push_key.pem -out push_csr_new.csr \
  -subj "/CN=EatPal Push/O=Your Company/C=US"

# 2. Go to Apple Developer Portal
#    Certificates > Find expiring certificate > Renew
#    Upload new CSR
#    Download new .cer file

# 3. Create new .p12
openssl x509 -inform DER -in aps_production_new.cer -out push_cert_new.pem
openssl pkcs12 -export -in push_cert_new.pem -inkey push_key.pem \
  -out push_cert_new.p12 -name "EatPal Push Certificate"

# 4. Base64 encode and update secret
base64 -i push_cert_new.p12 | tr -d '\n' > cert_base64.txt
supabase secrets set APNS_CERT_BASE64=$(cat cert_base64.txt)

# 5. Test push notification delivery
# Send a test notification to a development device

# 6. After verification, update production
# Delete old certificate from Apple Developer Portal after 24 hours
```

### Migration from Certificate to Auth Key

If you're using the legacy certificate method, migrate to auth keys:

```bash
# 1. Create new Auth Key (see iOS APNs Setup section above)

# 2. Update your push notification code to use auth key method

# 3. Deploy and test in staging environment

# 4. Roll out to production

# 5. After verification, let the certificate expire naturally
#    (don't renew it)
```

---

## Troubleshooting

### Common Issues

#### APNs: "BadDeviceToken"

```bash
# Causes:
# - Token was generated for wrong environment (sandbox vs production)
# - Token has been invalidated (user uninstalled app)
# - Token format is incorrect

# Solution:
# 1. Verify environment matches
# 2. Remove invalid tokens from database
# 3. Ensure token is hex-encoded properly
```

#### APNs: "InvalidProviderToken"

```bash
# Causes:
# - Auth key doesn't match the Key ID
# - Team ID is incorrect
# - JWT is malformed or expired

# Solution:
# 1. Verify APNS_KEY_ID matches the key file name
# 2. Verify APNS_TEAM_ID in Apple Developer Portal
# 3. Regenerate JWT (should be regenerated periodically)
```

#### FCM: "InvalidRegistration"

```bash
# Causes:
# - Invalid device token format
# - Token was generated for different sender ID

# Solution:
# 1. Verify the token format
# 2. Check that sender ID matches in Firebase project
```

#### FCM: "NotRegistered"

```bash
# Causes:
# - App was uninstalled
# - Token was refreshed

# Solution:
# 1. Remove the token from your database
# 2. Implement token refresh handling in the app
```

### Testing Push Notifications

```bash
# Test APNs delivery (requires valid device token)
curl -v -X POST \
  -H "authorization: bearer $(generate_apns_jwt)" \
  -H "apns-topic: com.eatpal.app" \
  -H "apns-push-type: alert" \
  --data '{"aps":{"alert":"Test notification"}}' \
  https://api.sandbox.push.apple.com/3/device/DEVICE_TOKEN

# Test FCM delivery
curl -X POST \
  -H "Authorization: key=YOUR_SERVER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "DEVICE_TOKEN",
    "notification": {
      "title": "Test",
      "body": "Test notification"
    }
  }' \
  https://fcm.googleapis.com/fcm/send
```

### Debug Logging

Enable debug logging in your Edge Function:

```typescript
const DEBUG = Deno.env.get('PUSH_DEBUG') === 'true';

function debugLog(message: string, data?: any) {
  if (DEBUG) {
    console.log(`[PUSH DEBUG] ${message}`, data ? JSON.stringify(data) : '');
  }
}

// Usage
debugLog('Sending APNs notification', { deviceToken, payload });
```

---

## Security Best Practices

1. **Never commit credentials** to version control
2. **Use environment-specific keys** (sandbox for dev, production for prod)
3. **Rotate credentials regularly** (even if they don't expire)
4. **Monitor delivery rates** - sudden drops may indicate credential issues
5. **Implement token refresh** in mobile app to handle expired tokens
6. **Store credentials in secrets manager** (not in code or config files)
7. **Limit access** - only team members who need it should have access

---

## Related Documents

- [Secrets Rotation Guide](./SECRETS_ROTATION.md)
- [Mobile App Setup Guide](../mobile/SETUP.md)
- [Supabase Edge Functions](../backend/EDGE_FUNCTIONS.md)
