# Blog System Deployment Checklist

Quick reference checklist for deploying the advanced blog system to a new site.

---

## Pre-Deployment (15 minutes)

### 1. Gather Information
- [ ] Domain name: `________________`
- [ ] Supabase project created: `________________`
- [ ] OpenAI API key: `sk-________________`
- [ ] Site name/brand: `________________`
- [ ] Primary niche/topic: `________________`

### 2. Prepare Content
- [ ] Create 50-100 niche-specific titles in `Blog_Titles.md`
- [ ] Prepare brand assets (logos, default image)
- [ ] Write site description and meta defaults

---

## Database Setup (30 minutes)

### Run Migrations

- [ ] Login to Supabase: https://app.supabase.com
- [ ] Navigate to SQL Editor
- [ ] Run Migration 1: `20251008144000_create_blog_tables.sql`
  - Creates core tables
  - **Verification:** `SELECT COUNT(*) FROM blog_posts;` returns 0
- [ ] Run Migration 2: `20251013150000_blog_uniqueness_tracking.sql`
  - Creates title bank and tracking
  - **Verification:** `SELECT COUNT(*) FROM blog_title_bank;` returns 0
- [ ] Run Migration 3: `20250109000000_add_featured_image_to_blog.sql`
  - Adds featured image support
  - **Verification:** `SELECT column_name FROM information_schema.columns WHERE table_name='blog_posts' AND column_name='featured_image';`
- [ ] Run Migration 4: `20250112000000_blog_advanced_features.sql`
  - Creates all advanced features
  - **Verification:** `SELECT COUNT(*) FROM information_schema.tables WHERE table_name LIKE 'blog_%';` returns 35+

### Configure Admin Access

- [ ] Get your user ID: `SELECT id FROM auth.users WHERE email = 'your@email.com';`
- [ ] Grant admin: `INSERT INTO user_roles (user_id, role) VALUES ('your-user-id', 'admin');`
- [ ] Verify: `SELECT * FROM user_roles WHERE role = 'admin';`

---

## Edge Functions Deployment (20 minutes)

### Install & Configure

- [ ] Install Supabase CLI: `npm install -g supabase`
- [ ] Login: `supabase login`
- [ ] Link project: `supabase link --project-ref YOUR_REF`

### Set Environment Variables

Supabase Dashboard → Project Settings → Edge Functions:

- [ ] `OPENAI_API_KEY` = `sk-...`
- [ ] `SUPABASE_URL` = `https://xxx.supabase.co`
- [ ] `SUPABASE_SERVICE_ROLE_KEY` = `eyJ...`

### Deploy Functions

Run each command:

```bash
# Core functions (required)
supabase functions deploy generate-blog-content
supabase functions deploy manage-blog-titles
supabase functions deploy generate-social-content

# Advanced functions (recommended)
supabase functions deploy analyze-blog-quality
supabase functions deploy track-engagement
supabase functions deploy generate-schema-markup
supabase functions deploy repurpose-content

# Optional functions
supabase functions deploy test-blog-webhook
supabase functions deploy update-blog-image
```

- [ ] All core functions deployed
- [ ] All advanced functions deployed
- [ ] Verify: `supabase functions list` shows all

### Test Functions

- [ ] Test generate-blog-content: Click "AI Generate" in admin UI
- [ ] Test analyze-blog-quality: Click "Analyze Quality" on a post
- [ ] Test track-engagement: Visit a blog post, check console

---

## Frontend Setup (30 minutes)

### Install Dependencies

```bash
npm install @supabase/supabase-js react-markdown remark-gfm rehype-raw date-fns
```

- [ ] Dependencies installed
- [ ] No errors

### Environment Variables

Create/update `.env.local`:

```env
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_SITE_NAME=YourSiteName
VITE_SITE_URL=https://yourdomain.com
```

- [ ] All variables set
- [ ] Tested: `console.log(import.meta.env.VITE_SUPABASE_URL)`

### Copy Components

Ensure these files exist:

- [ ] `src/components/admin/BlogCMSManager.tsx`
- [ ] `src/components/admin/BlogInternalLinker.tsx`
- [ ] `src/components/blog/ReadingProgress.tsx`
- [ ] `src/pages/Blog.tsx`
- [ ] `src/pages/BlogPost.tsx`

### Update Routes

- [ ] Add `/blog` route
- [ ] Add `/blog/:slug` route
- [ ] Test navigation

### Customize Branding

- [ ] Replace `public/Logo-Green.png`
- [ ] Replace `public/Logo-White.png`
- [ ] Replace `public/Cover.png`
- [ ] Update site name in components
- [ ] Update SEO defaults in `src/lib/seo-config.ts`

### Update Categories

- [ ] Review default categories (Picky Eaters, Meal Planning, etc.)
- [ ] Add/remove categories for your niche
- [ ] Update category descriptions

```sql
-- Add new category
INSERT INTO blog_categories (name, slug, description)
VALUES ('Your Category', 'your-category', 'Description here');

-- Or update existing
UPDATE blog_categories
SET name = 'New Name', description = 'New description'
WHERE slug = 'existing-slug';
```

---

## Content Setup (15 minutes)

### Import Title Bank

- [ ] Go to Admin Panel → Blog CMS
- [ ] Click "Title Bank" button
- [ ] Navigate to "Import" tab
- [ ] Click "Import Titles from Blog_Titles.md"
- [ ] Verify: Should show "Successfully added X titles"
- [ ] Check Overview: Should show X unused titles

### Generate Test Posts

- [ ] Click "AI Generate Article"
- [ ] Enable "Use Title Bank"
- [ ] Leave topic blank
- [ ] Add 1-2 keywords
- [ ] Click "Generate"
- [ ] Verify: Post created as draft
- [ ] **Repeat 2-3 times** to test variety

### Publish First Post

- [ ] Edit generated post
- [ ] Review and improve content
- [ ] Add featured image
- [ ] Run "Analyze Quality"
- [ ] Fix any issues
- [ ] Set status to "published"
- [ ] Set publish date to now
- [ ] Save
- [ ] Visit `/blog/post-slug` to verify

---

## SEO Setup (20 minutes)

### Google Search Console

- [ ] Go to: https://search.google.com/search-console
- [ ] Add property: `https://yourdomain.com`
- [ ] Verify ownership (DNS/HTML tag)
- [ ] Submit sitemap: `https://yourdomain.com/sitemap.xml`

### Schema Markup

- [ ] Visit a published post
- [ ] View page source
- [ ] Verify JSON-LD schema present
- [ ] Test with Rich Results: https://search.google.com/test/rich-results
- [ ] Should validate: Article, Breadcrumb schemas

### Meta Tags

- [ ] Check `<title>` tag
- [ ] Check `<meta name="description">`
- [ ] Check Open Graph tags (`og:title`, `og:image`, etc.)
- [ ] Check Twitter Card tags
- [ ] Test with: https://www.opengraph.xyz/

### Performance

- [ ] Test with PageSpeed Insights: https://pagespeed.web.dev/
- [ ] Target: 90+ score
- [ ] Check Core Web Vitals: All green

---

## Deployment (30 minutes)

### Build & Test Locally

```bash
npm run build
npm run preview
```

- [ ] Build succeeds with no errors
- [ ] Local preview works
- [ ] All pages load
- [ ] Blog listing works
- [ ] Individual posts work
- [ ] Admin panel works

### Deploy to Hosting

**CloudFlare Pages (Recommended):**

```bash
# Connect repository
# Set build command: npm run build
# Set output directory: dist
# Set environment variables (copy from .env.local)
```

- [ ] Connected to GitHub/GitLab
- [ ] Build settings configured
- [ ] Environment variables set
- [ ] Deploy triggered
- [ ] Deployment successful
- [ ] Visit preview URL

**Alternative: Vercel/Netlify**

- [ ] Follow platform-specific instructions
- [ ] Configure environment variables
- [ ] Deploy

### Configure Custom Domain

- [ ] Add custom domain in hosting dashboard
- [ ] Update DNS records (provided by host)
- [ ] Wait for DNS propagation (5-60 minutes)
- [ ] Verify HTTPS certificate
- [ ] Test: `https://yourdomain.com`

---

## Post-Deployment Testing (20 minutes)

### Functionality Tests

- [ ] Homepage loads
- [ ] Navigate to Blog page (`/blog`)
- [ ] Click on a blog post
- [ ] Reading progress bar appears and updates
- [ ] Table of contents generates
- [ ] Social share buttons work
- [ ] Navigate to Admin Panel
- [ ] Title Bank shows correct stats
- [ ] Can create/edit posts
- [ ] AI generation works
- [ ] Quality analysis works

### SEO Tests

- [ ] View page source on blog post
- [ ] Verify schema markup present
- [ ] Test with Google Rich Results Test
- [ ] Check sitemap: `/sitemap.xml`
- [ ] Check RSS feed: `/blog/rss` (if implemented)
- [ ] Canonical URLs correct
- [ ] Meta tags correct on all pages

### Analytics Tests

- [ ] Visit blog post
- [ ] Scroll to 50%
- [ ] Check Supabase: `SELECT * FROM blog_engagement_events ORDER BY event_timestamp DESC LIMIT 5;`
- [ ] Should see `scroll_25`, `scroll_50` events

### Performance Tests

- [ ] Run PageSpeed Insights
- [ ] Score 90+ on mobile
- [ ] Score 90+ on desktop
- [ ] Core Web Vitals: All passing
- [ ] No console errors

---

## Ongoing Setup (Optional)

### Analytics Integration

- [ ] Google Analytics 4
  - Create property
  - Add tracking code
  - Verify events

- [ ] Google Tag Manager (Optional)
  - Create container
  - Add GTM code
  - Configure tags

### Newsletter Integration

- [ ] Choose provider (SendGrid, Mailgun, ConvertKit, etc.)
- [ ] Create API key
- [ ] Configure webhook/API integration
- [ ] Test email capture
- [ ] Test auto-send on publish

### Social Media Automation

- [ ] Set up Make.com or Zapier
- [ ] Create workflow:
  - Trigger: Blog post published (webhook)
  - Actions: Post to Twitter, LinkedIn, Facebook, etc.
- [ ] Test with a publish

### Monitoring & Alerts

- [ ] Set up uptime monitoring (UptimeRobot, etc.)
- [ ] Configure error tracking (Sentry, etc.)
- [ ] Set up performance monitoring
- [ ] Create alert for failed deployments

---

## Final Checklist

### Before Going Live

- [ ] At least 3-5 posts published
- [ ] All posts have featured images
- [ ] All posts have proper SEO (title, description, keywords)
- [ ] Categories and tags configured
- [ ] Title bank populated (50+ titles)
- [ ] Admin access working
- [ ] AI generation tested and working
- [ ] Analytics tracking verified
- [ ] SEO schema validated
- [ ] Performance: 90+ PageSpeed score
- [ ] No console errors
- [ ] Mobile responsive
- [ ] HTTPS enabled

### Post-Launch (First Week)

- [ ] Monitor error logs daily
- [ ] Check analytics daily
- [ ] Publish 2-3 posts
- [ ] Submit to search engines
- [ ] Share on social media
- [ ] Monitor for indexing (Google Search Console)

### Post-Launch (First Month)

- [ ] Publish 8-12 posts
- [ ] Review analytics weekly
- [ ] Identify top performers
- [ ] Optimize underperformers
- [ ] Build email list
- [ ] Engage with comments
- [ ] Monitor SEO rankings

---

## Troubleshooting

If something doesn't work, check:

1. **Database:**
   - All migrations ran?
   - Admin role set?
   - RLS policies working?

2. **Edge Functions:**
   - Deployed successfully?
   - Environment variables set?
   - API keys valid?

3. **Frontend:**
   - Environment variables set?
   - Components copied correctly?
   - Routes configured?
   - Build successful?

4. **SEO:**
   - Schema markup in HTML?
   - Meta tags present?
   - Images have absolute URLs?

5. **Performance:**
   - Images optimized?
   - Lazy loading enabled?
   - CDN configured?

For detailed troubleshooting, see `BLOG_SYSTEM_REPLICATION_GUIDE.md` Section 9.

---

## Time Estimates

- **First Site:** 3-4 hours (includes learning)
- **Subsequent Sites:** 2 hours (process is familiar)
- **Ongoing:** 2-3 hours/week for content

---

## Success! 🎉

Once all checkboxes are complete, your advanced blog system is live!

**Next Steps:**
1. Create content consistently (2-3 posts/week)
2. Monitor analytics weekly
3. Optimize based on data
4. Build your email list
5. Engage with your audience

**For detailed feature usage, see:** `BLOG_FEATURES_REFERENCE.md`
**For technical details, see:** `BLOG_SYSTEM_REPLICATION_GUIDE.md`

---

**Deployment Date:** `________________`
**Deployed By:** `________________`
**Notes:** `________________`
