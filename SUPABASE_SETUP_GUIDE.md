# 🔧 Supabase Migration & Types Setup Guide

## Issue Summary
Your local migrations folder has `20251014000000_grocery_recipe_phase1.sql` but the remote database has a different migration history. The CLI is detecting a mismatch.

## ✅ What We've Done
1. **Generated TypeScript types** - Successfully created `src/integrations/supabase/types.ts` from your remote database
2. **Identified the issue** - Migration history mismatch between local and remote

## 📋 Steps to Apply the Phase 1 Migration

### Option 1: Use Supabase Dashboard (Recommended)

1. **Open the Supabase SQL Editor:**
   - Go to: https://supabase.com/dashboard/project/tbuszxkevkpjcjapbrir/sql/new

2. **Copy the migration SQL:**
   - Open: `supabase/migrations/20251014000000_grocery_recipe_phase1.sql`
   - Copy ALL the contents

3. **Run in SQL Editor:**
   - Paste the SQL into the editor
   - Click "Run" button
   - Wait for completion (should take ~5-10 seconds)

4. **Verify tables were created:**
   - Go to Table Editor
   - Check for new tables:
     - `recipe_collections`
     - `recipe_collection_items`
     - `grocery_lists`
     - `store_layouts`
     - `store_aisles`
     - And others from the migration

5. **Mark migration as applied locally:**
   ```bash
   supabase migration repair --status applied 20251014000000
   ```

### Option 2: Reset Local Migration History (Nuclear Option)

If you want to completely sync local with remote:

```bash
# 1. Backup your current migration file
copy supabase\migrations\20251014000000_grocery_recipe_phase1.sql supabase\migrations\BACKUP_20251014000000_grocery_recipe_phase1.sql

# 2. Delete all local migrations
del supabase\migrations\*.sql

# 3. Pull migrations from remote
supabase db pull

# 4. Copy back your new migration
copy supabase\migrations\BACKUP_20251014000000_grocery_recipe_phase1.sql supabase\migrations\20251014000000_grocery_recipe_phase1.sql

# 5. Push the new migration
supabase db push
```

## 🎯 Quick Commands Reference

### Generate Types (already done ✅)
```bash
supabase gen types typescript --linked > src/integrations/supabase/types.ts
```

### Check Status
```bash
supabase status
```

### List Projects
```bash
supabase projects list
```

### Push Migrations (after applying via dashboard)
```bash
supabase db push
```

### Mark Migration as Applied
```bash
supabase migration repair --status applied 20251014000000
```

## 📦 What the Phase 1 Migration Does

The `20251014000000_grocery_recipe_phase1.sql` migration adds:

### New Tables
- `recipe_collections` - Recipe organization folders
- `recipe_collection_items` - Many-to-many recipe-collection links
- `grocery_lists` - Multiple grocery lists support
- `store_layouts` - Custom store configurations
- `store_aisles` - Aisle definitions per store
- `food_aisle_mappings` - Food-to-aisle assignments
- `recipe_photos` - Recipe image storage
- `recipe_attempts` - Recipe usage tracking
- `shopping_sessions` - Collaborative shopping
- `grocery_purchase_history` - Purchase tracking

### Enhanced Tables
- `recipes` - Added 10+ new columns (image_url, rating, tags, etc.)
- `grocery_items` - Added 7 new columns (photo_url, notes, barcode, etc.)

### Indexes & Policies
- Performance indexes on all tables
- Row Level Security (RLS) policies
- Household-level permissions

## ⚠️ Important Notes

1. **Don't run the migration twice** - It will error if tables already exist
2. **Backup first** - Always backup before major schema changes
3. **Test on staging** - If you have a staging environment, test there first
4. **RLS is enabled** - All new tables have Row Level Security enabled

## 🔍 Troubleshooting

### Error: "relation already exists"
- The tables were already created
- Mark the migration as applied: `supabase migration repair --status applied 20251014000000`

### Error: "permission denied"
- Check you're logged in: `supabase login`
- Verify project link: `supabase projects list`

### Types not updating
- Regenerate types: `supabase gen types typescript --linked > src/integrations/supabase/types.ts`
- Restart your IDE/dev server

## ✅ Success Checklist

- [ ] Phase 1 migration SQL run in Supabase dashboard
- [ ] All new tables visible in Table Editor
- [ ] Migration marked as applied locally
- [ ] TypeScript types generated (already done ✅)
- [ ] Dev server restarted
- [ ] No TypeScript errors in IDE

## 📞 Next Steps

After applying the migration:

1. **Restart your dev server** - Pick up new types
2. **Test the new features** - Use the testing guides
3. **Verify real-time sync** - Test with multiple browser tabs
4. **Check RLS policies** - Ensure permissions work correctly

---

## 🎉 You're Almost There!

Once you run the migration SQL in the Supabase dashboard, all the Phase 2-4 features will be database-ready!

