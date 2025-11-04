# 🔌 Google Search Console Integration - Setup Guide

## Overview

This guide will help you integrate Google Search Console with your SEO Management system to get **real keyword data** instead of mock data.

---

## 📋 What You'll Get

After setup, your SEO system will have:
- ✅ **Real keyword rankings** from Google
- ✅ **Actual impressions, clicks, CTR** data
- ✅ **Historical performance tracking**
- ✅ **Page-level performance metrics**
- ✅ **Automatic data sync** (daily/weekly)
- ✅ **GSC issues detection** (mobile usability, crawl errors, etc.)

---

## 🚀 Setup Steps

### **Step 1: Apply Database Migration**

Option A: Via Supabase CLI (if migrations work):
```bash
cd C:\Users\pears\Documents\EatPal\empty-stage-starter
supabase db push
```

Option B: Via Supabase Dashboard (recommended if CLI has issues):

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Create a new query
4. Copy and paste the entire contents of:
   `supabase/migrations/20251104000000_google_search_console_integration.sql`
5. Click **Run**
6. Verify no errors

---

### **Step 2: Deploy Edge Functions**

Deploy the 3 new GSC functions:

```bash
cd C:\Users\pears\Documents\EatPal\empty-stage-starter

# OAuth flow
supabase functions deploy gsc-oauth

# Fetch properties (websites)
supabase functions deploy gsc-fetch-properties

# Sync GSC data
supabase functions deploy gsc-sync-data
```

Verify deployment:
```bash
supabase functions list | grep gsc
```

You should see:
- ✅ gsc-oauth
- ✅ gsc-fetch-properties
- ✅ gsc-sync-data

---

### **Step 3: Create Google Cloud Project**

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or use existing)
3. Name it: "EatPal SEO Integration" (or your app name)

---

### **Step 4: Enable Google Search Console API**

1. In Google Cloud Console, navigate to **APIs & Services** → **Library**
2. Search for: **"Google Search Console API"**
3. Click on it and click **Enable**
4. Wait for it to enable (~30 seconds)

---

### **Step 5: Create OAuth 2.0 Credentials**

1. Navigate to **APIs & Services** → **Credentials**
2. Click **+ CREATE CREDENTIALS** → **OAuth client ID**
3. If prompted, configure OAuth consent screen first:
   - User Type: **External**
   - App name: **Your App Name**
   - User support email: **your email**
   - Developer contact: **your email**
   - Scopes: Add `https://www.googleapis.com/auth/webmasters.readonly`
   - Test users: Add your email (for testing)
   - Click **Save and Continue**

4. Back to **Create OAuth client ID**:
   - Application type: **Web application**
   - Name: **EatPal SEO Manager**
   - Authorized JavaScript origins:
     - `http://localhost:5173` (for development)
     - `https://your-production-domain.com` (for production)
   - Authorized redirect URIs:
     - `http://localhost:5173/seo-dashboard` (development)
     - `https://your-production-domain.com/seo-dashboard` (production)
   - Click **Create**

5. **Save these credentials:**
   - Client ID: `123456789-abcdefg.apps.googleusercontent.com`
   - Client Secret: `GOCSPX-abc123def456`

---

### **Step 6: Configure Environment Variables**

Add these to your Supabase project:

1. Go to **Project Settings** → **Edge Functions** → **Manage Secrets**
2. Add these secrets:

```
GOOGLE_CLIENT_ID=your_client_id_here
GOOGLE_CLIENT_SECRET=your_client_secret_here
GOOGLE_REDIRECT_URI=http://localhost:5173/seo-dashboard
```

For production, update `GOOGLE_REDIRECT_URI` to your production domain.

Via CLI:
```bash
supabase secrets set GOOGLE_CLIENT_ID=your_client_id
supabase secrets set GOOGLE_CLIENT_SECRET=your_client_secret
supabase secrets set GOOGLE_REDIRECT_URI=http://localhost:5173/seo-dashboard
```

---

### **Step 7: Update Frontend (Next Implementation Step)**

I'll create the UI components in the next step. The UI will include:
- "Connect to Google Search Console" button
- Property (website) selector
- Sync data button
- Real-time keyword data display

---

## 🧪 Testing the Integration

### **Test OAuth Flow:**

```bash
# Get your user ID
# Then test initiating OAuth
curl "https://YOUR_PROJECT.supabase.co/functions/v1/gsc-oauth?action=initiate&userId=YOUR_USER_ID" \
  -H "Authorization: Bearer YOUR_ANON_KEY"

# Response will include authUrl - open it in browser
```

### **Test Token Refresh:**

```typescript
const { data, error } = await supabase.functions.invoke("gsc-oauth", {
  body: {
    action: "refresh",
    userId: user.id
  }
});
```

### **Test Fetching Properties:**

```typescript
const { data, error } = await supabase.functions.invoke("gsc-fetch-properties", {
  body: { userId: user.id }
});
```

### **Test Syncing Data:**

```typescript
const { data, error } = await supabase.functions.invoke("gsc-sync-data", {
  body: {
    userId: user.id,
    syncType: "all", // or "keywords" or "pages"
    startDate: "2024-10-28",
    endDate: "2024-11-03"
  }
});
```

---

## 📊 Database Schema Overview

### **New Tables Created:**

1. **`gsc_oauth_credentials`** - OAuth tokens
   - Stores access_token, refresh_token
   - Auto-refreshes when expired

2. **`gsc_properties`** - Verified websites
   - Lists all GSC properties
   - Marks primary property for syncing

3. **`gsc_keyword_performance`** - Historical keyword data
   - Daily snapshots of keyword metrics
   - Impressions, clicks, CTR, position

4. **`gsc_page_performance`** - Page-level metrics
   - Performance by URL
   - Top queries per page

5. **`gsc_issues`** - GSC-reported issues
   - Mobile usability problems
   - Crawl errors
   - Security issues

6. **`gsc_sync_log`** - Sync event tracking
   - Logs every data sync
   - Success/failure tracking

### **Enhanced Tables:**

**`seo_keywords`** - Now includes:
- `impressions` - from GSC
- `clicks` - from GSC
- `ctr` - from GSC
- `gsc_position` - exact avg position from GSC
- `data_source` - 'manual', 'gsc', or 'hybrid'
- `gsc_last_updated` - timestamp

---

## 🔄 Data Flow

```
1. User clicks "Connect to Google Search Console"
   ↓
2. OAuth flow: User authorizes app
   ↓
3. Tokens stored in gsc_oauth_credentials
   ↓
4. Fetch verified properties from GSC
   ↓
5. User selects primary property
   ↓
6. Click "Sync Data"
   ↓
7. gsc-sync-data fetches keyword & page performance
   ↓
8. Data saved to gsc_keyword_performance & gsc_page_performance
   ↓
9. seo_keywords table updated with real data
   ↓
10. UI shows real rankings, impressions, clicks!
```

---

## ⏰ Automated Sync (Optional - Next Step)

To enable daily automatic syncing:

```sql
-- Create cron job (requires pg_cron extension)
SELECT cron.schedule(
  'daily-gsc-sync',
  '0 3 * * *', -- Daily at 3 AM
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT.supabase.co/functions/v1/gsc-sync-data',
    headers := '{"Authorization": "Bearer SERVICE_KEY", "Content-Type": "application/json"}'::jsonb,
    body := '{"userId": "ADMIN_USER_ID", "syncType": "all"}'::jsonb
  );
  $$
);
```

---

## 🎯 Next Steps

After completing this setup:

1. ✅ Database tables created
2. ✅ Edge functions deployed
3. ✅ Google OAuth configured
4. ⏳ **UI components** (I'll build next)
5. ⏳ **Connect button** in SEO Dashboard
6. ⏳ **Real keyword display**
7. ⏳ **Automated scheduling**

---

## 🐛 Troubleshooting

### **Error: "No GSC credentials found"**
- Solution: User needs to complete OAuth flow first

### **Error: "Access token expired"**
- Solution: Call `/gsc-oauth?action=refresh` to get new token

### **Error: "Property not found"**
- Solution: Run `gsc-fetch-properties` first to sync properties

### **GSC API Returns 403**
- Solution: Check that API is enabled in Google Cloud Console
- Verify OAuth scopes include `webmasters.readonly`

### **No data returned from GSC**
- Solution: GSC has ~2 day data delay
- Try fetching data from 3-7 days ago

---

## 💰 Cost

- Google Search Console API: **FREE** ✅
- OAuth 2.0: **FREE** ✅
- No additional costs!

---

## 🔒 Security Notes

- OAuth tokens stored encrypted in Supabase
- RLS policies ensure users only see their own data
- Refresh tokens never exposed to frontend
- Service role key only used in edge functions

---

## ✅ Setup Complete!

Once you've completed steps 1-6, let me know and I'll build the UI components to make this all work seamlessly in your SEO Dashboard!

**Current Status:**
- [x] Database schema ready
- [x] Edge functions created
- [ ] Google OAuth configured (you do this)
- [ ] Environment variables set (you do this)
- [ ] UI components (I'll build next)
- [ ] End-to-end testing
