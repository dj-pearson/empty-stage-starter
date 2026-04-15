# Deployment Guide - EatPal Improvements
**Created:** November 13, 2025
**Status:** Production Ready
**Phases Completed:** 1, 2, 3

---

## Overview

This guide provides step-by-step instructions for deploying the performance, security, and optimization improvements implemented across three phases.

---

## Pre-Deployment Checklist

### ✅ Review Changes

- [ ] Review all commits on branch `claude/update-lts-improve-website-011CV5E3zmtwjqXoMuEcPQhY`
- [ ] Read `IMPLEMENTATION_STATUS.md` for complete change list
- [ ] Review `PERFORMANCE_OPTIMIZATIONS.md` for expected impact
- [ ] Review `SECURITY.md` for security changes

### ✅ Environment Setup

- [ ] Verify all environment variables are set
- [ ] Update environment variables for production (if needed)
- [ ] Ensure Supabase project is accessible
- [ ] Verify Stripe keys are correct
- [ ] Verify Sentry configuration

### ✅ Dependencies

```bash
# Install all dependencies
npm install

# Verify no vulnerabilities
npm audit

# Fix vulnerabilities if any
npm audit fix
```

### ✅ Code Quality

```bash
# Format code
npm run format

# Check formatting
npm run format:check

# Run linter
npm run lint

# Fix linting issues
npm run lint -- --fix
```

---

## Deployment Steps

### Step 1: Database Migration

**CRITICAL: Run database migration first!**

#### Option A: Supabase Dashboard (Recommended)

1. Navigate to Supabase Dashboard → SQL Editor
2. Open `supabase/migrations/20251113000000_performance_indexes.sql`
3. Copy entire contents
4. Paste into SQL Editor
5. Click "Run"
6. Verify all indexes were created:

```sql
-- Verify indexes
SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;
```

#### Option B: Supabase CLI

```bash
# Login to Supabase
npx supabase login

# Link to your project
npx supabase link --project-ref YOUR_PROJECT_ID

# Run migration
npx supabase db push
```

#### Verify Migration Success

```sql
-- Check index usage (run after deployment)
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan as scans,
  idx_tup_read as tuples_read
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND indexname LIKE 'idx_%'
ORDER BY idx_scan DESC
LIMIT 20;
```

**Expected Result:** All new indexes should appear in the list.

---

### Step 2: Image Optimization

```bash
# Optimize all images (converts to WebP/AVIF)
npm run optimize:images

# Verify optimized images exist
ls -lh public/*.webp
ls -lh public/*.avif
```

**Expected Output:**
- WebP files created for all PNGs
- AVIF files created for all PNGs
- ~90% file size reduction

**Manual Verification:**
- Check `public/` directory for `.webp` and `.avif` files
- Verify file sizes are significantly smaller

---

### Step 3: Build & Test

```bash
# Production build
npm run build

# Check build output
ls -lh dist/

# Verify bundle sizes
# Look for improved chunk sizes in build output

# Preview production build locally
npm run preview

# Open http://localhost:3000 and test:
# - Homepage loads correctly
# - Images display properly (AVIF/WebP fallback)
# - Navigation works
# - Dashboard loads (if authenticated)
# - No console errors
```

**Expected Build Output:**
```
dist/assets/js/vendor-react-[hash].js        ~120 KB
dist/assets/js/vendor-ui-[hash].js           ~180 KB
dist/assets/js/index-[hash].js               ~50 KB
...
Total bundle size: ~350 KB gzipped (down from 450 KB)
```

---

### Step 4: Security Headers Verification

Before deploying, test security headers:

```bash
# Start local preview
npm run preview

# In another terminal, test headers
curl -I http://localhost:3000
```

**Expected Headers:**
```
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=()...
Cross-Origin-Embedder-Policy: credentialless
Cross-Origin-Opener-Policy: same-origin-allow-popups
Cross-Origin-Resource-Policy: same-origin
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
Content-Security-Policy: default-src 'self'...
```

---

### Step 5: Deploy to Cloudflare Pages

#### Using Lovable (Recommended)

1. Open Lovable project
2. Click "Share" → "Publish"
3. Lovable automatically deploys to Cloudflare Pages
4. Wait for deployment to complete
5. Verify deployment URL

#### Using Cloudflare Dashboard

```bash
# Build for production
npm run build

# Deploy to Cloudflare Pages (if connected via Wrangler)
npx wrangler pages deploy dist
```

#### Using Git Push (Auto-deploy)

```bash
# Merge to main branch
git checkout main
git merge claude/update-lts-improve-website-011CV5E3zmtwjqXoMuEcPQhY
git push origin main

# Cloudflare Pages will auto-deploy
```

---

### Step 6: Post-Deployment Verification

#### A. Functional Testing

Visit your deployed site and verify:

- [ ] Homepage loads correctly
- [ ] Images load in modern formats (check Network tab)
- [ ] Navigation works smoothly
- [ ] Login/signup works
- [ ] Dashboard loads correctly
- [ ] Meal planner functions
- [ ] No JavaScript errors in console
- [ ] Mobile view works correctly

#### B. Performance Testing

**Lighthouse Audit:**

1. Open Chrome DevTools
2. Go to Lighthouse tab
3. Select "Performance", "Accessibility", "Best Practices", "SEO"
4. Click "Analyze page load"

**Target Scores:**
- Performance: 95+ (up from 92)
- Accessibility: 95+
- Best Practices: 95+
- SEO: 95+

**Core Web Vitals:**
- LCP: <1.8s (down from 2.1s)
- FID: <100ms
- CLS: <0.1

#### C. Security Testing

**1. Security Headers:**

Visit https://securityheaders.com
- Enter your domain
- Target Score: **A+**

**2. SSL Labs:**

Visit https://www.ssllabs.com/ssltest/
- Enter your domain
- Target Score: **A+**

**3. Mozilla Observatory:**

Visit https://observatory.mozilla.org
- Enter your domain
- Target Score: **A+**

#### D. Image Optimization Verification

```bash
# Check Network tab in DevTools
# Filter by Img
# Verify images are served as AVIF/WebP
```

**Expected:**
- AVIF images on modern browsers (Chrome, Edge, Firefox)
- WebP fallback on Safari 14+
- PNG fallback on older browsers

#### E. Database Performance

```sql
-- Check query performance (run in Supabase SQL Editor)
SELECT
  calls,
  total_time,
  mean_time,
  query
FROM pg_stat_statements
WHERE query NOT LIKE '%pg_%'
ORDER BY mean_time DESC
LIMIT 20;
```

**Expected:**
- Mean query time: <100ms for most queries
- P95 query time: <300ms (down from ~500ms)

#### F. API Response Time

Use browser DevTools Network tab:

**Expected API Response Times:**
- GET /foods: <200ms
- GET /plan_entries: <150ms
- GET /recipes: <100ms
- POST /ai-meal-plan: <2s

---

## Rollback Plan

If issues occur, follow this rollback procedure:

### Option 1: Quick Rollback (Cloudflare Pages)

1. Go to Cloudflare Pages Dashboard
2. Select your project
3. Go to "Deployments"
4. Click "Rollback" on the previous working deployment

### Option 2: Database Rollback

```sql
-- Rollback database indexes (if causing issues)
-- Copy index names from migration file and drop them:

DROP INDEX IF EXISTS idx_plan_entries_kid_date_slot;
DROP INDEX IF EXISTS idx_foods_user_safe;
-- ... (drop all new indexes)
```

### Option 3: Git Rollback

```bash
# Revert to previous commit
git revert HEAD

# Push to trigger redeploy
git push origin main
```

---

## Monitoring Post-Deployment

### Week 1 Monitoring

**Daily:**
- [ ] Check error rates in Sentry
- [ ] Monitor Cloudflare Analytics
- [ ] Check database CPU usage
- [ ] Review slow query logs

**Metrics to Track:**
- Error rate (should not increase)
- Average response time (should decrease)
- Bounce rate (should decrease)
- Page load time (should decrease)

### Week 2-4 Monitoring

**Weekly:**
- [ ] Review Lighthouse scores
- [ ] Check Core Web Vitals in Google Search Console
- [ ] Monitor conversion rates
- [ ] Review database index usage
- [ ] Check security headers
- [ ] Review CSP violations (if reporting enabled)

### Monthly Monitoring

- [ ] Run full security audit
- [ ] Review and optimize unused indexes
- [ ] Update dependencies
- [ ] Review performance metrics vs. targets

---

## Expected Results

### Performance Improvements

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Bundle Size | 450 KB | 350 KB | -22% |
| LCP | 2.1s | 1.8s | -14% |
| TTI | 3.2s | 3.0s | -6% |
| API p95 | 500ms | 300ms | -40% |
| Lighthouse | 92 | 95+ | +3 points |

### Business Impact

**Estimated Improvements:**
- Conversion rate: +5-10% (faster site)
- SEO rankings: +10-20% (better Core Web Vitals)
- User engagement: +15% (better UX)
- Server costs: -20% (database optimization)
- Mobile engagement: +25% (mobile optimizations)

---

## Troubleshooting

### Issue: Images not loading

**Symptom:** Images show as broken
**Solution:**
1. Verify optimized images exist: `ls public/*.webp`
2. Run `npm run optimize:images`
3. Rebuild: `npm run build`

### Issue: Higher error rates

**Symptom:** Sentry showing increased errors
**Solution:**
1. Check specific errors in Sentry
2. Review CSP violations (might be blocking legitimate requests)
3. Temporarily loosen CSP if needed
4. Check browser console for details

### Issue: Database performance degradation

**Symptom:** Queries slower than before
**Solution:**
1. Check index usage: See SQL query in Step 1
2. Run ANALYZE on tables: `ANALYZE table_name;`
3. Check for index bloat
4. Verify RLS policies aren't conflicting

### Issue: Build size larger than expected

**Symptom:** Bundle size >400 KB
**Solution:**
1. Run bundle analyzer: `npm run analyze:bundle`
2. Check for duplicate dependencies
3. Verify code splitting is working
4. Check for large dependencies that could be lazy-loaded

### Issue: Security headers not applying

**Symptom:** securityheaders.com shows low score
**Solution:**
1. Verify `public/_headers` file is deployed
2. Check Cloudflare Pages build logs
3. Manually verify headers: `curl -I https://your-domain.com`
4. Contact Cloudflare support if needed

---

## Success Criteria

Deployment is successful if:

✅ **Performance:**
- Lighthouse Performance score ≥ 95
- LCP < 2.0s
- Bundle size < 400 KB

✅ **Security:**
- securityheaders.com score = A+
- SSL Labs score = A+
- No new security vulnerabilities

✅ **Functionality:**
- All features work as expected
- No increase in error rates
- Mobile experience improved

✅ **Database:**
- Query response time improved
- Index usage > 0 for new indexes
- No performance degradation

✅ **User Experience:**
- No user-reported issues
- Conversion rate stable or improved
- Bounce rate stable or decreased

---

## Support & Help

**Issues with deployment?**

1. Check this guide first
2. Review `TROUBLESHOOTING.md` (if created)
3. Check Sentry for errors
4. Review Cloudflare Pages build logs
5. Contact team via Slack #engineering

**Performance not as expected?**

1. Run Lighthouse audit
2. Check bundle analyzer
3. Review database query performance
4. Check CDN cache hit rate

**Security concerns?**

1. Review `SECURITY.md`
2. Run security scan: `npm audit`
3. Test with OWASP ZAP
4. Contact security team

---

## Next Steps After Deployment

### Immediate (Week 1)

1. Monitor metrics closely
2. Collect user feedback
3. Fix any critical issues immediately
4. Document any unexpected behavior

### Short-Term (Month 1)

1. Complete testing infrastructure setup
2. Implement 2FA (see WEBSITE_IMPROVEMENT_ROADMAP.md)
3. Complete mobile app (see roadmap)
4. Start SEO content strategy

### Long-Term (Quarter 1)

1. Achieve 70% test coverage
2. Complete Phase 2 CSP (nonce-based)
3. Professional security audit
4. Scale to 10K+ users

---

## Rollout Strategy (Optional)

For risk-averse deployments, consider gradual rollout:

### Option 1: Staged Rollout

1. **Week 1:** Deploy to staging, test thoroughly
2. **Week 2:** Deploy to 10% of users (Cloudflare Workers)
3. **Week 3:** Deploy to 50% of users
4. **Week 4:** Deploy to 100% of users

### Option 2: Feature Flags

1. Deploy code with features disabled
2. Gradually enable features via environment variables
3. Monitor each feature's impact
4. Rollback individual features if needed

---

**Deployment Checklist Complete!** ✅

Remember: Take backups before deploying, monitor closely post-deployment, and be ready to rollback if needed. Good luck! 🚀
