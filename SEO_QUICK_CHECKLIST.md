# ✅ SEO System Duplication - Quick Checklist

**Use this checklist when duplicating the SEO system to a new platform**

## Pre-Flight Check

- [ ] Supabase project created
- [ ] Node.js 18+ installed
- [ ] React/TypeScript project ready
- [ ] PageSpeed Insights API key obtained (FREE)

---

## Step 1: Database (15 mins)

- [ ] Copy 6 migration files from `supabase/migrations/`
- [ ] Run `supabase db push`
- [ ] Verify 28+ `seo_*` tables exist
- [ ] Verify RLS policies are active

---

## Step 2: Edge Functions (20 mins)

- [ ] Copy all 45+ SEO functions from `supabase/functions/`
- [ ] Run `supabase functions deploy`
- [ ] Verify functions list with `supabase functions list`

**Critical Functions to Test:**
- [ ] `seo-audit`
- [ ] `crawl-site`
- [ ] `check-core-web-vitals`
- [ ] `gsc-oauth` (if using GSC)

---

## Step 3: Frontend (30 mins)

- [ ] Install dependencies:
  ```bash
  npm install @supabase/supabase-js @radix-ui/react-tabs lucide-react sonner
  ```
- [ ] Copy `SEOManager.tsx` to `src/components/admin/`
- [ ] Copy `SEOResultsDisplay.tsx` to `src/components/admin/`
- [ ] Copy `ContentOptimizer.tsx` to `src/components/admin/`
- [ ] Copy `SEODashboard.tsx` to `src/pages/`
- [ ] Add route: `/admin/seo`
- [ ] Add sidebar link to SEO Management

---

## Step 4: Environment (10 mins)

- [ ] Create `.env` file with:
  ```bash
  VITE_SUPABASE_URL=
  VITE_SUPABASE_ANON_KEY=
  PAGESPEED_INSIGHTS_API_KEY=
  ```
- [ ] Set Supabase secrets:
  ```bash
  supabase secrets set PAGESPEED_INSIGHTS_API_KEY=your_key
  ```

**Optional but Recommended:**
- [ ] `GOOGLE_CLIENT_ID` (for GSC)
- [ ] `GOOGLE_CLIENT_SECRET` (for GSC)
- [ ] `AHREFS_API_KEY` (for backlinks)
- [ ] `SERPAPI_KEY` (for SERP tracking)

---

## Step 5: Testing (15 mins)

- [ ] Run `npm run build` (should succeed)
- [ ] Run `npm run dev`
- [ ] Navigate to `/admin/seo`
- [ ] Test **Audit** tab with a URL
- [ ] Test **Site Crawler** tab
- [ ] Test **Core Web Vitals** tab
- [ ] Test **Keywords** tab (add a keyword)
- [ ] Test **Meta Tags** tab (save changes)

---

## Step 6: Optional Integrations (30 mins)

- [ ] Connect Google Search Console
- [ ] Enable automated monitoring
- [ ] Configure email notifications
- [ ] Set up alert rules
- [ ] Test Slack notifications (if needed)

---

## Final Verification

- [ ] All 22 tabs visible in SEO Manager
- [ ] No console errors in browser
- [ ] Data saving to database (check `seo_audit_history`)
- [ ] Admin user can access all features
- [ ] RLS policies protecting data
- [ ] Edge Functions responding correctly

---

## Go-Live Checklist

- [ ] Production environment variables set
- [ ] Supabase secrets configured in production
- [ ] Edge Functions deployed to production
- [ ] Database migrations applied to production
- [ ] SSL/HTTPS enabled
- [ ] OAuth redirect URIs updated for production domain
- [ ] Rate limiting configured
- [ ] Monitoring enabled
- [ ] Backup strategy in place

---

## Quick Commands

```bash
# Database
supabase db push
supabase db reset  # For fresh start

# Functions
supabase functions deploy
supabase functions list
supabase functions logs seo-audit --follow

# Secrets
supabase secrets set KEY=value
supabase secrets list

# Build
npm run build
npm run dev
```

---

## Troubleshooting Quick Fixes

**Build fails:**
```bash
npm install --legacy-peer-deps
```

**Function not found:**
```bash
supabase functions deploy [function-name]
```

**CORS errors:**
- Check CORS headers in Edge Functions

**RLS errors:**
```sql
-- Grant admin role
INSERT INTO user_roles (user_id, role)
VALUES (auth.uid(), 'admin');
```

**API key errors:**
```bash
# Verify and reset
supabase secrets set PAGESPEED_INSIGHTS_API_KEY=your_key
```

---

## Estimated Time

- **Minimum Setup:** 1.5 hours (core features only)
- **Full Setup:** 3-4 hours (with optional integrations)
- **With Testing:** 4-5 hours (comprehensive testing)

---

## Support

- 📖 Full Guide: `SEO_DUPLICATION_GUIDE.md`
- 🏢 Enterprise Features: `ENTERPRISE_SEO_COMPLETE.md`
- 🔍 System Overview: `SEO_SYSTEM_OVERVIEW.md`
- 🚀 Quick Start: `QUICK_START_ADVANCED_SEO.md`

---

*Last Updated: 2025-11-05*
