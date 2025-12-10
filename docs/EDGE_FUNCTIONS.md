# Edge Functions Reference

> **Last Updated**: 2025-12-04
> **Total Functions**: 75
> **Runtime**: Deno (Supabase Edge Functions)

This document provides comprehensive documentation for all Supabase Edge Functions in the EatPal application.

---

## Table of Contents

1. [Overview](#overview)
2. [Shared Utilities](#shared-utilities)
3. [Function Categories](#function-categories)
   - [AI & Machine Learning](#ai--machine-learning)
   - [Authentication & Email](#authentication--email)
   - [Backup & Data Management](#backup--data-management)
   - [Content & Blog Management](#content--blog-management)
   - [Food & Recipe Services](#food--recipe-services)
   - [Payment & Subscription](#payment--subscription)
   - [SEO & Analytics](#seo--analytics)
   - [Notifications & Scheduling](#notifications--scheduling)
   - [OAuth Integrations](#oauth-integrations)
4. [Error Handling](#error-handling)
5. [Security Considerations](#security-considerations)
6. [Deployment](#deployment)

---

## Overview

All Edge Functions are located in `supabase/functions/` and follow a consistent pattern:

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders, securityHeaders } from "../_shared/headers.ts";

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Function logic here
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
```

---

## Shared Utilities

### `_shared/headers.ts`

Provides standardized headers for all Edge Functions:

| Export | Description | Use Case |
|--------|-------------|----------|
| `getCorsHeaders(req)` | Dynamic CORS with origin validation | All authenticated requests |
| `securityHeaders` | OWASP security headers | All responses |
| `cacheableHeaders(maxAge)` | Public cache headers | GET requests, static data |
| `privateCacheHeaders(maxAge)` | Private cache headers | User-specific data |
| `noCacheHeaders()` | No-store headers | Mutations, real-time data |
| `generateETag(data)` | ETag generation | Conditional requests |
| `CACHE_DURATIONS` | Standard cache times | Consistent caching |

**Cache Duration Constants:**
- `STATIC`: 3600s (1 hour) - Barcode lookups, food properties
- `SEMI_STATIC`: 900s (15 min) - Recipes, templates
- `STANDARD`: 300s (5 min) - Standard data
- `DYNAMIC`: 60s (1 min) - User-specific data
- `NONE`: 0s - Real-time, mutations

---

## Function Categories

### AI & Machine Learning

#### `ai-meal-plan`

**Purpose**: Generate personalized meal plans using AI based on child preferences and available foods.

**Method**: `POST`

**Request Body**:
```json
{
  "kid": {
    "id": "uuid",
    "name": "string",
    "age": "number",
    "allergens": ["string"],
    "favorite_foods": ["string"]
  },
  "foods": [{ "id": "uuid", "name": "string", "is_safe": "boolean", "quantity": "number" }],
  "recipes": [{ "id": "uuid", "name": "string", "food_ids": ["uuid"] }],
  "planHistory": [],
  "aiModel": {
    "endpoint_url": "string",
    "api_key_env_var": "string",
    "model_name": "string",
    "auth_type": "bearer | api_key",
    "temperature": "number",
    "max_tokens": "number"
  },
  "days": 7
}
```

**Response**:
```json
{
  "plan": [{
    "day": 1,
    "date": "YYYY-MM-DD",
    "meals": {
      "breakfast": "food_id",
      "lunch": "food_id",
      "dinner": "food_id",
      "snack1": "food_id",
      "snack2": "food_id",
      "try_bite": "food_id"
    }
  }]
}
```

**Environment Variables**: Dynamic based on `aiModel.api_key_env_var`

---

#### `generate-meal-suggestions`

**Purpose**: Generate AI-powered meal suggestions based on pantry items and preferences.

**Method**: `POST`

**Request Body**:
```json
{
  "userId": "uuid",
  "preferences": {
    "cuisineTypes": ["string"],
    "dietaryRestrictions": ["string"],
    "maxPrepTime": "number"
  }
}
```

---

#### `suggest-foods`

**Purpose**: Suggest foods based on user preferences and child's eating patterns.

**Method**: `POST`

---

#### `suggest-recipe`

**Purpose**: Suggest a single recipe based on available ingredients.

**Method**: `POST`

---

#### `suggest-recipes-from-pantry`

**Purpose**: Suggest multiple recipes that can be made with current pantry items.

**Method**: `POST`

---

#### `identify-food-image`

**Purpose**: Use AI vision to identify food from an uploaded image.

**Method**: `POST`

**Request Body**:
```json
{
  "imageData": "base64_encoded_image",
  "mimeType": "image/jpeg | image/png"
}
```

---

#### `calculate-food-similarity`

**Purpose**: Calculate similarity between foods for food chaining recommendations.

**Method**: `POST`

---

#### `test-ai-model`

**Purpose**: Test AI model configuration and connectivity.

**Method**: `POST`

---

### Authentication & Email

#### `send-auth-email`

**Purpose**: Send branded authentication emails (confirmation, password reset, magic link).

**Method**: `POST`

**Request Body**:
```json
{
  "email": "string",
  "type": "confirmation | password_reset | magic_link",
  "confirmationUrl": "string (optional)",
  "resetUrl": "string (optional)",
  "magicLinkUrl": "string (optional)",
  "userName": "string (optional)"
}
```

**Response**:
```json
{
  "success": true
}
```

---

#### `send-emails`

**Purpose**: General purpose email sending with templates.

**Method**: `POST`

**Environment Variables**:
- `RESEND_API_KEY`
- `EMAIL_FROM`

---

#### `list-users`

**Purpose**: Admin-only function to list all users (for admin dashboard).

**Method**: `GET`

**Authorization**: Requires admin role.

---

#### `update-user`

**Purpose**: Update user profile and settings.

**Method**: `POST`

---

### Backup & Data Management

#### `backup-user-data`

**Purpose**: Create user data backups (manual, daily, weekly, or export).

**Method**: `POST`

**Request Body**:
```json
{
  "userId": "uuid (optional, defaults to authenticated user)",
  "backupType": "daily | weekly | manual | export"
}
```

**Response**:
```json
{
  "success": true,
  "backup_id": "uuid",
  "file_path": "string",
  "original_size": "number",
  "compressed_size": "number",
  "compression_ratio": "string",
  "records": {
    "foods": "number",
    "recipes": "number",
    "plan_entries": "number"
  },
  "data": "base64_encoded_data (for manual/export only)"
}
```

**Security**: Only admins can backup other users' data.

---

#### `backup-scheduler`

**Purpose**: Scheduled function to trigger automated backups.

**Method**: `POST` (typically called by cron)

---

### Content & Blog Management

#### `generate-blog-content`

**Purpose**: Generate SEO-optimized blog content using AI.

**Method**: `POST`

---

#### `manage-blog-titles`

**Purpose**: CRUD operations for blog post titles and SEO metadata.

**Method**: `POST`

---

#### `update-blog-image`

**Purpose**: Update blog post featured images.

**Method**: `POST`

---

#### `test-blog-webhook`

**Purpose**: Test blog webhook integrations.

**Method**: `POST`

---

#### `publish-scheduled-posts`

**Purpose**: Publish blog posts that are scheduled.

**Method**: `POST` (cron triggered)

---

#### `repurpose-content`

**Purpose**: Repurpose existing content for different platforms.

**Method**: `POST`

---

#### `generate-social-content`

**Purpose**: Generate social media content from blog posts.

**Method**: `POST`

---

### Food & Recipe Services

#### `lookup-barcode`

**Purpose**: Look up food information by barcode (uses Open Food Facts).

**Method**: `POST`

**Request Body**:
```json
{
  "barcode": "string"
}
```

**Response**:
```json
{
  "found": true,
  "product": {
    "name": "string",
    "brand": "string",
    "nutrition_info": {},
    "allergens": ["string"],
    "image_url": "string"
  }
}
```

**Caching**: 1 hour (static data)

---

#### `enrich-barcodes`

**Purpose**: Batch enrich multiple barcode entries with nutrition data.

**Method**: `POST`

---

#### `parse-recipe`

**Purpose**: Parse recipe text/URL to extract structured recipe data.

**Method**: `POST`

---

#### `parse-recipe-grocery`

**Purpose**: Parse recipe ingredients into grocery list items.

**Method**: `POST`

---

#### `manage-meal-plan-templates`

**Purpose**: CRUD operations for reusable meal plan templates.

**Method**: `POST`

---

### Payment & Subscription

#### `create-checkout`

**Purpose**: Create Stripe Checkout session for subscription purchase.

**Method**: `POST`

**Request Body**:
```json
{
  "planId": "uuid",
  "billingCycle": "monthly | yearly"
}
```

**Response**:
```json
{
  "url": "https://checkout.stripe.com/..."
}
```

**Environment Variables**:
- `STRIPE_SECRET_KEY`

---

#### `stripe-webhook`

**Purpose**: Handle Stripe webhook events for subscription lifecycle.

**Method**: `POST`

**Handled Events**:
- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_succeeded`
- `invoice.payment_failed`

**Environment Variables**:
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

**Security**: Validates Stripe signature.

---

#### `manage-subscription`

**Purpose**: Manage existing subscriptions (cancel, pause, resume).

**Method**: `POST`

---

#### `manage-payment-methods`

**Purpose**: Add, update, or remove payment methods.

**Method**: `POST`

---

#### `generate-invoice`

**Purpose**: Generate PDF invoices for payments.

**Method**: `POST`

---

### SEO & Analytics

#### `seo-audit`

**Purpose**: Run comprehensive SEO audit on pages.

**Method**: `POST`

---

#### `analyze-blog-posts-seo`

**Purpose**: Analyze blog posts for SEO optimization opportunities.

**Method**: `POST`

---

#### `analyze-blog-quality`

**Purpose**: Analyze content quality metrics for blog posts.

**Method**: `POST`

---

#### `analyze-content`

**Purpose**: General content analysis for SEO.

**Method**: `POST`

---

#### `analyze-images`

**Purpose**: Analyze image optimization (alt text, file size, format).

**Method**: `POST`

---

#### `analyze-internal-links`

**Purpose**: Analyze internal linking structure.

**Method**: `POST`

---

#### `analyze-semantic-keywords`

**Purpose**: Analyze semantic keyword usage and opportunities.

**Method**: `POST`

---

#### `apply-seo-fixes`

**Purpose**: Automatically apply SEO fixes.

**Method**: `POST`

---

#### `check-broken-links`

**Purpose**: Crawl and identify broken links.

**Method**: `POST`

---

#### `check-core-web-vitals`

**Purpose**: Check Core Web Vitals metrics.

**Method**: `POST`

**Environment Variables**:
- `PAGESPEED_INSIGHTS_API_KEY`

---

#### `check-keyword-positions`

**Purpose**: Track keyword ranking positions.

**Method**: `POST`

---

#### `check-mobile-first`

**Purpose**: Check mobile-first indexing readiness.

**Method**: `POST`

---

#### `check-security-headers`

**Purpose**: Audit security headers implementation.

**Method**: `POST`

---

#### `crawl-site`

**Purpose**: Crawl website for SEO analysis.

**Method**: `POST`

---

#### `detect-duplicate-content`

**Purpose**: Detect duplicate content issues.

**Method**: `POST`

---

#### `detect-redirect-chains`

**Purpose**: Identify redirect chains.

**Method**: `POST`

---

#### `generate-schema-markup`

**Purpose**: Generate JSON-LD structured data.

**Method**: `POST`

---

#### `generate-sitemap`

**Purpose**: Generate XML sitemap.

**Method**: `POST`

---

#### `optimize-page-content`

**Purpose**: Suggest page content optimizations.

**Method**: `POST`

---

#### `monitor-performance-budget`

**Purpose**: Monitor performance against budget thresholds.

**Method**: `POST`

---

#### `run-scheduled-audit`

**Purpose**: Run scheduled SEO audits.

**Method**: `POST` (cron triggered)

---

#### `send-seo-notification`

**Purpose**: Send SEO-related notifications.

**Method**: `POST`

---

#### `sync-analytics-data`

**Purpose**: Sync analytics data from external sources.

**Method**: `POST`

---

#### `sync-backlinks`

**Purpose**: Sync backlink data from Ahrefs/Moz.

**Method**: `POST`

**Environment Variables**:
- `AHREFS_API_KEY` or `MOZ_ACCESS_ID` + `MOZ_SECRET_KEY`

---

#### `track-engagement`

**Purpose**: Track user engagement metrics.

**Method**: `POST`

---

#### `track-serp-positions`

**Purpose**: Track search engine results page positions.

**Method**: `POST`

---

#### `validate-structured-data`

**Purpose**: Validate JSON-LD structured data.

**Method**: `POST`

---

### Notifications & Scheduling

#### `register-push-token`

**Purpose**: Register device push notification tokens.

**Method**: `POST`

**Request Body**:
```json
{
  "token": "string",
  "platform": "ios | android | web"
}
```

---

#### `process-notification-queue`

**Purpose**: Process queued push notifications.

**Method**: `POST` (cron triggered)

---

#### `schedule-meal-reminders`

**Purpose**: Schedule meal reminder notifications.

**Method**: `POST`

---

#### `schedule-weekly-reports`

**Purpose**: Schedule weekly report generation.

**Method**: `POST`

---

#### `generate-weekly-report`

**Purpose**: Generate weekly nutrition/progress report.

**Method**: `POST`

---

#### `weekly-summary-generator`

**Purpose**: Generate weekly meal summary.

**Method**: `POST`

---

#### `process-email-sequences`

**Purpose**: Process automated email sequences.

**Method**: `POST` (cron triggered)

---

### OAuth Integrations

#### `gsc-oauth`

**Purpose**: Google Search Console OAuth flow.

**Method**: `GET` / `POST`

**Environment Variables**:
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`

---

#### `gsc-fetch-properties`

**Purpose**: Fetch Google Search Console properties.

**Method**: `POST`

---

#### `gsc-fetch-core-web-vitals`

**Purpose**: Fetch Core Web Vitals from GSC.

**Method**: `POST`

---

#### `gsc-sync-data`

**Purpose**: Sync data from Google Search Console.

**Method**: `POST`

---

#### `ga4-oauth`

**Purpose**: Google Analytics 4 OAuth flow.

**Method**: `GET` / `POST`

---

#### `bing-webmaster-oauth`

**Purpose**: Bing Webmaster Tools OAuth flow.

**Method**: `GET` / `POST`

---

#### `yandex-webmaster-oauth`

**Purpose**: Yandex Webmaster OAuth flow.

**Method**: `GET` / `POST`

---

### Other Services

#### `join-waitlist`

**Purpose**: Add user to product waitlist.

**Method**: `POST`

---

#### `analyze-support-ticket`

**Purpose**: AI-analyze support tickets for categorization.

**Method**: `POST`

---

#### `process-delivery-order`

**Purpose**: Process grocery delivery orders.

**Method**: `POST`

---

#### `user-intelligence`

**Purpose**: Gather user intelligence for personalization.

**Method**: `POST`

---

## Error Handling

All functions follow a consistent error response format:

```json
{
  "error": "Human-readable error message",
  "details": "Optional additional information"
}
```

**HTTP Status Codes**:
- `200`: Success
- `400`: Bad Request (validation error)
- `401`: Unauthorized
- `403`: Forbidden (insufficient permissions)
- `404`: Not Found
- `429`: Rate Limited
- `500`: Internal Server Error

---

## Security Considerations

### Authentication
- Most functions require `Authorization: Bearer <token>` header
- Tokens are validated using `supabase.auth.getUser(token)`
- Admin-only functions check `user_roles` table

### Input Validation
- All inputs should be validated before processing
- Use Zod or similar for schema validation

### Secrets Management
- All API keys stored in Supabase Edge Function secrets
- Access via `Deno.env.get("KEY_NAME")`
- Never log or expose secrets

### CORS
- Use `getCorsHeaders(req)` for origin validation
- Configure `ALLOWED_ORIGINS` environment variable

### Rate Limiting
- External API calls should implement rate limiting
- Return 429 with retry-after header when rate limited

---

## Deployment

### Deploy Single Function
```bash
supabase functions deploy function-name
```

### Deploy All Functions
```bash
supabase functions deploy
```

### Set Secrets
```bash
supabase secrets set KEY_NAME=value
```

### View Logs
```bash
supabase functions logs function-name
```

### Local Development
```bash
supabase functions serve function-name --env-file .env.local
```

---

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_ANON_KEY` | Yes | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key |
| `STRIPE_SECRET_KEY` | For payments | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | For payments | Stripe webhook signing secret |
| `RESEND_API_KEY` | For emails | Resend email API key |
| `EMAIL_FROM` | For emails | From email address |
| `PAGESPEED_INSIGHTS_API_KEY` | For SEO | Google PageSpeed API key |
| `GOOGLE_CLIENT_ID` | For GSC OAuth | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | For GSC OAuth | Google OAuth client secret |
| `AHREFS_API_KEY` | For backlinks | Ahrefs API key |
| `MOZ_ACCESS_ID` | For backlinks | Moz access ID |
| `MOZ_SECRET_KEY` | For backlinks | Moz secret key |
| `ALLOWED_ORIGINS` | Recommended | Comma-separated allowed origins |

---

**Document Version**: 1.0.0
**Maintained by**: Development Team
