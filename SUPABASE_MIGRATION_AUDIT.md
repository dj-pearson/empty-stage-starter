# Supabase Migration & Data Integrity Audit Report

**Generated**: December 20, 2025
**Objective**: Ensure all connections route to self-hosted Supabase and all features use real database data

---

## Executive Summary

This audit identified **47+ issues** across the codebase that need remediation before the application is fully operational with the self-hosted Supabase setup. Issues are categorized by severity:

| Priority | Count | Description |
|----------|-------|-------------|
| CRITICAL | 8 | Connection/routing issues, missing database tables |
| HIGH | 12 | Mock data in production components |
| MEDIUM | 15 | Stubbed functionality, TODOs |
| LOW | 12+ | Documentation references to old URLs |

---

## Table of Contents

1. [Connection Configuration Status](#1-connection-configuration-status)
2. [Old Cloud Supabase References](#2-old-cloud-supabase-references)
3. [Missing Database Tables](#3-missing-database-tables)
4. [Mock/Hardcoded Data](#4-mockhardcoded-data)
5. [Stubbed Functionality](#5-stubbed-functionality)
6. [Edge Functions Routing](#6-edge-functions-routing)
7. [CI/CD Configuration](#7-cicd-configuration)
8. [Remediation Checklist](#8-remediation-checklist)

---

## 1. Connection Configuration Status

### ✅ Correctly Configured

| File | Status | Notes |
|------|--------|-------|
| `src/integrations/supabase/client.ts` | ✅ OK | Uses `import.meta.env.VITE_SUPABASE_URL` |
| `wrangler.toml` | ✅ OK | Points to `https://api.tryeatpal.com` |
| `src/lib/edge-functions.ts` | ✅ OK | Uses `VITE_FUNCTIONS_URL` with fallback |
| `functions/sitemap.xml.ts` | ✅ OK | Defaults to `https://api.tryeatpal.com` |
| `index.html` | ✅ OK | Preconnect to `https://api.tryeatpal.com` |
| `public/_headers` | ✅ OK | CSP includes both new domains |
| `supabase/functions/common/headers.ts` | ✅ OK | CSP includes self-hosted domains |

### Environment Variables Required

```bash
# Self-hosted Supabase (Production)
VITE_SUPABASE_URL=https://api.tryeatpal.com
VITE_SUPABASE_ANON_KEY=<your-anon-key>
VITE_FUNCTIONS_URL=https://functions.tryeatpal.com

# For Edge Functions (Coolify deployment)
SUPABASE_URL=https://api.tryeatpal.com
SUPABASE_ANON_KEY=<your-anon-key>
```

---

## 2. Old Cloud Supabase References

### ❌ Needs Update (Source Code)

| File | Line | Issue | Action |
|------|------|-------|--------|
| `.github/workflows/ci.yml` | 150, 325, 373, 426, 475 | Uses `https://placeholder.supabase.co` | Update to use secrets |
| `test-stripe-webhook.sh` | 14 | Uses `nfabsryzwuobqpdzfzbf.supabase.co` | Update to `functions.tryeatpal.com` |

### ⚠️ Documentation Only (Low Priority)

These files contain old URLs but are documentation-only and don't affect production:

| File | Notes |
|------|-------|
| `SECURITY_AUDIT_REPORT.md` | Historical reference |
| `CODE_REVIEW_FINDINGS.md` | Historical reference |
| `SELF_HOSTED_SUPABASE_MIGRATION.md` | Migration documentation |
| `test-subscription-flow.md` | Old testing instructions |
| `LAUNCH_CHECKLIST.md` | Old dashboard reference |
| `SECURITY_CREDENTIALS_ROTATION_REQUIRED.md` | Old credential reference |
| `supabase/config.toml` | Commented out old project_id |
| Various guide files (`*_GUIDE.md`) | Example/template URLs |

---

## 3. Missing Database Tables

### ❌ CRITICAL - Tables Not In Generated Types

These admin components use `@ts-nocheck` or `@ts-ignore` because the database tables don't exist:

| Component | Missing Table(s) | Impact |
|-----------|-----------------|--------|
| `src/components/admin/AlertManager.tsx` | `admin_alerts` | Admin alerts won't work |
| `src/components/admin/SystemHealthDashboard.tsx` | `admin_system_health` | System monitoring broken |
| `src/components/admin/QuizAnalyticsDashboard.tsx` | `quiz_responses` | Quiz analytics unavailable |
| `src/components/admin/TicketQueue.tsx` | Admin ticket tables | Support ticketing broken |
| `src/components/admin/RevenueOperationsCenter.tsx` | `revenue_metrics_daily`, `revenue_churn_predictions`, `revenue_interventions`, `revenue_cohort_retention` | Revenue dashboard broken |
| `src/components/admin/SubscriptionManagement.tsx` | Admin subscription tables | Admin subscription management broken |
| `src/components/admin/SupportPerformanceDashboard.tsx` | Support metrics tables | Support metrics unavailable |
| `src/components/admin/SocialMediaManager.tsx` | Social media tables | Social management broken |
| `src/components/admin/SEOResultsDisplay.tsx` | SEO results tables | SEO display broken |
| `src/components/admin/AITicketAnalysis.tsx` | AI ticket tables | AI analysis unavailable |
| `src/components/admin/FeatureFlagDashboard.tsx` | Feature flag tables | Feature flags broken |
| `src/components/admin/NutritionImportDialog.tsx` | Nutrition import tables | Import feature broken |
| `src/components/admin/ContentOptimizer.tsx` | Content optimization tables | Content optimization broken |
| `src/components/admin/LiveActivityFeed.tsx` | Activity feed tables | Live feed broken |
| `src/components/admin/PromotionalCampaignManager.tsx` | Campaign tables | Promotions broken |
| `src/components/admin/ReferralProgramManager.tsx` | Referral tables | Referral program broken |
| `src/components/admin/BlogCMSManager.tsx` | Blog CMS tables | Blog management broken |
| `src/components/admin/SEOManager.tsx` | SEO management tables | SEO management broken |

### ❌ CRITICAL - Email Automation Tables Missing

| File | Missing Table | Impact |
|------|---------------|--------|
| `src/lib/email-automation.ts` (lines 77-96) | `user_email_sequences` | Email sequences don't work |
| `src/lib/trial-automation.ts` (lines 273-274) | `user_email_sequences` | Trial emails don't work |

**Current Behavior**: Returns `{ success: false, error: 'Feature not available - table does not exist' }`

### ❌ HIGH - LocalStorage Fallback (Data Loss Risk)

These components fall back to localStorage when database tables don't exist:

| Component | Affected Tables | Risk |
|-----------|----------------|------|
| `src/components/admin/CRMIntegration.tsx` (lines 208-214, 234-239) | `crm_connections`, `crm_sync_logs` | CRM data only in browser |
| `src/components/admin/WorkflowBuilder.tsx` (lines 196-205) | `automation_workflows` | Workflows only in browser |

---

## 4. Mock/Hardcoded Data

### ❌ HIGH - Admin Components Using Mock Data

| Component | Lines | Mock Data Description |
|-----------|-------|----------------------|
| `src/components/admin/MultiRegionBackup.tsx` | 186-311 | 3 fake regions, 2 fake policies, 3 fake backup jobs |
| `src/components/admin/AdminIntegrationManager.tsx` | 149-166 | Mock integration metrics (Instacart, MealMe) |
| `src/components/admin/SEOManager.tsx` | 260-267 | Fallback mock keywords if DB empty |
| `src/components/admin/EmailAnalyticsDashboard.tsx` | 328 | Simulated device metrics |
| `src/components/admin/SEOManager.tsx` | 1190 | Simulated page load time |

### ❌ MEDIUM - Page Components with Static Data

| Component | Lines | Description |
|-----------|-------|-------------|
| `src/pages/Authors.tsx` | 32-86 | 3 hardcoded fake authors with fake credentials |
| `src/pages/FAQ.tsx` | 14+ | Hardcoded FAQ data (may be intentional) |
| `src/pages/Landing.tsx` | 140, 182 | Hardcoded features and FAQs |

### ❌ HIGH - External Integration Stubs

| File | Lines | Issue |
|------|-------|-------|
| `src/lib/integrations/instacart.ts` | 103-118 | Returns mock products: `id: mock_${Date.now()}` |
| `src/lib/domain-verification.ts` | 71-99 | Simulated DNS verification |

---

## 5. Stubbed Functionality

### ❌ HIGH - Functions That Don't Work

| File | Function | Issue |
|------|----------|-------|
| `src/lib/url-utils.ts` (648-654) | `shortenUrl()` | Placeholder - returns original URL |
| `src/lib/oauth-token-rotation.ts` (337, 346) | `encryptToken()`, `decryptToken()` | Uses base64, not real encryption |
| `src/lib/api-errors.ts` (389) | `logError()` | TODO: integrate error tracking |
| `src/lib/quiz/recommendations.ts` (330-349) | `getSampleMeals()` | Hardcoded sample meals |

### ❌ MEDIUM - "Coming Soon" Features

| Component | Feature |
|-----------|---------|
| `src/pages/SearchTrafficDashboard.tsx` (130) | Export to CSV/PDF |
| `src/components/CollaborativeShoppingMode.tsx` (270) | Multi-user shopping |
| `src/components/admin/RevenueOperationsCenter.tsx` (585) | Revenue forecasting |
| `src/components/admin/SocialMediaManager.tsx` (691) | Calendar view |

### ❌ LOW - Simulated Features

| Component | Lines | Feature |
|-----------|-------|---------|
| `src/components/admin/CRMIntegration.tsx` | 319, 378 | Connection validation, sync process |
| `src/components/admin/AdminIntegrationManager.tsx` | 228 | Integration testing |

---

## 6. Edge Functions Routing

### ✅ Correctly Configured

The Edge Functions helper (`src/lib/edge-functions.ts`) correctly routes to `functions.tryeatpal.com`:

```typescript
function getEdgeFunctionsUrl(): string {
  const functionsUrl = import.meta.env.VITE_FUNCTIONS_URL;
  if (!functionsUrl) {
    // Fallback: derive from SUPABASE_URL
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    if (supabaseUrl) {
      return supabaseUrl.replace('api.', 'functions.');
    }
  }
  return functionsUrl;
}
```

### Components Using Edge Functions

| Component | Function Called |
|-----------|-----------------|
| `src/components/SaveMealPlanTemplateDialog.tsx` | Uses derived functions URL |
| Various admin components | Use `invokeEdgeFunction()` helper |

---

## 7. CI/CD Configuration

### ❌ Needs Update

**File**: `.github/workflows/ci.yml`

**Issue**: Uses placeholder URLs instead of GitHub secrets

```yaml
# Current (Lines 150-151, 325-326, etc.)
VITE_SUPABASE_URL: https://placeholder.supabase.co
VITE_SUPABASE_ANON_KEY: placeholder-key

# Should be:
VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
```

**Impact**: CI builds don't test against real Supabase, may miss issues

---

## 8. Remediation Checklist

### Phase 1: Critical Connection Issues

- [ ] **CI/CD**: Update `.github/workflows/ci.yml` to use GitHub secrets
- [ ] **Test Scripts**: Update `test-stripe-webhook.sh` to use `functions.tryeatpal.com`

### Phase 2: Database Tables (Priority Order)

- [ ] Create migration for `user_email_sequences` table
- [ ] Create migration for `admin_alerts` table
- [ ] Create migration for `admin_system_health` table
- [ ] Create migration for `quiz_responses` table (if not exists)
- [ ] Create migration for `crm_connections` table
- [ ] Create migration for `crm_sync_logs` table
- [ ] Create migration for `automation_workflows` table
- [ ] Create migrations for revenue tables:
  - [ ] `revenue_metrics_daily`
  - [ ] `revenue_churn_predictions`
  - [ ] `revenue_interventions`
  - [ ] `revenue_cohort_retention`
- [ ] Regenerate types: `supabase gen types typescript --local`

### Phase 3: Remove Mock Data

- [ ] `src/components/admin/MultiRegionBackup.tsx`: Connect to real backup service
- [ ] `src/components/admin/AdminIntegrationManager.tsx`: Fetch real metrics
- [ ] `src/components/admin/SEOManager.tsx`: Remove mock keyword fallback
- [ ] `src/pages/Authors.tsx`: Fetch authors from database
- [ ] `src/lib/integrations/instacart.ts`: Implement real API integration

### Phase 4: Implement Stubbed Features

- [ ] `src/lib/oauth-token-rotation.ts`: Implement real encryption
- [ ] `src/lib/url-utils.ts`: Implement URL shortening or remove
- [ ] `src/lib/api-errors.ts`: Integrate Sentry (already configured)
- [ ] `src/lib/domain-verification.ts`: Implement real DNS verification

### Phase 5: Remove LocalStorage Fallbacks

- [ ] `src/components/admin/CRMIntegration.tsx`: Use database only
- [ ] `src/components/admin/WorkflowBuilder.tsx`: Use database only

### Phase 6: Documentation Cleanup (Low Priority)

- [ ] Update old URLs in documentation files (optional, for consistency)

---

## Verification Steps

After completing remediation:

1. **Test Database Connections**:
   ```bash
   curl https://api.tryeatpal.com/rest/v1/ -H "apikey: YOUR_ANON_KEY"
   ```

2. **Test Edge Functions**:
   ```bash
   curl https://functions.tryeatpal.com/_health
   ```

3. **Test Auth Flow**:
   - Sign up new user
   - Verify email confirmation
   - Sign in

4. **Test Core Features**:
   - Add a food item
   - Create a recipe
   - Generate a meal plan
   - Add items to grocery list

5. **Test Admin Panel**:
   - View dashboard metrics
   - Check all admin components load without errors

---

## Notes

- The main Supabase client (`src/integrations/supabase/client.ts`) is correctly configured
- Edge Functions routing via `src/lib/edge-functions.ts` is correctly configured
- CSP headers in `public/_headers` include both `api.tryeatpal.com` and `functions.tryeatpal.com`
- Most documentation files with old URLs are historical references and don't affect production
