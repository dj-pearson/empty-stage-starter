# Cloudflare Pages Environment Variables Setup

## ✅ Already Configured in wrangler.toml

The following critical environment variables are already set in `wrangler.toml`:

### Production Environment
- **VITE_SUPABASE_URL**: `https://api.tryeatpal.com`
- **VITE_SUPABASE_ANON_KEY**: Configured ✓
- **VITE_FUNCTIONS_URL**: `https://functions.tryeatpal.com`
- **VITE_STRIPE_PUBLISHABLE_KEY**: `pk_live_XXXXXXXXXXXXXXXX`
- **VITE_APP_NAME**: `EatPal`
- **VITE_APP_VERSION**: `1.0.0`
- **VITE_APP_URL**: `https://tryeatpal.com`

## 🔒 Sensitive Variables (Add via Cloudflare Dashboard)

For security reasons, these should be added directly in the Cloudflare Pages dashboard:

### How to Add Environment Variables in Cloudflare Dashboard

1. Go to: [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to: **Workers & Pages** → **empty-stage-starter** → **Settings** → **Environment Variables**
3. Choose the environment: **Production** or **Preview**
4. Click **Add variable**

### Optional but Recommended Variables

#### Sentry (Error Tracking & Performance Monitoring)
```
VITE_SENTRY_DSN = "your-sentry-dsn-here"
VITE_SENTRY_ENABLED = "true"
```
**Where to get it**: [sentry.io](https://sentry.io/) → Your Project → Settings → Client Keys (DSN)

#### Google Analytics (User Analytics)
```
VITE_GA_MEASUREMENT_ID = "G-XXXXXXXXXX"
```
**Where to get it**: [Google Analytics](https://analytics.google.com/) → Admin → Data Streams → Measurement ID

#### OAuth Configuration (for Google/Bing Indexing APIs)
```
VITE_GOOGLE_CLIENT_ID = "your-google-client-id"
VITE_BING_CLIENT_ID = "your-bing-client-id"
```

#### URL Shortener (for Analytics)
```
VITE_BITLY_API_KEY = "your-bitly-token"
```

## 🧪 Preview Environment

The preview environment mirrors production but should use test keys where applicable:

- Use Stripe **test** publishable key for preview: `pk_test_...`
- Same Supabase configuration as production (or separate staging database)
- Set `VITE_APP_URL` to your preview domain

## 📦 Build-time vs Runtime

**Important**: All `VITE_*` variables are **build-time** variables. They are:
- Embedded into the JavaScript bundle during the build
- Cannot be changed without rebuilding
- Public (visible in browser code)

**Never put secret keys in VITE_ variables!**

## ✅ Verification

After deploying, you can verify environment variables are working by checking the browser console:

```javascript
// In production, these should be defined:
console.log(import.meta.env.VITE_SUPABASE_URL); // https://api.tryeatpal.com
console.log(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY); // pk_live_...
```

## 🚀 Current Status

### ✅ Ready for Production
- Supabase configuration complete
- Stripe payment keys configured
- App metadata set

### ⚠️ Optional Enhancements
- Sentry for error tracking (recommended)
- Google Analytics for user insights
- OAuth for SEO indexing APIs

## 📝 Notes

1. **Automatic Deployment**: Changes to `wrangler.toml` trigger automatic redeployment
2. **Dashboard Variables**: Variables added via dashboard take precedence over `wrangler.toml`
3. **Security**: Never commit secret keys to git - use dashboard for sensitive data
4. **Testing**: Use preview environment to test changes before production

## 🔗 Quick Links

- [Cloudflare Pages Docs](https://developers.cloudflare.com/pages/)
- [Environment Variables Guide](https://developers.cloudflare.com/pages/platform/build-configuration/#environment-variables)
- [Wrangler Configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)
