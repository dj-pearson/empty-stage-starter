# Migration Fixes - Role Schema Correction

**Date:** October 13, 2025  
**Issue:** Database migrations failed due to incorrect role column reference

## Problem

All three new migrations were referencing `profiles.role` which doesn't exist in the database schema. The EatPal platform stores user roles in a separate `user_roles` table instead.

## Error Message

```
ERROR: 42703: column profiles.role does not exist
```

## Root Cause

The migrations assumed roles were stored as a column on the `profiles` table:

```sql
-- INCORRECT
SELECT 1 FROM profiles
WHERE profiles.id = auth.uid()
AND profiles.role = 'admin'
```

But the actual schema stores roles in a junction table:

```sql
-- Schema
CREATE TABLE user_roles (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  role app_role NOT NULL DEFAULT 'user',
  UNIQUE(user_id, role)
);
```

## Solution

Updated all RLS policies in the three migrations to use the correct `user_roles` table:

```sql
-- CORRECT
SELECT 1 FROM user_roles
WHERE user_roles.user_id = auth.uid()
AND user_roles.role = 'admin'
```

## Files Fixed

### 1. `20251013120000_admin_live_activity.sql`

**Changes:** 3 policies updated

- `admin_live_activity` - "Admins can view all activity"
- `admin_alerts` - "Admins can view all alerts" + "Admins can update alerts"
- `admin_system_health` - "Admins can view system health"

### 2. `20251013130000_feature_flags.sql`

**Changes:** 4 locations updated

- `feature_flags` - "Admins can manage all flags"
- `feature_flag_evaluations` - "Admins can view all evaluations"
- `feature_flag_analytics` - "Admins can view flag analytics"
- `evaluate_feature_flag()` function - User role targeting logic

### 3. `20251013140000_support_tickets.sql`

**Changes:** 3 policies updated

- `support_tickets` - "Admins can view all tickets" + "Admins can update all tickets"
- `ticket_messages` - "Admins can view all messages" + "Admins can create messages"
- `ticket_canned_responses` - "Admins can manage canned responses"

## Testing Checklist

After running the corrected migrations:

- [ ] Verify admin users can access Live Activity Feed
- [ ] Verify admin users can view System Health Dashboard
- [ ] Verify admin users can manage Alerts
- [ ] Verify admin users can create/edit Feature Flags
- [ ] Verify admin users can view Support Tickets
- [ ] Verify non-admin users CANNOT access admin features
- [ ] Test feature flag evaluation with role targeting

## Migration Order

Run migrations in this order:

1. `20251013120000_admin_live_activity.sql` ✅ Fixed
2. `20251013130000_feature_flags.sql` ✅ Fixed
3. `20251013140000_support_tickets.sql` ✅ Fixed

## Notes

- The `user_roles` table allows multiple roles per user (many-to-many relationship)
- Role checking should always use `EXISTS` with `user_roles` table
- The `app_role` enum type includes: 'user', 'admin', etc.

## Verification Query

To verify admin role checking works:

```sql
-- Check if current user is admin
SELECT EXISTS (
  SELECT 1 FROM user_roles
  WHERE user_roles.user_id = auth.uid()
  AND user_roles.role = 'admin'
);
```

---

**Status:** ✅ All migrations corrected and ready for deployment
