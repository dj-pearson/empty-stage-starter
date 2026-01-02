# 🚨 URGENT: Environment Variables Not Being Used During Build

## The Problem

The build log shows:
```
Build environment variables: (none found)
```

**Why?** Environment variables in `wrangler.toml` under `[env.production]` are **runtime** variables for Workers/Functions, NOT build-time variables. Vite needs these variables during `npm run build`.

## ✅ Solution: Add Variables to Cloudflare Pages Dashboard

### Step 1: Go to Cloudflare Dashboard
1. Navigate to: https://dash.cloudflare.com/
2. Click: **Workers & Pages**
3. Find and click: **empty-stage-starter**
4. Go to: **Settings** → **Environment variables**

### Step 2: Add These Variables for Production

Click **"Add variable"** and add each of these:

#### Required Variables

```
Variable name: VITE_SUPABASE_URL
Value: https://api.tryeatpal.com
Environment: Production
```

```
Variable name: VITE_SUPABASE_ANON_KEY
Value: eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc2NTI1MzE2MCwiZXhwIjo0OTIwOTI2NzYwLCJyb2xlIjoiYW5vbiJ9.HBFEkJdBlHpZozkyUAcaV2IO-065599yClMPfsYt3Ug
Environment: Production
```

```
Variable name: VITE_FUNCTIONS_URL
Value: https://functions.tryeatpal.com
Environment: Production
```

```
Variable name: VITE_STRIPE_PUBLISHABLE_KEY
Value: pk_live_51SFmtlEQGPvinhrFu06bhMiTicheSKMvIwL5fUPTvoZBAyUQTSpFHWXVRxZwdmcLS82iBzA0qlgdNSww0tPmOI3y009iwWSlX2
Environment: Production
```

```
Variable name: VITE_APP_NAME
Value: EatPal
Environment: Production
```

```
Variable name: VITE_APP_VERSION
Value: 1.0.0
Environment: Production
```

```
Variable name: VITE_APP_URL
Value: https://tryeatpal.com
Environment: Production
```

### Step 3: Add Same Variables for Preview (Optional but Recommended)

Repeat the process for **Preview** environment with the same values (or use test keys for Stripe).

### Step 4: Trigger a New Build

After adding the variables, you need to trigger a new deployment:

**Option A: Via Dashboard**
1. Go to **Deployments** tab
2. Click the **three dots** on the latest deployment
3. Click **Retry deployment**

**Option B: Via Git (Recommended)**
```bash
git commit --allow-empty -m "chore: trigger rebuild with env vars"
git push
```

## 📋 Quick Copy-Paste Format

For faster setup, here's the format for bulk adding:

```
VITE_SUPABASE_URL=https://api.tryeatpal.com
VITE_SUPABASE_ANON_KEY=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc2NTI1MzE2MCwiZXhwIjo0OTIwOTI2NzYwLCJyb2xlIjoiYW5vbiJ9.HBFEkJdBlHpZozkyUAcaV2IO-065599yClMPfsYt3Ug
VITE_FUNCTIONS_URL=https://functions.tryeatpal.com
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_51SFmtlEQGPvinhrFu06bhMiTicheSKMvIwL5fUPTvoZBAyUQTSpFHWXVRxZwdmcLS82iBzA0qlgdNSww0tPmOI3y009iwWSlX2
VITE_APP_NAME=EatPal
VITE_APP_VERSION=1.0.0
VITE_APP_URL=https://tryeatpal.com
```

## 🎯 After Adding Variables

The next build log should show:
```
Build environment variables: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, ...
```

And the toast error about missing variables should disappear! 🎉

## 📚 Why This Happens

- **Build-time variables**: Needed during `npm run build` (Vite embeds them in JS)
- **Runtime variables**: Available when the app runs (Workers/Functions)
- **wrangler.toml**: Only provides runtime variables, not build-time
- **Dashboard variables**: Available for BOTH build-time and runtime

## 🔐 Security Note

These are all **public** variables (they're embedded in client-side JavaScript). Never put secret keys in `VITE_*` variables!

## 📱 Screenshot Guide

If needed, here's what to click:
1. Dashboard → Workers & Pages → empty-stage-starter
2. Settings tab → Environment variables (left sidebar)
3. For "Production and Preview" environment
4. Click "Add variable" button
5. Fill in variable name and value
6. Click "Save"
7. Repeat for all variables
8. Click "Save" at the bottom of the page

---

**Next Step**: Add these variables in the Cloudflare dashboard, then retry the deployment!
