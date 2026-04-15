# 🔧 Migration Fix Guide

## Issue Fixed

The initial migration had incorrect RLS policies that referenced `profiles.is_admin` which doesn't exist in your schema.

**Your schema uses:** `user_roles` table with `role = 'admin'::app_role`

✅ **Status:** Migration file has been corrected!

---

## What Was Changed

All RLS policies in `20251106000000_advanced_seo_features.sql` were updated from:

```sql
-- ❌ INCORRECT (was using profiles.is_admin)
EXISTS (
  SELECT 1 FROM profiles
  WHERE profiles.id = auth.uid()
  AND profiles.is_admin = true
)
```

To:

```sql
-- ✅ CORRECT (now using user_roles)
EXISTS (
  SELECT 1 FROM user_roles
  WHERE user_roles.user_id = auth.uid()
  AND user_roles.role = 'admin'::app_role
)
```

---

## How to Apply the Fixed Migration

### Option 1: Using Supabase CLI (Recommended)

```bash
# Navigate to your project
cd C:\Users\dpearson\Documents\EatPal\empty-stage-starter

# Apply the migration
supabase db push
```

### Option 2: Manual SQL Execution

1. Go to Supabase Dashboard: https://supabase.com/dashboard
2. Select your project
3. Go to **SQL Editor**
4. Copy the entire contents of `supabase/migrations/20251106000000_advanced_seo_features.sql`
5. Paste into SQL Editor
6. Click **Run**

### Option 3: Using Supabase Studio

1. Open Supabase Studio
2. Navigate to **SQL Editor**
3. Upload `20251106000000_advanced_seo_features.sql`
4. Execute

---

## Verify Migration Success

After applying the migration, verify it worked:

```sql
-- Check that all 6 new tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN (
  'seo_core_web_vitals',
  'seo_backlinks',
  'seo_backlink_history',
  'seo_broken_links',
  'seo_serp_tracking',
  'seo_content_analysis'
);
```

Should return 6 rows.

```sql
-- Check that helper functions exist
SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name IN (
  'get_core_web_vitals_trend',
  'get_backlink_summary',
  'get_broken_links_by_priority',
  'get_serp_position_changes'
);
```

Should return 4 rows.

---

## Admin Access Setup

To access the SEO features, your user needs admin role:

### Check Your Current Role

```sql
SELECT * FROM user_roles WHERE user_id = auth.uid();
```

### Grant Admin Role (if needed)

```sql
-- Replace YOUR_USER_ID with your actual user ID
INSERT INTO user_roles (user_id, role)
VALUES ('YOUR_USER_ID', 'admin'::app_role)
ON CONFLICT (user_id, role) DO NOTHING;
```

### Get Your User ID

```sql
SELECT id, email FROM auth.users WHERE email = 'your-email@example.com';
```

Or from the frontend:
```typescript
const { data: { user } } = await supabase.auth.getUser();
console.log('User ID:', user?.id);
```

---

## Troubleshooting

### Error: "relation user_roles does not exist"

**Solution:** The `user_roles` table should exist from earlier migrations. Check:

```sql
SELECT * FROM user_roles LIMIT 1;
```

If it doesn't exist, run this first:

```sql
-- Create enum for user roles (if not exists)
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'user');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create user_roles table (if not exists)
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL DEFAULT 'user',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, role)
);

-- Enable RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create helper function
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;
```

### Error: "permission denied for table"

**Solution:** Make sure you have admin role assigned (see "Admin Access Setup" above).

### Error: "function get_backlink_summary() does not exist"

**Solution:** The migration didn't complete. Rerun the migration file.

---

## Next Steps After Migration

1. ✅ Migration applied successfully
2. ✅ Admin role granted
3. 🔄 Deploy Edge Functions:
   ```bash
   supabase functions deploy check-core-web-vitals
   supabase functions deploy check-broken-links
   supabase functions deploy analyze-content
   supabase functions deploy sync-backlinks
   supabase functions deploy track-serp-positions
   ```

4. 🔄 Get FREE PageSpeed API key (see `API_SETUP_GUIDE.md`)

5. 🔄 Test the features (see `QUICK_START_ADVANCED_SEO.md`)

---

## Summary

- ✅ Migration file corrected
- ✅ RLS policies now use `user_roles` table
- ✅ Compatible with existing schema
- ✅ Ready to deploy!

**Next:** Follow the deployment instructions in `QUICK_START_ADVANCED_SEO.md`
