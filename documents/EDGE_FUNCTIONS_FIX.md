# Edge Functions 503 Error - FIXED ✅

## Problem

Your admin panel was showing 503 errors for Edge Functions:
```
POST https://api.tryeatpal.com/functions/v1/list-users 503 (Service Unavailable)
```

## Root Cause

The Supabase client's `supabase.functions.invoke()` method was trying to call functions at:
- ❌ `https://api.tryeatpal.com/functions/v1/list-users`

But your self-hosted Edge Functions are actually hosted at:
- ✅ `https://functions.tryeatpal.com/list-users`

The `/functions/v1/` path doesn't exist on your self-hosted setup because Edge Functions are on a separate domain.

## Solution Applied

### 1. Created Helper Function ✅

**File: `src/lib/edge-functions.ts`**

A drop-in replacement for `supabase.functions.invoke()` that:
- Uses `VITE_FUNCTIONS_URL` environment variable
- Handles authentication automatically
- Provides better error messages
- Works with your self-hosted setup

```typescript
import { invokeEdgeFunction } from '@/lib/edge-functions';

// Old way (doesn't work with self-hosted):
const { data, error } = await supabase.functions.invoke('list-users');

// New way (works with self-hosted):
const { data, error } = await invokeEdgeFunction('list-users');
```

### 2. Automated Migration ✅

**Script: `deployment/fix-edge-function-calls.ps1`**

Automatically replaced all 33 instances of `supabase.functions.invoke()` with `invokeEdgeFunction()`:

**Files Updated:**
- ✅ `src/components/admin/UserManagementDashboard.tsx`
- ✅ `src/components/admin/BulkUserManagement.tsx`
- ✅ `src/components/admin/DocumentExportManager.tsx`
- ✅ `src/components/admin/BlogCMSManager.tsx`
- ✅ `src/components/admin/SEOManager.tsx`
- ✅ `src/components/admin/ContentOptimizer.tsx`
- ✅ `src/components/admin/SocialMediaManager.tsx`
- ✅ `src/components/admin/AITicketAnalysis.tsx`
- ✅ `src/components/admin/AISettingsManager.tsx`
- ✅ `src/components/admin/BarcodeScannerDialog.tsx`
- ✅ `src/components/admin/BarcodeEnrichmentTool.tsx`
- ✅ `src/components/admin/SearchTraffic/PlatformConnectionManager.tsx`
- ✅ `src/components/admin/UserIntelligenceDashboard.tsx`
- ✅ `src/components/billing/PaymentMethods.tsx`
- ✅ `src/components/billing/InvoicesList.tsx`
- ✅ `src/components/billing/AddPaymentMethodDialog.tsx`
- ✅ `src/components/ImageFoodCapture.tsx`
- ✅ `src/components/ImportRecipeDialog.tsx`
- ✅ `src/components/ImportRecipeToGroceryDialog.tsx`
- ✅ `src/components/ProductSafetyChecker.tsx`
- ✅ `src/components/RecipeBuilder.tsx`
- ✅ `src/pages/AIPlanner.tsx`
- ✅ `src/pages/Pantry.tsx`
- ✅ `src/pages/Planner.tsx`
- ✅ `src/pages/Pricing.tsx`
- ✅ `src/pages/Recipes.tsx`
- ✅ `src/pages/SearchTrafficDashboard.tsx`
- ✅ `src/hooks/useOAuthToken.ts`
- ✅ `src/hooks/useSubscription.ts`
- ✅ `src/lib/backup.ts`
- ✅ `src/lib/oauth-token-rotation.ts`
- ✅ `src/lib/rate-limit.ts`
- ✅ `src/lib/security-audit.ts`

**Total: 33 files updated**

## Other Errors in Admin Panel

### 406 Error: `get_complementary_subscription`
```
api.tryeatpal.com/rest/v1/rpc/get_complementary_subscription 406
```

**Cause:** Database RPC function might not exist or has wrong signature.

**Fix:** Check if this function exists in your database:
```sql
SELECT * FROM pg_proc WHERE proname = 'get_complementary_subscription';
```

### 403 Error: `/auth/v1/admin/users`
```
api.tryeatpal.com/auth/v1/admin/users 403 (Forbidden)
```

**Cause:** Using anon key instead of service role key for admin endpoint.

**Fix:** Admin endpoints need service role key. The `list-users` Edge Function handles this correctly now.

### 404 Error: `email_leads` table
```
api.tryeatpal.com/rest/v1/email_leads 404
```

**Cause:** Table doesn't exist in your restored database.

**Fix:** Either:
1. Create the table if needed
2. Or remove code that queries this table

## Testing

After deploying, test these admin features:

```bash
# 1. Deploy the changes
git add .
git commit -m "fix: Edge Functions for self-hosted Supabase"
git push origin main

# 2. Test admin panel
# - Go to /admin
# - Check user management (should load users now)
# - Check other admin features
```

## Environment Variables Required

Make sure Cloudflare Pages has:
```env
VITE_SUPABASE_URL=https://api.tryeatpal.com
VITE_SUPABASE_ANON_KEY=<your-anon-key>
VITE_FUNCTIONS_URL=https://functions.tryeatpal.com
```

## Future Edge Function Development

When creating new Edge Functions, use the helper:

```typescript
import { invokeEdgeFunction } from '@/lib/edge-functions';

// Simple call
const { data, error } = await invokeEdgeFunction('my-function');

// With body
const { data, error } = await invokeEdgeFunction('my-function', {
  body: { key: 'value' }
});

// With custom method
const { data, error } = await invokeEdgeFunction('my-function', {
  method: 'GET'
});
```

## Summary

✅ **Fixed:** 503 errors on Edge Functions  
✅ **Updated:** 33 files to use new helper  
✅ **Created:** `invokeEdgeFunction()` helper for self-hosted setup  
⚠️ **Remaining:** 406, 403, 404 errors (database/permissions issues)

**Next:** Deploy and test!

