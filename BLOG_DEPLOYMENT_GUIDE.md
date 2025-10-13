# Quick Start: Deploying Blog Uniqueness System

## Prerequisites

- Supabase CLI installed and authenticated
- Local database connected to Supabase project

## Deployment Steps

### 1. Apply Database Migration

```bash
# Push the new migration to Supabase
supabase db push
```

**Expected Result:** Migration `20251013150000_blog_uniqueness_tracking.sql` applied successfully.

**Verification:**

```sql
-- Run in SQL editor to verify tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('blog_title_bank', 'blog_content_tracking', 'blog_generation_history');
```

### 2. Deploy Edge Functions

```bash
# Deploy the new title management function
supabase functions deploy manage-blog-titles

# Redeploy the enhanced blog generation function
supabase functions deploy generate-blog-content
```

**Expected Result:** Both functions deployed successfully.

**Verification:**

```bash
# List deployed functions
supabase functions list
```

### 3. Build & Deploy Frontend

```bash
# Build the frontend with updated BlogCMSManager
npm run build

# If using Cloudflare Pages, deploy
npm run deploy
# OR use your deployment method
```

**Expected Result:** Build completes without errors, new UI deployed.

## First Time Setup (Admin)

### 1. Import Blog Titles

1. Navigate to: **Admin Panel → Blog CMS**
2. Click **"Title Bank"** button (top right)
3. Go to **"Import"** tab
4. Click **"Import Titles from Blog_Titles.md"**
5. Wait for success message: "Successfully added 89 new titles..."

### 2. Verify Title Bank

1. Go to **"Overview"** tab
2. Check **"Unused Titles"** count = 89
3. Check **"Total Titles"** = 89
4. Verify insights loaded correctly

### 3. Test Blog Generation

**Test 1: Auto-Select from Title Bank**

1. Click **"AI Generate Article"**
2. Ensure **"Use Title Bank"** checkbox is ENABLED
3. Leave **"Topic or Title"** field BLANK
4. Click **"Generate Article"**
5. Wait for generation (30-60 seconds)
6. Verify: New draft post created with unique title
7. Check Title Bank: Unused titles should now be 88

**Test 2: Manual Topic**

1. Click **"AI Generate Article"**
2. DISABLE **"Use Title Bank"** checkbox
3. Enter custom topic: "Test Blog Post About Healthy Snacks"
4. Click **"Generate Article"**
5. Verify: Post created with custom title

**Test 3: Duplicate Detection**

1. Note the title of a recently generated post
2. Try to generate again with same or very similar title
3. Should see warning: "This topic is too similar to an existing post"
4. Verify: No duplicate post created

## Verification Checklist

- [ ] Migration applied without errors
- [ ] Both edge functions deployed
- [ ] Frontend built and deployed
- [ ] Can access Admin → Blog CMS
- [ ] Title Bank button visible in header
- [ ] Can open Title Bank dialog
- [ ] Import from Blog_Titles.md works
- [ ] Insights show correct counts
- [ ] Suggestions tab loads recommendations
- [ ] AI Generation with title bank enabled works
- [ ] Unused title count decrements after generation
- [ ] Duplicate detection prevents similar titles
- [ ] Can generate with custom topics (title bank disabled)

## Troubleshooting

### Migration Fails

**Error:** `relation already exists`

- **Cause:** Migration already applied or partially applied
- **Fix:** Check if tables exist, if so, migration already done

**Error:** `function does not exist: levenshtein`

- **Cause:** PostgreSQL `fuzzystrmatch` extension not enabled
- **Fix:** Run: `CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;`

### Edge Function Deploy Fails

**Error:** `Authentication failed`

- **Fix:** Run `supabase login` to re-authenticate

**Error:** `Project not linked`

- **Fix:** Run `supabase link --project-ref YOUR_PROJECT_REF`

### Title Import Fails

**Error:** "Could not parse Blog_Titles.md"

- **Check:** File exists at project root
- **Check:** Valid JSON format in file
- **Format:** `{"blog_titles": ["Title 1", "Title 2", ...]}`

### Insights Not Loading

**Error:** Empty insights or errors in console

- **Check:** User is admin (check `user_roles` table)
- **Check:** RLS policies allow admin access
- **Fix:** Add user to user_roles with role='admin'

## Rollback (If Needed)

### Rollback Migration

```bash
# NOT RECOMMENDED - Data loss will occur
# Only use if critical issue and no data generated yet

# Create rollback migration
supabase migration new rollback_blog_uniqueness

# Add to rollback file:
# DROP TABLE IF EXISTS blog_generation_history CASCADE;
# DROP TABLE IF EXISTS blog_content_tracking CASCADE;
# DROP TABLE IF EXISTS blog_title_bank CASCADE;
# DROP FUNCTION IF EXISTS normalize_title CASCADE;
# ... (drop all functions)

supabase db push
```

### Revert Edge Functions

```bash
# Redeploy previous versions from git history
git checkout <previous-commit> -- supabase/functions/
supabase functions deploy manage-blog-titles
supabase functions deploy generate-blog-content
```

### Revert Frontend

```bash
# Redeploy previous version
git checkout <previous-commit> -- src/components/admin/BlogCMSManager.tsx
npm run build
npm run deploy
```

## Support

If you encounter issues:

1. Check Supabase logs: **Dashboard → Edge Functions → Logs**
2. Check browser console for frontend errors
3. Check database logs: **Dashboard → Database → Logs**
4. Refer to `BLOG_UNIQUENESS_SYSTEM_SUMMARY.md` for detailed documentation

## Next Steps After Deployment

1. **Generate First Batch:** Create 5-10 blog posts using title bank
2. **Monitor:** Check that titles rotate and no duplicates occur
3. **Optimize:** Adjust similarity thresholds if needed
4. **Scale:** Set up automated blog generation schedule
5. **Analyze:** Track which titles drive best SEO performance

---

**Deployment Status:** Ready to Deploy
**Estimated Time:** 10-15 minutes
**Risk Level:** Low (new tables, existing data unaffected)
