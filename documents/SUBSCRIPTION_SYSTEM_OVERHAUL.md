# Subscription System Overhaul - Complete Guide

## 📋 Overview

This document outlines the comprehensive overhaul of the subscription system to create an "iron-clad" flow that prevents customer loss through proper handling of all subscription scenarios.

## 🎯 Key Problems Solved

### 1. **Complementary Subscriptions Now Fully Integrated**
- ✅ Admin-granted free subscriptions are now respected throughout the app
- ✅ Users with complementary access don't see upgrade prompts
- ✅ Complementary status is displayed with special badges and messaging
- ✅ System prevents direct upgrades for complementary users (requires admin intervention)

### 2. **Smart Upgrade Prompt Logic**
- ✅ Professional plan users (top tier) never see upgrade prompts
- ✅ Active users not exceeding limits see status display, not upgrade CTAs
- ✅ Complementary users never see upgrade prompts
- ✅ Usage-based prompts are context-aware

### 3. **Trial Management Enhanced**
- ✅ Visual countdown in subscription banner (not just emails)
- ✅ Urgency indicators for trials ending in 3 days or less
- ✅ Different styling for urgent vs. normal trial status
- ✅ Trial automation remains in place with email sequences

### 4. **Subscription State Machine**
- ✅ Centralized logic in `subscription-helpers.ts`
- ✅ All components use the same helper functions
- ✅ Consistent behavior across the app

### 5. **Onboarding Flows**
- ✅ Onboarding component for different subscription scenarios
- ✅ Free user onboarding
- ✅ Trial user onboarding
- ✅ Paid subscription welcome
- ✅ Complementary access onboarding
- ✅ Upgrade celebration flow

## 📂 Files Changed

### New Files Created

1. **`src/lib/subscription-helpers.ts`**
   - Central subscription logic library
   - Functions for determining upgrade eligibility
   - Subscription status helpers
   - CTA text generation
   - Urgency level calculation

2. **`src/components/subscription/SubscriptionOnboarding.tsx`**
   - Onboarding dialog for different subscription types
   - Step-by-step guidance for new users

3. **`supabase/migrations/20251107000000_fix_complementary_subscriptions.sql`**
   - Updated `get_usage_stats()` to check complementary subscriptions
   - New `has_active_complementary_subscription()` function
   - New `get_complementary_subscription()` function
   - Updated `user_subscription_dashboard` view

### Modified Files

1. **`src/hooks/useSubscription.ts`**
   - Added `is_complementary` and `complementary_subscription_id` to interface
   - Fetches complementary subscription data
   - Checks for complementary subscriptions when no regular subscription exists
   - Prevents upgrades for complementary users

2. **`src/hooks/useUsageStats.ts`**
   - Added `is_complementary` flag to `UsageStats` interface

3. **`src/components/SubscriptionStatusBanner.tsx`**
   - Complete rewrite using subscription helpers
   - Special banner for complementary subscriptions
   - Trial countdown with urgency styling
   - Professional plan special treatment
   - Smart upgrade button logic

4. **`src/components/subscription/UsageDashboard.tsx`**
   - Shows complementary badge when applicable
   - Suppresses upgrade prompts for complementary/top-tier users
   - Special message for complementary users approaching limits

## 🔧 Key Functions in `subscription-helpers.ts`

### `shouldShowUpgradePrompt(subscription)`
Determines if a user should see upgrade prompts.

**Returns `false` if:**
- User has complementary subscription
- User is on Professional (highest tier)
- Subscription is past_due or canceled

### `canUpgradeToPlan(currentSubscription, targetPlanName)`
Checks if user can upgrade to a specific plan.

**Returns `false` if:**
- User has complementary subscription (must contact admin)
- Target plan is same or lower tier

### `getSubscriptionCTA(subscription)`
Returns appropriate CTA text and action based on subscription state.

**Returns:**
```typescript
{
  text: string;          // "Upgrade Now", "Manage Plan", etc.
  action: string;        // 'upgrade', 'manage', 'reactivate', 'none'
  variant: string;       // Button variant
}
```

### `getSubscriptionUrgency(subscription)`
Calculates urgency level for UI styling.

**Returns:**
```typescript
{
  level: 'none' | 'low' | 'medium' | 'high' | 'critical';
  message?: string;
}
```

**Urgency Levels:**
- `critical` - Past due, trial ending today
- `high` - Canceled, trial ending tomorrow
- `medium` - Trial ending in 2-3 days, subscription ending soon
- `low` - Trial with 4+ days, free plan
- `none` - Active subscription, complementary

### `getTrialDaysRemaining(subscription)`
Returns number of days left in trial or `null`.

### `shouldShowUsageUpgradePrompt(subscription, usagePercentage)`
Determines if usage-based upgrade prompts should be shown.

**Returns `false` if:**
- User shouldn't see upgrade prompts at all
- Usage is below 75%

## 🎨 UI/UX Improvements

### Subscription Status Banner

#### Free Plan
- Light gradient background
- "Upgrade Now" CTA
- Friendly messaging

#### Trial Active (4+ days left)
- Blue gradient
- Days remaining countdown
- "Upgrade Today" CTA

#### Trial Ending Soon (≤3 days)
- Orange/red gradient (urgent)
- Prominent countdown
- "Upgrade Now" CTA (urgent style)
- More direct messaging

#### Active Subscription
- Green gradient
- Current plan display
- "Manage Plan" button
- "Upgrade" button (only if not Professional)

#### Complementary Subscription
- Purple gradient
- Gift icon badge
- "Complementary Access" label
- "View Details" button (no upgrade)
- Expiration date if applicable

#### Professional Plan
- Green gradient
- Checkmark icon
- "Active" badge
- No upgrade button
- "You have access to all premium features"

#### Canceled/Past Due
- Red gradient
- Clear action required message
- "Reactivate" or "Update Payment" CTA

### Usage Dashboard

#### Standard View
- Usage meters for all features
- "Upgrade Plan" button when approaching limits
- Color-coded status indicators

#### Complementary User View
- Purple "Complementary" badge next to plan name
- No upgrade buttons
- Different description: "Enjoy all features with complimentary access"
- Custom message if approaching limits: "Please contact support"

#### Professional Plan View
- No upgrade buttons
- Focus on usage tracking

## 🔄 Subscription Flow Scenarios

### 1. New Free User
1. Signs up → No subscription record
2. Banner shows: "Free Plan" with upgrade CTA
3. Usage dashboard shows: Free plan limits
4. Can trigger: Free user onboarding

### 2. Trial User
1. Starts trial → Subscription with `status: 'trialing'`
2. Banner shows: Days remaining with countdown
3. When ≤3 days: Urgent styling kicks in
4. Email automation: Day 3, Day 1, power user detection
5. Can trigger: Trial onboarding

### 3. Trial Conversion
1. User upgrades during trial
2. Status changes to `active`
3. Banner shows: Active subscription
4. Email: Welcome to premium
5. Can trigger: Paid onboarding

### 4. Active Paid User
1. Subscription status: `active`
2. Banner shows: Plan name with "Active" badge
3. If not Professional: Shows upgrade option
4. If Professional: No upgrade button
5. Usage dashboard: Context-aware prompts

### 5. Admin Grants Complementary Access

**Option A: User has no subscription**
1. Admin creates complementary_subscription record
2. System detects it via `get_complementary_subscription()`
3. Banner shows: Purple complementary banner
4. Usage dashboard: Shows complementary badge
5. No upgrade prompts anywhere
6. Can trigger: Complementary onboarding

**Option B: User has existing subscription**
1. Admin sets `is_complementary = true` on user_subscriptions
2. Links `complementary_subscription_id`
3. Same UI treatment as Option A

### 6. Usage Limit Approached

**Free/Paid User:**
1. Usage reaches 75%
2. Alert notification created
3. Usage dashboard shows upgrade button
4. Banner (if not already showing) can prompt upgrade

**Complementary User:**
1. Usage reaches 75%
2. Alert notification created
3. Usage dashboard shows info message
4. Message: "Contact support to adjust"
5. No upgrade buttons

**Professional Plan User:**
1. Usage reaches 75%
2. Alert notification created
3. No upgrade prompts (already top tier)
4. Just shows usage status

### 7. Subscription Cancellation
1. User clicks cancel
2. `cancel_at_period_end = true`
3. Banner shows: "Cancels at period end" badge
4. Displays end date
5. Can reactivate before period ends

### 8. Payment Failure
1. Stripe webhook: `invoice.payment_failed`
2. Status changes to `past_due`
3. Banner shows: Red urgent banner
4. CTA: "Update Payment Method"
5. Email: Payment failed notification

### 9. Plan Upgrade
1. User on Pro wants Family Plus
2. Clicks "Upgrade Plan"
3. Select new plan → Checkout
4. Stripe applies proration
5. Webhook updates subscription
6. Banner updates to new plan
7. Can trigger: Upgrade celebration onboarding

### 10. Complementary User Tries to Upgrade
1. User has `is_complementary = true`
2. Clicks any upgrade button
3. Hook prevents action
4. Toast: "You have complementary access. Please contact support to make changes."
5. No checkout flow initiated

## 🧪 Testing Checklist

- [ ] Free user sees upgrade prompts
- [ ] Trial user sees countdown
- [ ] Trial urgency styling works (≤3 days)
- [ ] Active user on Pro/Family Plus sees upgrade option
- [ ] Active user on Professional sees no upgrade option
- [ ] Complementary user sees purple banner
- [ ] Complementary user sees no upgrade buttons
- [ ] Complementary user cannot trigger upgrade flow
- [ ] Usage dashboard shows complementary badge
- [ ] Usage alerts suppressed for complementary users
- [ ] Past due user sees payment update prompt
- [ ] Canceled user sees reactivation option
- [ ] Onboarding triggers for each scenario
- [ ] get_usage_stats returns complementary flag
- [ ] Admin can grant complementary subscriptions
- [ ] Complementary expiration dates work
- [ ] Trial automation emails still send

## 🚀 Deployment Steps

1. **Run database migration:**
   ```bash
   # This migration will be auto-applied when you push
   # It updates get_usage_stats and adds new RPC functions
   ```

2. **Deploy edge functions:**
   ```bash
   supabase functions deploy manage-subscription
   supabase functions deploy stripe-webhook
   ```

3. **Test in production:**
   - Verify free user flow
   - Verify trial flow
   - Test complementary subscription grant
   - Test upgrade prevention for complementary users

## 📝 Usage Examples

### Using Subscription Helpers

```typescript
import {
  shouldShowUpgradePrompt,
  getSubscriptionCTA,
  getSubscriptionUrgency,
} from "@/lib/subscription-helpers";

// Check if user should see upgrade prompts
const showUpgrade = shouldShowUpgradePrompt(subscription);

// Get appropriate CTA
const cta = getSubscriptionCTA(subscription);
// { text: "Upgrade Now", action: "upgrade", variant: "default" }

// Get urgency level
const urgency = getSubscriptionUrgency(subscription);
// { level: "high", message: "Trial ends tomorrow" }
```

### Triggering Onboarding

```typescript
import { SubscriptionOnboarding } from "@/components/subscription/SubscriptionOnboarding";

// In your component
<SubscriptionOnboarding
  open={showOnboarding}
  onOpenChange={setShowOnboarding}
  onboardingType="trial" // or "free", "paid", "complementary", "upgrade"
  planName="Pro"
/>
```

### Checking for Complementary Access

```typescript
import { useSubscription } from "@/hooks/useSubscription";

const { subscription } = useSubscription();

if (subscription?.is_complementary) {
  // User has complementary access
  // Suppress upgrade prompts
  // Show special messaging
}
```

## 🔐 Security Considerations

1. **RLS Policies:**
   - Users can only view their own subscriptions
   - Admins can view all subscriptions
   - Complementary subscriptions have proper RLS

2. **Edge Function Authentication:**
   - All subscription operations require auth token
   - Stripe webhooks use signature verification

3. **Client-Side Checks:**
   - Upgrade prevention in useSubscription hook
   - Double-checked on server side

## 🐛 Common Issues & Solutions

### Issue: Complementary user sees upgrade prompts
**Solution:** Ensure `is_complementary` flag is set in database

### Issue: Professional user sees upgrade button
**Solution:** Check `shouldShowUpgradePrompt()` is being used

### Issue: Usage stats don't show complementary status
**Solution:** Run migration to update `get_usage_stats()` function

### Issue: Trial countdown not showing
**Solution:** Verify `trial_end` or `current_period_end` is set

## 📊 Metrics to Monitor

1. **Conversion Rates:**
   - Free → Trial
   - Trial → Paid
   - Plan upgrades

2. **Churn Indicators:**
   - Cancellations at period end
   - Past due subscriptions
   - Trial non-conversions

3. **Complementary Usage:**
   - Active complementary subscriptions
   - Complementary users approaching limits

4. **Support Tickets:**
   - Complementary users requesting changes
   - Billing issues
   - Upgrade confusion

## 🎉 Summary

The subscription system is now **iron-clad** with:

✅ Full complementary subscription support
✅ Smart, context-aware upgrade prompts
✅ Visual trial urgency indicators
✅ Comprehensive onboarding flows
✅ Centralized subscription logic
✅ Consistent UI/UX across all components
✅ Edge case handling for all scenarios

**Result:** Users see the right message at the right time, complementary users are respected, and no customers are lost due to confusing or inappropriate prompts.
