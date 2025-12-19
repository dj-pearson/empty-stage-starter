# Self-Hosted Supabase Migration Guide

> **Last Updated**: 2025-12-18
> **Status**: Migration Complete - Review Required

## Overview

This document tracks the migration from cloud-based Supabase (`*.supabase.co`) to self-hosted Supabase with the following endpoints:

- **API (PostgREST/Auth/Storage/Kong)**: `https://api.tryeatpal.com`
- **Edge Functions**: `https://functions.tryeatpal.com`

---

## Environment Variables Reference

### Frontend Environment Variables (VITE_*)

These variables are used in the frontend (React/Vite) application:

| Variable | Description | Example Value | Required |
|----------|-------------|---------------|----------|
| `VITE_SUPABASE_URL` | Self-hosted Supabase API URL | `https://api.tryeatpal.com` | Yes |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous/public key | `eyJ...` (JWT token) | Yes |
| `VITE_FUNCTIONS_URL` | Edge Functions URL | `https://functions.tryeatpal.com` | Yes |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key | `pk_live_...` | For payments |
| `VITE_SENTRY_DSN` | Sentry error tracking DSN | `https://...@sentry.io/...` | For monitoring |
| `VITE_SENTRY_ENABLED` | Enable Sentry in dev | `true`/`false` | No |
| `VITE_APP_VERSION` | App version for Sentry | `1.0.0` | No |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth client ID | `...apps.googleusercontent.com` | For GSC |
| `VITE_BING_CLIENT_ID` | Microsoft OAuth client ID | `...` | For Bing Webmaster |

### Edge Functions Environment Variables (Deno.env)

These variables must be set in your Edge Functions runtime (Coolify/Supabase dashboard):

#### Core Supabase
| Variable | Description | Required |
|----------|-------------|----------|
| `SUPABASE_URL` | API endpoint | Yes |
| `SUPABASE_ANON_KEY` | Anonymous key | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (admin access) | Yes |

#### AI/ML Services
| Variable | Description | Required |
|----------|-------------|----------|
| `ANTHROPIC_API_KEY` | Claude API key | For AI meal suggestions |
| `OPENAI_API_KEY` | OpenAI API key | For support ticket analysis |
| `LOVABLE_API_KEY` | Lovable AI API key | For food image identification |

#### Payment Processing
| Variable | Description | Required |
|----------|-------------|----------|
| `STRIPE_SECRET_KEY` | Stripe secret key | For payments |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret | For webhooks |

#### Email Services
| Variable | Description | Required |
|----------|-------------|----------|
| `EMAIL_PROVIDER` | Email provider (`resend`/`console`) | For emails |
| `RESEND_API_KEY` | Resend API key | If using Resend |
| `RESEND_API` | Resend API endpoint | If using Resend |
| `EMAIL_FROM` | From email address | `noreply@eatpal.com` |

#### Google Services
| Variable | Description | Required |
|----------|-------------|----------|
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | For GSC/GA4 |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | For GSC/GA4 |
| `GOOGLE_REDIRECT_URI` | OAuth callback URL | For GSC/GA4 |
| `PAGESPEED_INSIGHTS_API_KEY` | PageSpeed Insights API | For Core Web Vitals |

#### Microsoft Services
| Variable | Description | Required |
|----------|-------------|----------|
| `MICROSOFT_CLIENT_ID` | Microsoft OAuth client ID | For Bing Webmaster |
| `MICROSOFT_CLIENT_SECRET` | Microsoft OAuth client secret | For Bing Webmaster |
| `MICROSOFT_REDIRECT_URI` | OAuth callback URL | For Bing Webmaster |

#### Yandex Services
| Variable | Description | Required |
|----------|-------------|----------|
| `YANDEX_CLIENT_ID` | Yandex OAuth client ID | For Yandex Webmaster |
| `YANDEX_CLIENT_SECRET` | Yandex OAuth client secret | For Yandex Webmaster |
| `YANDEX_REDIRECT_URI` | OAuth callback URL | For Yandex Webmaster |

#### SEO/Analytics Services
| Variable | Description | Required |
|----------|-------------|----------|
| `SERPAPI_KEY` | SerpAPI key | For SERP tracking |
| `DATAFORSEO_LOGIN` | DataForSEO login | For SERP tracking |
| `DATAFORSEO_PASSWORD` | DataForSEO password | For SERP tracking |
| `AHREFS_API_KEY` | Ahrefs API key | For backlinks |
| `MOZ_ACCESS_ID` | Moz API access ID | For backlinks |
| `MOZ_SECRET_KEY` | Moz API secret key | For backlinks |

#### Push Notifications
| Variable | Description | Required |
|----------|-------------|----------|
| `APNS_KEY_ID` | Apple Push Notification key ID | For iOS |
| `APNS_TEAM_ID` | Apple Team ID | For iOS |
| `APNS_KEY_BASE64` | Apple push key (base64) | For iOS |
| `FCM_SERVICE_ACCOUNT_BASE64` | Firebase service account (base64) | For Android |
| `FCM_SERVER_KEY` | Firebase server key (legacy) | For Android |

#### Other Services
| Variable | Description | Required |
|----------|-------------|----------|
| `USDA_API_KEY` | USDA FoodData Central API | For barcode lookup |
| `CRON_SECRET` | Secret for cron job authentication | For scheduled tasks |
| `ALLOWED_ORIGINS` | Comma-separated allowed CORS origins | For security |
| `SITE_URL` | Production site URL | `https://eatpal.com` or `https://tryeatpal.com` |
| `APP_URL` | App URL for emails/notifications | Same as SITE_URL |
| `PORT` | Edge functions port | Usually `8000` |

#### Sentry (Build-time)
| Variable | Description | Required |
|----------|-------------|----------|
| `SENTRY_ORG` | Sentry organization | For sourcemaps |
| `SENTRY_PROJECT` | Sentry project | For sourcemaps |
| `SENTRY_AUTH_TOKEN` | Sentry auth token | For sourcemaps |

---

## Files Modified During Migration

### Critical Fixes Applied

#### 1. `functions/sitemap.xml.ts`
**Issue**: Hardcoded old supabase.co URL and anon key
**Fix**: Updated to use environment variables from Cloudflare context

```typescript
// Before (BROKEN)
const supabaseUrl = 'https://tbuszxkevkpjcjapbrir.supabase.co';
const supabaseAnonKey = 'eyJ...';

// After (FIXED)
const supabaseUrl = context.env.VITE_SUPABASE_URL || 'https://api.tryeatpal.com';
const supabaseAnonKey = context.env.VITE_SUPABASE_ANON_KEY || '';
const functionsUrl = context.env.VITE_FUNCTIONS_URL || supabaseUrl.replace('api.', 'functions.');
```

#### 2. Frontend Components Using Wrong Functions URL
**Issue**: Components were calling `VITE_SUPABASE_URL/functions/v1/...` instead of `VITE_FUNCTIONS_URL/...`
**Files Fixed**:
- `src/components/blog/ReadingProgress.tsx` (2 occurrences)
- `src/components/SaveMealPlanTemplateDialog.tsx`
- `src/components/MealPlanTemplateGallery.tsx`
- `src/components/ApplyTemplateDialog.tsx`

**Fix Pattern**:
```typescript
// Before (BROKEN - would route to api.tryeatpal.com/functions/v1/...)
const response = await fetch(
  `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-meal-plan-templates`,
  ...
);

// After (FIXED - routes to functions.tryeatpal.com/...)
const functionsUrl = import.meta.env.VITE_FUNCTIONS_URL ||
  (import.meta.env.VITE_SUPABASE_URL?.replace('api.', 'functions.') ?? '');
const response = await fetch(
  `${functionsUrl}/manage-meal-plan-templates`,
  ...
);
```

#### 3. CSP Headers Updated
**Issue**: Content Security Policy only allowed `*.supabase.co` domains
**Files Fixed**:
- `public/_headers`
- `supabase/functions/common/headers.ts`
- `coolify-migration/eatpal-functions-package/_shared/headers.ts`

**Changes**:
- Added `https://api.tryeatpal.com` to connect-src
- Added `https://functions.tryeatpal.com` to connect-src
- Added `wss://api.tryeatpal.com` for WebSocket realtime connections
- Added `https://*.tryeatpal.com` to script-src
- Kept `*.supabase.co` for backwards compatibility during migration

---

## Files Already Correctly Configured

These files were already properly configured for self-hosted Supabase:

| File | Status | Notes |
|------|--------|-------|
| `wrangler.toml` | OK | Correctly sets all VITE_* env vars for production/preview |
| `src/integrations/supabase/client.ts` | OK | Uses `import.meta.env.VITE_SUPABASE_URL` |
| `src/lib/edge-functions.ts` | OK | Has helper for deriving functions URL |
| `src/pages/Admin.tsx` | OK | Correctly derives functions URL with fallback |
| All `supabase/functions/*/index.ts` | OK | Use `Deno.env.get('SUPABASE_URL')` |

---

## Edge Functions Inventory

The project contains **79 Edge Functions** in `supabase/functions/`:

### SEO & Analytics
- `analyze-blog-posts-seo`, `analyze-blog-quality`, `analyze-content`
- `analyze-images`, `analyze-internal-links`, `analyze-semantic-keywords`
- `check-broken-links`, `check-core-web-vitals`, `check-keyword-positions`
- `check-mobile-first`, `check-security-headers`, `crawl-site`
- `detect-duplicate-content`, `detect-redirect-chains`
- `generate-schema-markup`, `generate-sitemap`, `generate-social-content`
- `monitor-performance-budget`, `optimize-page-content`
- `run-scheduled-audit`, `sync-analytics-data`, `sync-backlinks`
- `track-engagement`, `track-serp-positions`, `validate-structured-data`

### OAuth & Integrations
- `ga4-oauth`, `gsc-oauth`, `gsc-fetch-properties`, `gsc-fetch-core-web-vitals`, `gsc-sync-data`
- `bing-webmaster-oauth`, `yandex-webmaster-oauth`
- `oauth-token-refresh`

### User & Subscription Management
- `create-checkout`, `manage-subscription`, `manage-payment-methods`
- `stripe-webhook`, `generate-invoice`
- `list-users`, `update-user`, `user-intelligence`

### Content & Blog
- `generate-blog-content`, `manage-blog-titles`, `publish-scheduled-posts`
- `repurpose-content`, `update-blog-image`

### Meal Planning & Food
- `ai-meal-plan`, `generate-meal-suggestions`, `manage-meal-plan-templates`
- `suggest-recipe`, `suggest-recipes-from-pantry`, `suggest-foods`
- `calculate-food-similarity`, `identify-food-image`
- `lookup-barcode`, `enrich-barcodes`, `parse-recipe`, `parse-recipe-grocery`

### Notifications & Communication
- `send-emails`, `send-seo-notification`, `process-notification-queue`
- `process-email-sequences`, `register-push-token`, `schedule-meal-reminders`

### Reports & Scheduling
- `generate-weekly-report`, `schedule-weekly-reports`, `weekly-summary-generator`
- `backup-scheduler`, `backup-user-data`

### Support & Testing
- `analyze-support-ticket`, `test-ai-model`

### Other
- `apply-seo-fixes`, `join-waitlist`, `process-delivery-order`
- `_health` (health check endpoint)

---

## Remaining Items to Review

### Documentation Files with Old References
The following documentation files contain `supabase.co` references that are for documentation purposes only and don't need code changes:

- `CLAUDE.md` - Example code snippets
- `ADMIN_AUTOMATION_SETUP.md` - Setup instructions
- `CODE_REVIEW_FINDINGS.md` - Historical findings
- `DEPLOYMENT_CHECKLIST.md` - Checklist items
- `EDGE_FUNCTIONS.md` - Edge functions documentation
- `edge-functions-template/` - Template documentation

### Action Required: Update Documentation
These docs should be updated to reflect the new self-hosted URLs for consistency.

---

## Verification Checklist

Before going live, verify the following:

- [ ] All environment variables are set in Cloudflare Pages dashboard
- [ ] All environment variables are set in Coolify/Edge Functions runtime
- [ ] `ALLOWED_ORIGINS` includes `https://tryeatpal.com,https://www.tryeatpal.com`
- [ ] Test edge function calls from frontend work correctly
- [ ] Test real-time subscriptions (WebSocket) work with `wss://api.tryeatpal.com`
- [ ] Test authentication flow works
- [ ] Test Stripe webhooks work with new endpoint
- [ ] Test sitemap.xml generation works
- [ ] Test CSP headers don't block any resources (check browser console)
- [ ] Verify OAuth callbacks work for GSC/GA4/Bing/Yandex

---

## Quick Reference: URL Patterns

| Service | Old URL | New URL |
|---------|---------|---------|
| API (REST) | `https://xxx.supabase.co` | `https://api.tryeatpal.com` |
| Auth | `https://xxx.supabase.co/auth/v1` | `https://api.tryeatpal.com/auth/v1` |
| Storage | `https://xxx.supabase.co/storage/v1` | `https://api.tryeatpal.com/storage/v1` |
| Edge Functions | `https://xxx.supabase.co/functions/v1` | `https://functions.tryeatpal.com` |
| Realtime (WS) | `wss://xxx.supabase.co` | `wss://api.tryeatpal.com` |

---

## Support

If you encounter issues after migration:

1. Check browser console for CSP violations
2. Verify environment variables are correctly set
3. Check Edge Functions logs in Coolify dashboard
4. Verify CORS headers allow your domain
