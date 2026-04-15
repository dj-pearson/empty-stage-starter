# Environment Variables Reference

> **Last Updated**: 2025-12-27
> **Project**: EatPal (Munch Maker Mate)
> **Purpose**: Complete reference of all environment variables required by the platform

This document lists every environment variable used across the platform, including where it's expected (frontend, edge functions, build process) and the format it should be in.

---

## Table of Contents

1. [Quick Setup Checklist](#quick-setup-checklist)
2. [Frontend Variables (Vite)](#frontend-variables-vite)
3. [Build Process Variables](#build-process-variables)
4. [Supabase Edge Function Variables](#supabase-edge-function-variables)
5. [Configuration by Environment](#configuration-by-environment)
6. [Variable Details by Feature](#variable-details-by-feature)

---

## Quick Setup Checklist

### Minimum Required (App Won't Work Without These)

| Variable | Where to Set | Format |
|----------|--------------|--------|
| `VITE_SUPABASE_URL` | `.env` file / Cloudflare Pages | Plain text URL |
| `VITE_SUPABASE_ANON_KEY` | `.env` file / Cloudflare Pages | Plain text JWT |
| `SUPABASE_URL` | Supabase Edge Functions Secrets | Plain text URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Edge Functions Secrets | **SECRET** - Never expose |

### Feature-Specific (Add Based on Features Used)

| Feature | Variables Needed |
|---------|-----------------|
| Payments (Stripe) | `VITE_STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |
| Error Monitoring | `VITE_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` |
| Google Search Console | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` |
| Email Notifications | `EMAIL_PROVIDER`, `RESEND_API_KEY` |
| AI Features | `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `LOVABLE_API_KEY` |
| Push Notifications | `APNS_*` (iOS), `FCM_*` (Android) |

---

## Frontend Variables (Vite)

These variables are used in the browser via `import.meta.env.VITE_*`. They **MUST** be prefixed with `VITE_` to be exposed to the frontend.

### Where to Set
- **Local Development**: `.env` file in project root
- **Production (Cloudflare Pages)**: Dashboard → Settings → Environment variables
- **Preview Deployments**: Set for both "Production" and "Preview" environments

### Core Supabase Configuration

| Variable | Required | Format | Description | Used In |
|----------|----------|--------|-------------|---------|
| `VITE_SUPABASE_URL` | **YES** | `https://api.tryeatpal.com` | Supabase API endpoint | `src/integrations/supabase/client.ts:5` |
| `VITE_SUPABASE_ANON_KEY` | **YES** | JWT string (eyJ...) | Public anonymous key for client auth | `src/integrations/supabase/client.ts:6` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Mobile only | JWT string | Same as anon key, mobile naming | `src/integrations/supabase/client.mobile.ts:6` |
| `VITE_FUNCTIONS_URL` | Optional | `https://functions.tryeatpal.com` | Edge functions URL (auto-derived if not set) | `src/lib/edge-functions.ts:26` |

### Error Monitoring (Sentry)

| Variable | Required | Format | Description | Used In |
|----------|----------|--------|-------------|---------|
| `VITE_SENTRY_DSN` | Optional | `https://xxx@xxx.ingest.sentry.io/xxx` | Sentry data source name | `src/lib/sentry.tsx:15` |
| `VITE_SENTRY_ENABLED` | Optional | `true` or `false` | Force enable/disable Sentry (default: false in dev) | `src/lib/sentry.tsx:6` |
| `VITE_APP_VERSION` | Optional | `1.0.0` | App version for Sentry tracking | `src/lib/sentry.tsx:82` |

### Payment Processing (Stripe)

| Variable | Required | Format | Description | Used In |
|----------|----------|--------|-------------|---------|
| `VITE_STRIPE_PUBLISHABLE_KEY` | If using payments | `pk_live_xxx` or `pk_test_xxx` | Stripe publishable key | `src/components/billing/AddPaymentMethodDialog.tsx:87` |

### Analytics & SEO

| Variable | Required | Format | Description | Used In |
|----------|----------|--------|-------------|---------|
| `VITE_GA_MEASUREMENT_ID` | Optional | `G-XXXXXXXXXX` | Google Analytics 4 measurement ID | `.env.example:32` |
| `VITE_BITLY_API_KEY` | Optional | API key string | Bitly URL shortening | `src/lib/url-utils.ts:669` |

### OAuth Integrations

| Variable | Required | Format | Description | Used In |
|----------|----------|--------|-------------|---------|
| `VITE_GOOGLE_CLIENT_ID` | If using GSC/GA4 | OAuth client ID | Google OAuth client ID | `src/lib/oauth-token-rotation.ts:58` |
| `VITE_BING_CLIENT_ID` | If using Bing Webmaster | OAuth client ID | Microsoft/Bing OAuth client ID | `src/lib/oauth-token-rotation.ts:66` |

### Feature Flags

| Variable | Required | Format | Description | Used In |
|----------|----------|--------|-------------|---------|
| `VITE_BACKUP_ENABLED` | Optional | `true` or `false` | Enable multi-region backup features | `src/components/admin/MultiRegionBackup.tsx:190` |

### Automatic Variables (Set by Vite)

These are automatically set by Vite - do NOT set manually:

| Variable | Type | Description |
|----------|------|-------------|
| `import.meta.env.MODE` | `'development'` \| `'production'` | Current build mode |
| `import.meta.env.DEV` | `boolean` | True in development |
| `import.meta.env.PROD` | `boolean` | True in production |

---

## Build Process Variables

These are Node.js environment variables used during build time (CI/CD).

### Where to Set
- **GitHub Actions**: Repository Settings → Secrets and variables → Actions → Repository secrets
- **Local Build**: Export in terminal or add to `.env` (some are picked up)

### Sentry Source Maps (Production Builds)

| Variable | Required | Format | Description | Used In |
|----------|----------|--------|-------------|---------|
| `SENTRY_ORG` | If using Sentry | `your-org-slug` | Sentry organization slug | `vite.config.ts:35` |
| `SENTRY_PROJECT` | If using Sentry | `your-project-slug` | Sentry project slug | `vite.config.ts:36` |
| `SENTRY_AUTH_TOKEN` | If using Sentry | `sntrys_xxx` | **SECRET** - Sentry auth token for uploads | `vite.config.ts:37` |

### CI/CD Environment

| Variable | Required | Format | Description | Used In |
|----------|----------|--------|-------------|---------|
| `CI` | Automatic | `true` | Set by GitHub Actions | `playwright.config.ts:18` |
| `NODE_ENV` | Automatic | `'production'` \| `'development'` \| `'test'` | Node environment | Build system |

### Scripts

| Variable | Required | Format | Description | Used In |
|----------|----------|--------|-------------|---------|
| `VITE_SUPABASE_URL` | For sitemap | URL | Used by sitemap generator script | `scripts/generate-sitemap.js:14` |
| `VITE_SUPABASE_ANON_KEY` | For sitemap | JWT | Used by sitemap generator script | `scripts/generate-sitemap.js:15` |

---

## Supabase Edge Function Variables

These are used in Edge Functions via `Deno.env.get('VARIABLE_NAME')`.

### Where to Set
- **Supabase Dashboard**: Project → Settings → Edge Functions → Secrets
- **Self-Hosted Supabase**: Docker environment variables or secrets management
- **Coolify**: Environment variables in service configuration

### Core Supabase (Required for All Edge Functions)

| Variable | Required | Format | Description | Used In |
|----------|----------|--------|-------------|---------|
| `SUPABASE_URL` | **YES** | `https://api.tryeatpal.com` | Same as `VITE_SUPABASE_URL` | All edge functions |
| `SUPABASE_ANON_KEY` | Optional | JWT string | Anonymous key (for public ops) | Various functions |
| `SUPABASE_SERVICE_ROLE_KEY` | **YES** | JWT string | **SECRET** - Admin access key | All admin operations |

### Payment Processing (Stripe)

| Variable | Required | Format | Description | Functions Using |
|----------|----------|--------|-------------|-----------------|
| `STRIPE_SECRET_KEY` | If using payments | `sk_live_xxx` or `sk_test_xxx` | **SECRET** - Stripe secret key | `create-checkout`, `manage-subscription`, `stripe-webhook`, `generate-invoice`, `manage-payment-methods` |
| `STRIPE_WEBHOOK_SECRET` | If using webhooks | `whsec_xxx` | **SECRET** - Webhook signature verification | `stripe-webhook/index.ts:15` |

### Google OAuth & APIs

| Variable | Required | Format | Description | Functions Using |
|----------|----------|--------|-------------|-----------------|
| `GOOGLE_CLIENT_ID` | If using GSC/GA4 | OAuth client ID | Google OAuth client ID | `gsc-oauth`, `ga4-oauth`, `sync-analytics-data` |
| `GOOGLE_CLIENT_SECRET` | If using GSC/GA4 | OAuth secret | **SECRET** - Google OAuth secret | `gsc-oauth`, `ga4-oauth`, `sync-analytics-data` |
| `GOOGLE_REDIRECT_URI` | If using GSC/GA4 | `https://your-domain/oauth/callback` | OAuth redirect URL | `gsc-oauth/index.ts:43` |
| `PAGESPEED_INSIGHTS_API_KEY` | Optional | API key | Google PageSpeed API (free) | `check-core-web-vitals`, `gsc-fetch-core-web-vitals` |

### Microsoft/Bing OAuth

| Variable | Required | Format | Description | Functions Using |
|----------|----------|--------|-------------|-----------------|
| `MICROSOFT_CLIENT_ID` | If using Bing | OAuth client ID | Microsoft OAuth client ID | `bing-webmaster-oauth`, `sync-analytics-data` |
| `MICROSOFT_CLIENT_SECRET` | If using Bing | OAuth secret | **SECRET** - Microsoft OAuth secret | `bing-webmaster-oauth`, `sync-analytics-data` |
| `MICROSOFT_REDIRECT_URI` | If using Bing | URL | OAuth redirect URL | `bing-webmaster-oauth/index.ts:40` |

### Yandex OAuth

| Variable | Required | Format | Description | Functions Using |
|----------|----------|--------|-------------|-----------------|
| `YANDEX_CLIENT_ID` | If using Yandex | OAuth client ID | Yandex OAuth client ID | `yandex-webmaster-oauth`, `sync-analytics-data` |
| `YANDEX_CLIENT_SECRET` | If using Yandex | OAuth secret | **SECRET** - Yandex OAuth secret | `yandex-webmaster-oauth`, `sync-analytics-data` |
| `YANDEX_REDIRECT_URI` | If using Yandex | URL | OAuth redirect URL | `yandex-webmaster-oauth/index.ts:40` |

### AI Services

| Variable | Required | Format | Description | Functions Using |
|----------|----------|--------|-------------|-----------------|
| `ANTHROPIC_API_KEY` | If using Claude AI | `sk-ant-xxx` | **SECRET** - Anthropic Claude API | `generate-meal-suggestions` |
| `OPENAI_API_KEY` | If using GPT | `sk-xxx` | **SECRET** - OpenAI API key | `analyze-support-ticket` |
| `LOVABLE_API_KEY` | If using Lovable AI | API key | **SECRET** - Lovable AI key | `calculate-food-similarity`, `parse-recipe-grocery` |

### SEO & Backlink Tools

| Variable | Required | Format | Description | Functions Using |
|----------|----------|--------|-------------|-----------------|
| `AHREFS_API_KEY` | Optional | API key | **SECRET** - Ahrefs backlink API | `sync-backlinks/index.ts:36` |
| `MOZ_ACCESS_ID` | Optional | Access ID | Moz API access ID | `sync-backlinks/index.ts:69` |
| `MOZ_SECRET_KEY` | Optional | Secret key | **SECRET** - Moz API secret | `sync-backlinks/index.ts:70` |
| `SERPAPI_KEY` | Optional | API key | **SECRET** - SerpAPI for SERP tracking | `track-serp-positions/index.ts:37` |
| `DATAFORSEO_LOGIN` | Optional | Login | DataForSEO login | `track-serp-positions/index.ts:38` |
| `DATAFORSEO_PASSWORD` | Optional | Password | **SECRET** - DataForSEO password | `track-serp-positions/index.ts:39` |

### Email Notifications

| Variable | Required | Format | Description | Functions Using |
|----------|----------|--------|-------------|-----------------|
| `EMAIL_PROVIDER` | If using email | `resend` \| `sendgrid` \| `ses` \| `smtp` \| `console` | Email service provider | `send-emails` |
| `RESEND_API_KEY` | If using Resend | `re_xxx` | **SECRET** - Resend API key | `send-emails` |
| `EMAIL_FROM` | Optional | `noreply@eatpal.com` | Default from address | `send-emails` |

### Push Notifications - iOS (APNS)

| Variable | Required | Format | Description |
|----------|----------|--------|-------------|
| `APNS_KEY_ID` | If iOS push | Key ID | Apple Push key ID |
| `APNS_TEAM_ID` | If iOS push | Team ID | Apple Developer Team ID |
| `APNS_KEY_BASE64` | If iOS push | Base64 | **SECRET** - APNS key in base64 |
| `APNS_CERT_BASE64` | Alternative | Base64 | **SECRET** - APNS certificate (alternative to key) |

### Push Notifications - Android (FCM)

| Variable | Required | Format | Description |
|----------|----------|--------|-------------|
| `FCM_SERVICE_ACCOUNT_BASE64` | If Android push | Base64 JSON | **SECRET** - Firebase service account |
| `FCM_SERVER_KEY` | Legacy option | Server key | **SECRET** - FCM server key (deprecated) |

### Third-Party Integrations

| Variable | Required | Format | Description | Functions Using |
|----------|----------|--------|-------------|-----------------|
| `USDA_API_KEY` | If barcode lookup | API key | USDA FoodData Central API | `lookup-barcode/index.ts:11` |
| `INSTACART_API_KEY` | If Instacart integration | API key | **SECRET** - Instacart API | `src/lib/integrations/instacart.ts:427` |

### Utility Variables

| Variable | Required | Format | Description | Used In |
|----------|----------|--------|-------------|---------|
| `SITE_URL` | Optional | `https://eatpal.com` | Base site URL for emails/redirects | Various functions |
| `CRON_SECRET` | Optional | Random string | **SECRET** - Auth token for cron jobs | `send-emails/index.ts:110` |
| `ALLOWED_ORIGINS` | Optional | Comma-separated URLs | CORS allowed origins | Edge function CORS |
| `PORT` | Optional | `8000` | Local edge function server port | `edge-functions-template/server.ts:15` |
| `PUSH_DEBUG` | Optional | `true` or `false` | Enable push notification debugging | `PUSH_NOTIFICATION_CERTS.md:634` |

---

## Configuration by Environment

### Local Development (`.env` file)

```bash
# === REQUIRED ===
VITE_SUPABASE_URL=https://api.tryeatpal.com
VITE_SUPABASE_ANON_KEY=your-anon-key-here

# === OPTIONAL (but recommended) ===
VITE_FUNCTIONS_URL=https://functions.tryeatpal.com
VITE_SENTRY_DSN=
VITE_SENTRY_ENABLED=false

# === PAYMENTS (if using Stripe) ===
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_xxx

# === ANALYTICS (if using GA4) ===
VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX

# === EMAIL (if using notifications) ===
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_xxx
```

### Cloudflare Pages (Production)

Set these in Cloudflare Dashboard → Pages → Your Project → Settings → Environment variables:

**For both Production and Preview:**
```
VITE_SUPABASE_URL = https://api.tryeatpal.com
VITE_SUPABASE_ANON_KEY = [your-key]
VITE_FUNCTIONS_URL = https://functions.tryeatpal.com
```

**Production only:**
```
VITE_SENTRY_DSN = [your-dsn]
VITE_SENTRY_ENABLED = true
VITE_STRIPE_PUBLISHABLE_KEY = pk_live_xxx
VITE_GA_MEASUREMENT_ID = G-XXXXXXXXXX
```

### GitHub Actions (CI/CD)

Set in Repository Settings → Secrets:

```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_FUNCTIONS_URL
SENTRY_ORG
SENTRY_PROJECT
SENTRY_AUTH_TOKEN
```

### Supabase Edge Functions

Set in Supabase Dashboard → Project → Settings → Edge Functions → Secrets:

**Core (Required):**
```
SUPABASE_URL = https://api.tryeatpal.com
SUPABASE_SERVICE_ROLE_KEY = [your-service-role-key]  # NEVER EXPOSE
```

**Payments:**
```
STRIPE_SECRET_KEY = sk_live_xxx  # NEVER EXPOSE
STRIPE_WEBHOOK_SECRET = whsec_xxx  # NEVER EXPOSE
```

**Google APIs:**
```
GOOGLE_CLIENT_ID = [client-id]
GOOGLE_CLIENT_SECRET = [secret]  # NEVER EXPOSE
GOOGLE_REDIRECT_URI = https://your-domain.com/oauth/callback
PAGESPEED_INSIGHTS_API_KEY = [api-key]
```

**AI Services:**
```
ANTHROPIC_API_KEY = sk-ant-xxx  # NEVER EXPOSE
OPENAI_API_KEY = sk-xxx  # NEVER EXPOSE
```

**Email:**
```
EMAIL_PROVIDER = resend
RESEND_API_KEY = re_xxx  # NEVER EXPOSE
EMAIL_FROM = noreply@eatpal.com
```

---

## Variable Details by Feature

### Feature: Core App Functionality

| What | Frontend | Edge Function |
|------|----------|---------------|
| Database connection | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| Edge functions | `VITE_FUNCTIONS_URL` | N/A |

### Feature: User Authentication

| What | Frontend | Edge Function |
|------|----------|---------------|
| Auth (built into Supabase) | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |

### Feature: Stripe Payments

| What | Frontend | Edge Function |
|------|----------|---------------|
| Payment form | `VITE_STRIPE_PUBLISHABLE_KEY` | N/A |
| Checkout session | N/A | `STRIPE_SECRET_KEY`, `SUPABASE_*` |
| Subscription management | N/A | `STRIPE_SECRET_KEY`, `SUPABASE_*` |
| Webhook handling | N/A | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SUPABASE_*` |
| Invoices | N/A | `STRIPE_SECRET_KEY`, `SUPABASE_*`, `SITE_URL` |

### Feature: Error Monitoring (Sentry)

| What | Frontend | Build |
|------|----------|-------|
| Error tracking | `VITE_SENTRY_DSN`, `VITE_SENTRY_ENABLED` | N/A |
| Source maps upload | N/A | `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` |

### Feature: Google Search Console Integration

| What | Frontend | Edge Function |
|------|----------|---------------|
| OAuth initiation | `VITE_GOOGLE_CLIENT_ID` | N/A |
| Token exchange | N/A | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `SUPABASE_*` |
| Data fetching | N/A | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SUPABASE_*` |
| Core Web Vitals | N/A | `PAGESPEED_INSIGHTS_API_KEY`, `GOOGLE_*`, `SUPABASE_*` |

### Feature: AI-Powered Features

| What | Edge Function Variables |
|------|------------------------|
| Meal suggestions | `ANTHROPIC_API_KEY`, `SUPABASE_*` |
| Support ticket analysis | `OPENAI_API_KEY`, `SUPABASE_*` |
| Food similarity | `LOVABLE_API_KEY`, `SUPABASE_*` |
| Recipe parsing | `LOVABLE_API_KEY`, `SUPABASE_*` |
| Blog content generation | Dynamic `api_key_env_var` from DB, `SUPABASE_*` |

### Feature: Email Notifications

| What | Edge Function Variables |
|------|------------------------|
| Transactional emails | `EMAIL_PROVIDER`, `RESEND_API_KEY`, `EMAIL_FROM`, `SUPABASE_*` |
| Scheduled emails | `CRON_SECRET` (for auth), above + `SUPABASE_*` |

### Feature: Push Notifications

| What | Edge Function Variables |
|------|------------------------|
| iOS (APNS) | `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_KEY_BASE64` (or `APNS_CERT_BASE64`) |
| Android (FCM) | `FCM_SERVICE_ACCOUNT_BASE64` (or legacy `FCM_SERVER_KEY`) |
| Debug | `PUSH_DEBUG` |

### Feature: SEO Tools

| What | Edge Function Variables |
|------|------------------------|
| Backlink tracking (Ahrefs) | `AHREFS_API_KEY`, `SUPABASE_*` |
| Backlink tracking (Moz) | `MOZ_ACCESS_ID`, `MOZ_SECRET_KEY`, `SUPABASE_*` |
| SERP tracking (SerpAPI) | `SERPAPI_KEY`, `SUPABASE_*` |
| SERP tracking (DataForSEO) | `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD`, `SUPABASE_*` |

---

## Security Notes

### Variables Marked as SECRET

These should **NEVER** be:
- Exposed in frontend code
- Committed to git
- Shared in public channels
- Logged in error messages

| Variable | Why It's Sensitive |
|----------|-------------------|
| `SUPABASE_SERVICE_ROLE_KEY` | Bypasses all RLS policies |
| `STRIPE_SECRET_KEY` | Can charge cards, access all customer data |
| `STRIPE_WEBHOOK_SECRET` | Could forge webhook events |
| `GOOGLE_CLIENT_SECRET` | Could impersonate OAuth app |
| `ANTHROPIC_API_KEY` | Could run up AI costs |
| `OPENAI_API_KEY` | Could run up AI costs |
| `*_API_KEY` (most) | Could access paid services |

### Safe to Expose (Public)

| Variable | Why It's Safe |
|----------|---------------|
| `VITE_SUPABASE_URL` | Just an endpoint URL |
| `VITE_SUPABASE_ANON_KEY` | RLS policies protect data |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Designed for frontend use |
| `VITE_GOOGLE_CLIENT_ID` | OAuth client IDs are public |
| `VITE_SENTRY_DSN` | Can only send errors to your project |
| `VITE_GA_MEASUREMENT_ID` | Already visible in page source |

---

## Troubleshooting

### "SUPABASE_URL is not defined"
- **Frontend**: Check `VITE_SUPABASE_URL` is in `.env` file
- **Edge Function**: Check secret is set in Supabase Dashboard

### "Stripe key is invalid"
- Verify you're using the correct key type:
  - `pk_test_` / `sk_test_` for development
  - `pk_live_` / `sk_live_` for production
- Check key is for the correct Stripe account

### "OAuth redirect_uri mismatch"
- Ensure `GOOGLE_REDIRECT_URI` exactly matches what's configured in Google Cloud Console
- Check for trailing slashes

### Build fails with "SENTRY_AUTH_TOKEN"
- Set the token in GitHub Actions secrets, not in `.env`
- Generate a new token if expired at sentry.io

---

## Summary Statistics

| Category | Count |
|----------|-------|
| **Frontend Variables (VITE_)** | 13 |
| **Build Process Variables** | 5 |
| **Supabase Edge Function Variables** | 40+ |
| **Required for Basic Functionality** | 4 |
| **Feature-Conditional** | 25+ |
| **Optional** | 30+ |

---

*This document should be updated whenever new environment variables are added to the codebase.*
