# Migration Fixes - Schema Corrections (Updated)

**Date:** October 13, 2025  
**Issues:** Multiple schema mismatches in new migrations

---

## 🔴 Problems Encountered

### Issue 1: Incorrect Role Column Reference

**Error:** `ERROR: 42703: column profiles.role does not exist`

All migrations were referencing `profiles.role` which doesn't exist. Roles are stored in the `user_roles` table.

### Issue 2: Missing meal_plans Table

**Error:** `ERROR: 42P01: relation "meal_plans" does not exist`

The trigger was trying to log activity on a `meal_plans` table that doesn't exist in the schema.

### Issue 3: Email Column Location

**Error:** `ERROR: 42703: column p.email does not exist`

Views were trying to get `email` from `profiles` table, but email is stored in `auth.users` table.

---

## 📊 Root Causes

### Profiles Table Schema (Actual)

```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY,
  full_name TEXT NOT NULL,  -- ✅ Has this
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
-- ❌ No 'role' column
-- ❌ No 'email' column
```

### User Roles Schema (Actual)

```sql
CREATE TABLE user_roles (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  role app_role NOT NULL DEFAULT 'user',  -- ✅ Roles here!
  UNIQUE(user_id, role)
);
```

### Email Location (Actual)

- ❌ NOT in `profiles.email`
- ✅ Stored in `auth.users.email` (Supabase auth schema)

---

## ✅ Solutions Applied

### Fix 1: Role Checking (All 3 Migrations)

**Changed FROM:**

```sql
-- WRONG
SELECT 1 FROM profiles
WHERE profiles.id = auth.uid()
AND profiles.role = 'admin'  -- ❌ Column doesn't exist
```

**Changed TO:**

```sql
-- CORRECT
SELECT 1 FROM user_roles
WHERE user_roles.user_id = auth.uid()
AND user_roles.role = 'admin'  -- ✅ Correct table
```

### Fix 2: Removed Non-Existent Table Triggers

**In `20251013120000_admin_live_activity.sql`:**

**Removed triggers for:**

- ❌ `meal_plans` table (doesn't exist)
- ❌ `grocery_lists` table (doesn't exist)

**What Actually Exists:**

- ✅ `kid_meal_creations` (for meal builder)
- ✅ `grocery_items` (for grocery list items)

**Solution:** Commented out triggers with note that they can be added later via application code.

### Fix 3: Email Column References (2 Views)

**Changed to Join auth.users:**

**In `admin_activity_feed` view:**

```sql
-- BEFORE
FROM admin_live_activity a
LEFT JOIN profiles p ON p.id = a.user_id  -- ❌ No email here

-- AFTER
FROM admin_live_activity a
LEFT JOIN auth.users u ON u.id = a.user_id  -- ✅ Email here
LEFT JOIN profiles p ON p.id = a.user_id     -- ✅ Full name here

-- Now using
u.email,      -- From auth.users ✅
p.full_name   -- From profiles ✅
```

**In `ticket_queue` view:**

```sql
-- BEFORE
FROM support_tickets t
LEFT JOIN profiles p ON p.id = t.user_id  -- ❌ No email here

-- AFTER
FROM support_tickets t
LEFT JOIN auth.users u ON u.id = t.user_id  -- ✅ Email here
LEFT JOIN profiles p ON p.id = t.user_id     -- ✅ Full name here

-- Now using
u.email,      -- From auth.users ✅
p.full_name   -- From profiles ✅
```

---

## 📁 Files Fixed

### 1. `20251013120000_admin_live_activity.sql` ✅

**Total Changes: 6**

- ✅ 3 RLS policies (role checking)
- ✅ 1 view (email reference - admin_activity_feed)
- ✅ Removed 2 triggers (meal_plans, grocery_lists)

### 2. `20251013130000_feature_flags.sql` ✅

**Total Changes: 4**

- ✅ 3 RLS policies (role checking)
- ✅ 1 function (evaluate_feature_flag - role targeting)

### 3. `20251013140000_support_tickets.sql` ✅

**Total Changes: 4**

- ✅ 3 RLS policies (role checking)
- ✅ 1 view (email reference - ticket_queue)

---

## 📚 Database Schema Reference

**For future migrations, remember:**

| Data Needed    | Correct Table | Correct Column              |
| -------------- | ------------- | --------------------------- |
| User email     | `auth.users`  | `email`                     |
| User full name | `profiles`    | `full_name`                 |
| User roles     | `user_roles`  | `role` (enum)               |
| User ID        | All tables    | References `auth.users(id)` |

**Example Join Pattern:**

```sql
-- To get user email and full name:
FROM some_table t
LEFT JOIN auth.users u ON u.id = t.user_id    -- for email
LEFT JOIN profiles p ON p.id = t.user_id      -- for full_name
```

---

## ✅ Testing Checklist

After running the corrected migrations:

- [ ] Run `20251013120000_admin_live_activity.sql`
- [ ] Run `20251013130000_feature_flags.sql`
- [ ] Run `20251013140000_support_tickets.sql`
- [ ] Verify admin users can access Live Activity Feed
- [ ] Verify admin users can view System Health Dashboard
- [ ] Verify admin users can manage Alerts
- [ ] Verify admin users can create/edit Feature Flags
- [ ] Verify admin users can view Support Tickets
- [ ] Verify non-admin users CANNOT access admin features
- [ ] Verify email displays correctly in activity feed
- [ ] Verify email displays correctly in ticket queue
- [ ] Test feature flag evaluation with role targeting

---

## 🚀 Migration Order

Run migrations in this exact order:

1. ✅ `20251013120000_admin_live_activity.sql` (Fixed)
2. ✅ `20251013130000_feature_flags.sql` (Fixed)
3. ✅ `20251013140000_support_tickets.sql` (Fixed)

---

## 📊 Summary Table

| Issue                            | Solution                    | Files Affected   |
| -------------------------------- | --------------------------- | ---------------- |
| `profiles.role` doesn't exist    | Use `user_roles` table      | All 3 migrations |
| `profiles.email` doesn't exist   | Join `auth.users` for email | 2 migrations     |
| `meal_plans` table doesn't exist | Removed/commented triggers  | 1 migration      |

---

## 🔍 Verification Queries

**Check admin role:**

```sql
SELECT EXISTS (
  SELECT 1 FROM user_roles
  WHERE user_roles.user_id = auth.uid()
  AND user_roles.role = 'admin'
);
```

**Check email retrieval:**

```sql
SELECT
  u.email,
  p.full_name
FROM auth.users u
LEFT JOIN profiles p ON p.id = u.id
WHERE u.id = auth.uid();
```

---

**Status:** ✅ All 3 migrations corrected and ready for deployment  
**Issues Fixed:** 3 (Role checking, Email location, Missing tables)  
**Files Modified:** 3  
**Total Changes:** 14 fixes  
**Last Updated:** October 13, 2025
