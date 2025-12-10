# CloudFlare Pages Deployment Guide for EatPal

## Overview
This guide explains how to deploy EatPal to CloudFlare Pages with the correct configuration.

---

## Prerequisites

1. CloudFlare account
2. GitHub repository connected to your project
3. Build command and output directory configured

---

## Configuration Files

### 1. `wrangler.toml`
Located at project root. Defines CloudFlare Pages settings:
- Project name: `eatpal-empty-stage`
- Compatibility date: `2024-12-19`
- Output directory: `dist`

### 2. `public/_headers`
Security headers, caching policies, and CORS configuration.
- Automatically copied to `dist/_headers` during build
- Configures CSP, HSTS, X-Frame-Options, etc.
- Sets cache policies for different asset types

### 3. `public/_redirects`
URL redirects and SPA routing fallback.
- Automatically copied to `dist/_redirects` during build
- Forces HTTPS
- Handles authentication redirects
- SPA fallback rule (MUST BE LAST)

### 4. `vite.config.ts`
Build optimization for CloudFlare:
- Terser minification
- Manual code splitting
- Asset hashing for cache busting
- Optimized chunk sizes

---

## CloudFlare Pages Setup

### Step 1: Create New Pages Project

1. Go to CloudFlare Dashboard
2. Navigate to **Pages**
3. Click **Create a project**
4. Connect your GitHub repository

### Step 2: Configure Build Settings

Use these exact settings:

**Framework preset:** None (or Vite if available)

**Build command:**
```
npm run build
```

**Build output directory:**
```
dist
```

**Root directory:**
```
/
```

**Node.js version:**
```
18
```

### Step 3: Environment Variables

Add these environment variables in CloudFlare Pages settings:

```
NODE_VERSION=18
NPM_FLAGS=--legacy-peer-deps
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Step 4: Advanced Settings

**Build caching:** Enabled

**Compatibility date:** `2024-12-19`

**Compatibility flags:** (leave empty unless needed)

---

## Deployment Commands

### Production Build
```bash
npm run build
```

### Preview Build (Development Mode)
```bash
npm run build:dev
```

### Local CloudFlare Pages Development
```bash
# First build the project
npm run build

# Then run Wrangler Pages dev server
npm run pages:dev
```

---

## Build Optimization Features

### 1. Code Splitting
Automatically splits code into optimized chunks:
- `vendor.js` - React and React DOM
- `router.js` - React Router
- `ui.js` - Radix UI components
- `utils.js` - Utility libraries
- `supabase.js` - Supabase client
- `dnd.js` - Drag and drop libraries

### 2. Asset Optimization
- Images: `assets/images/[name]-[hash][extname]`
- Fonts: `assets/fonts/[name]-[hash][extname]`
- JS: `assets/js/[name]-[hash].js`
- CSS: `assets/css/[name]-[hash].css`

### 3. Caching Strategy
- Static assets: 1 year cache
- HTML: 5 minutes cache
- API routes: No cache
- Admin routes: No cache, no index

---

## Troubleshooting

### Build Fails with "html5-qrcode" Error

If you encounter an error about `html5-qrcode`, you have two options:

**Option 1: Make the import dynamic**
```typescript
// In BarcodeScannerDialog.tsx
const Html5Qrcode = await import('html5-qrcode');
```

**Option 2: Add to vite config external**
```typescript
// vite.config.ts
rollupOptions: {
  external: ['html5-qrcode']
}
```

### _headers or _redirects Not Working

**Verify files exist:**
```bash
ls -la public/_headers
ls -la public/_redirects
```

**Check dist folder after build:**
```bash
ls -la dist/_headers
ls -la dist/_redirects
```

If files are missing from dist, Vite should copy them automatically since they're in `public/`.

### Build is Slow

1. Enable build caching in CloudFlare Pages settings
2. Use `npm ci` instead of `npm install` for faster installs
3. Consider reducing dependencies if possible

### 404 Errors on Client-Side Routes

Ensure the SPA fallback is the LAST rule in `public/_redirects`:
```
/* /index.html 200
```

### CSP Errors in Console

Update `public/_headers` CSP policy to include your domains:
```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://yourdomains.com;
```

---

## Deployment Workflow

### Automatic Deployment (Recommended)

1. Push to `main` branch
2. CloudFlare automatically builds and deploys
3. Check deployment logs in CloudFlare dashboard
4. Preview deployment URL provided

### Manual Deployment via Wrangler

```bash
# Install Wrangler CLI
npm install -g wrangler

# Login to CloudFlare
wrangler login

# Build the project
npm run build

# Deploy
wrangler pages deploy dist --project-name=eatpal-empty-stage
```

---

## Custom Domain Setup

1. Go to CloudFlare Pages dashboard
2. Select your project
3. Go to **Custom domains**
4. Click **Set up a custom domain**
5. Enter `tryeatpal.com` (or your domain)
6. Follow DNS configuration instructions
7. CloudFlare automatically handles SSL certificates

---

## Performance Optimization

### Enabled by Default:
- ✅ Brotli compression
- ✅ HTTP/2 and HTTP/3
- ✅ Edge caching
- ✅ Automatic asset optimization
- ✅ Smart routing
- ✅ DDoS protection

### Headers Optimization:
- Static assets: 1 year cache with immutable flag
- Fonts: 1 year cache
- Images: 1 year cache
- JS/CSS: 1 year cache (with hash-based versioning)

---

## Security Features

### Implemented:
- ✅ HSTS with preload
- ✅ X-Frame-Options: DENY
- ✅ X-Content-Type-Options: nosniff
- ✅ XSS Protection
- ✅ Content Security Policy
- ✅ Referrer Policy
- ✅ Permissions Policy
- ✅ HTTPS enforcement

---

## Monitoring

### CloudFlare Analytics
- Page views
- Bandwidth usage
- Cache hit ratio
- Geographic distribution
- Response times

### Logs
Available in CloudFlare dashboard under:
**Pages > Your Project > Deployments > View logs**

---

## CI/CD Integration

### GitHub Actions (Optional)

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to CloudFlare Pages

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build
        run: npm run build
        env:
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
      
      - name: Deploy to CloudFlare Pages
        uses: cloudflare/pages-action@v1
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          projectName: eatpal-empty-stage
          directory: dist
```

---

## Post-Deployment Checklist

- [ ] Verify homepage loads correctly
- [ ] Test all major routes (/kids, /planner, /tracker, etc.)
- [ ] Check admin dashboard access
- [ ] Verify Supabase connections
- [ ] Test authentication flow
- [ ] Check mobile responsiveness
- [ ] Verify SSL certificate
- [ ] Test all social login methods
- [ ] Check API endpoints
- [ ] Monitor CloudFlare analytics

---

## Support Resources

- **CloudFlare Pages Docs:** https://developers.cloudflare.com/pages/
- **Wrangler CLI Docs:** https://developers.cloudflare.com/workers/wrangler/
- **Troubleshooting:** https://developers.cloudflare.com/pages/platform/known-issues/

---

## Quick Commands Reference

```bash
# Development
npm run dev

# Production build
npm run build

# Preview production build locally
npm run preview

# Test with Wrangler Pages
npm run pages:dev

# Deploy manually
wrangler pages deploy dist --project-name=eatpal-empty-stage
```

---

## Success Indicators

Your deployment is successful when:
- ✅ Build completes without errors
- ✅ All routes are accessible
- ✅ Assets load with proper caching headers
- ✅ SSL certificate is active
- ✅ Redirects work as expected
- ✅ Admin routes are protected
- ✅ API calls to Supabase work
- ✅ Authentication flows complete successfully

---

**Ready to deploy!** 🚀

