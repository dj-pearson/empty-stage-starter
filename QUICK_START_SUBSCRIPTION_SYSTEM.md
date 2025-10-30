# 🚀 Quick Start: Deploy Your New Subscription System

**Time to Deploy:** 15 minutes  
**Difficulty:** Easy - Just copy & paste!

---

## ✅ **Step 1: Apply Database Migration** (2 minutes)

1. Open Supabase Dashboard → **SQL Editor**
2. Copy & paste contents of `apply-stripe-columns.sql`
3. Click **Run** ✅
4. Copy & paste contents of `supabase/migrations/20251030000001_subscription_enhancements.sql`
5. Click **Run** ✅

**Verify:** Run this query to confirm:
```sql
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'subscription_plans' 
AND column_name IN ('stripe_price_id_monthly', 'stripe_price_id_yearly');
```
Should return 2 rows ✅

---

## ✅ **Step 2: Deploy Edge Functions** (3 minutes)

```bash
# Deploy webhook function (already updated)
supabase functions deploy stripe-webhook

# Deploy new subscription management function
supabase functions deploy manage-subscription
```

**Verify:** Check deployment at:
- https://supabase.com/dashboard/project/your-project/functions

---

## ✅ **Step 3: Add Stripe Webhook Secret** (2 minutes)

If you haven't already:

1. Go to Stripe Dashboard → Developers → Webhooks
2. Find your webhook endpoint
3. Copy the **Signing secret** (starts with `whsec_`)
4. Run:
```bash
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_your_secret_here
```

---

## ✅ **Step 4: Add UI Components to Your App** (5 minutes)

### Add Notification Bell to Header

```tsx
// In your header/navigation component (e.g., src/components/Layout.tsx)
import { NotificationBell } from "@/components/subscription/NotificationBell";

export function Header() {
  return (
    <header>
      {/* Your existing nav items */}
      <NotificationBell />  {/* Add this! */}
    </header>
  );
}
```

### Add Usage Dashboard to User Dashboard

```tsx
// In your dashboard page (e.g., src/pages/Dashboard.tsx)
import { UsageDashboard } from "@/components/subscription/UsageDashboard";

export default function Dashboard() {
  return (
    <div>
      <UsageDashboard />  {/* Add this at the top! */}
      {/* Your existing dashboard content */}
    </div>
  );
}
```

### Replace Subscription Dialog

```tsx
// Find where you use SubscriptionManagementDialog and replace:
// OLD:
import { SubscriptionManagementDialog } from "@/components/SubscriptionManagementDialog";

// NEW:
import { EnhancedSubscriptionDialog } from "@/components/subscription/EnhancedSubscriptionDialog";

// Usage stays the same!
<EnhancedSubscriptionDialog 
  open={showDialog}
  onOpenChange={setShowDialog}
  onSuccess={handleSuccess}
/>
```

---

## ✅ **Step 5: Test Everything** (3 minutes)

### Test 1: Check Usage Dashboard
1. Log into your app
2. Navigate to dashboard
3. You should see 4 usage meters (Children, Pantry Foods, AI Coach, Food Tracker)
4. Verify they show your actual usage ✅

### Test 2: Check Notifications
1. Click the bell icon in header
2. You should see dropdown (may be empty if no notifications yet)
3. Try triggering a limit (e.g., add children until you hit your limit)
4. A notification should appear ✅

### Test 3: Test Subscription Management
1. Click "Manage Subscription" button
2. Dialog should show current plan and available plans
3. Try selecting a different plan
4. Verify upgrade/downgrade options work ✅

---

## 🎉 **You're Done!**

Your subscription system is now live with:
- ✅ Real-time usage tracking
- ✅ Visual usage meters
- ✅ Automatic limit notifications
- ✅ Upgrade/downgrade flows
- ✅ Prorated billing
- ✅ Cancellation & reactivation

---

## 📱 **How It Works (For Users)**

### When Approaching Limits

1. **75% usage:** User sees yellow warning on usage meter + toast notification
2. **90% usage:** Orange warning + more urgent notification
3. **100% usage:** Red "Limit Reached" + upgrade required

### Upgrading

1. User clicks "Upgrade" button (appears on usage meters or in notifications)
2. Opens dialog showing available plans
3. Selects new plan and billing cycle
4. Confirms upgrade
5. Stripe charges prorated amount
6. Access granted immediately
7. Webhook updates database

### Downgrading

1. Same flow as upgrading
2. Change takes effect at end of billing period
3. User keeps access until then

### Canceling

1. User opens subscription dialog
2. Clicks "Cancel Subscription"
3. Confirms cancellation
4. Access continues until end of billing period
5. Can reactivate anytime before period ends

---

## 🔍 **Monitoring**

### Check Usage Patterns
```sql
-- See which features are most used
SELECT 
  feature_type,
  AVG(percentage) as avg_percentage
FROM (
  SELECT 
    'ai_coach' as feature_type,
    (stats.usage->'ai_coach'->>'percentage')::INTEGER as percentage
  FROM auth.users u
  CROSS JOIN LATERAL get_usage_stats(u.id) as stats
) subquery
GROUP BY feature_type;
```

### Check Conversion Rate
```sql
-- See how many limit alerts lead to upgrades
SELECT 
  DATE(ua.triggered_at) as date,
  COUNT(DISTINCT ua.user_id) as users_hit_limit,
  COUNT(DISTINCT se.user_id) as users_upgraded
FROM usage_alerts ua
LEFT JOIN subscription_events se 
  ON ua.user_id = se.user_id 
  AND se.event_type = 'upgraded'
  AND se.created_at >= ua.triggered_at
  AND se.created_at <= ua.triggered_at + INTERVAL '7 days'
WHERE ua.triggered_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE(ua.triggered_at)
ORDER BY date DESC;
```

---

## 🆘 **Need Help?**

### Common Issues

**Q: Usage meters not updating**  
A: Check browser console for real-time subscription errors

**Q: Notifications not appearing**  
A: Verify RLS policies are enabled on `subscription_notifications` table

**Q: Upgrade button does nothing**  
A: Check that `manage-subscription` edge function is deployed

**Q: "No price ID configured" error**  
A: Verify Stripe price IDs are set in `subscription_plans` table

---

## 📚 **Full Documentation**

For complete details, see:
- **SUBSCRIPTION_SYSTEM_IMPLEMENTATION.md** - Complete technical documentation
- **SUBSCRIPTION_FLOW_AUDIT_REPORT.md** - Original audit and fixes

---

**Questions?** Check the logs in:
- Supabase Dashboard → Functions → Logs
- Browser Console (F12)
- Stripe Dashboard → Webhooks → Event Logs

