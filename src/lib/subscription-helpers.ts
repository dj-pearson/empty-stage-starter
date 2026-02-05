/**
 * Subscription Helper Utilities
 *
 * Centralized logic for subscription status checking, upgrade eligibility,
 * and complementary subscription handling to ensure iron-clad consistency
 * across the application.
 */

export interface SubscriptionData {
  id?: string;
  user_id?: string;
  plan_id?: string;
  plan_name: string;
  status: string | null;
  billing_cycle?: string | null;
  current_period_start?: string | null;
  current_period_end?: string | null;
  cancel_at_period_end?: boolean;
  trial_end?: string | null;
  is_complementary?: boolean;
  complementary_subscription_id?: string | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
}

export interface ComplementarySubscription {
  id: string;
  status: string;
  is_permanent: boolean;
  end_date: string | null;
}

export type PlanTier = 'Free' | 'Pro' | 'Family Plus' | 'Professional';

export const PLAN_HIERARCHY: Record<PlanTier, number> = {
  'Free': 0,
  'Pro': 1,
  'Family Plus': 2,
  'Professional': 3,
};

/**
 * Determines if a user should see upgrade prompts
 * Returns false if:
 * - User has complementary (free) subscription
 * - User is on highest tier (Professional)
 * - User's subscription is past_due or canceled
 */
export function shouldShowUpgradePrompt(subscription: SubscriptionData | null): boolean {
  // No subscription = show upgrade (free user)
  if (!subscription) return true;

  // Has complementary subscription = never show upgrade
  if (subscription.is_complementary) return false;

  // On highest tier = never show upgrade
  if (subscription.plan_name === 'Professional') return false;

  // Past due or canceled = show reactivation, not upgrade
  if (subscription.status === 'past_due' || subscription.status === 'canceled') return false;

  // Active or trialing on lower tier = show upgrade
  return subscription.status === 'active' || subscription.status === 'trialing';
}

/**
 * Determines if a user can upgrade to a specific plan
 */
export function canUpgradeToPlan(
  currentSubscription: SubscriptionData | null,
  targetPlanName: PlanTier
): boolean {
  // Has complementary subscription = cannot upgrade (contact admin)
  if (currentSubscription?.is_complementary) return false;

  const currentTier = PLAN_HIERARCHY[currentSubscription?.plan_name as PlanTier] || 0;
  const targetTier = PLAN_HIERARCHY[targetPlanName];

  return targetTier > currentTier;
}

/**
 * Gets the appropriate CTA text for subscription actions
 */
export function getSubscriptionCTA(subscription: SubscriptionData | null): {
  text: string;
  action: 'upgrade' | 'manage' | 'reactivate' | 'none';
  variant: 'default' | 'outline' | 'secondary';
} {
  // No subscription = upgrade
  if (!subscription || subscription.status === null) {
    return { text: 'Upgrade Now', action: 'upgrade', variant: 'default' };
  }

  // Complementary = manage only
  if (subscription.is_complementary) {
    return { text: 'View Plan Details', action: 'none', variant: 'outline' };
  }

  // Canceled or past due = reactivate
  if (subscription.status === 'canceled' || subscription.status === 'past_due') {
    return { text: 'Reactivate', action: 'reactivate', variant: 'default' };
  }

  // Trialing = upgrade with urgency
  if (subscription.status === 'trialing') {
    return { text: 'Upgrade Now', action: 'upgrade', variant: 'default' };
  }

  // Active on Professional = manage only
  if (subscription.plan_name === 'Professional') {
    return { text: 'Manage Plan', action: 'manage', variant: 'outline' };
  }

  // Active on lower tier = can upgrade
  if (subscription.status === 'active') {
    return { text: 'Upgrade Plan', action: 'upgrade', variant: 'default' };
  }

  return { text: 'Manage Plan', action: 'manage', variant: 'outline' };
}

/**
 * Checks if subscription is active (including complementary)
 */
export function isSubscriptionActive(subscription: SubscriptionData | null): boolean {
  if (!subscription) return false;

  // Complementary subscriptions are always considered active if status is 'active'
  if (subscription.is_complementary) {
    // Would need to check complementary_subscription status separately
    return true;
  }

  return subscription.status === 'active' || subscription.status === 'trialing';
}

/**
 * Gets days remaining in trial
 */
export function getTrialDaysRemaining(subscription: SubscriptionData | null): number | null {
  if (!subscription || subscription.status !== 'trialing') return null;

  const endDate = subscription.trial_end || subscription.current_period_end;
  if (!endDate) return null;

  const now = new Date();
  const end = new Date(endDate);
  const days = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  return days > 0 ? days : 0;
}

/**
 * Determines subscription urgency level for UI styling
 */
export function getSubscriptionUrgency(subscription: SubscriptionData | null): {
  level: 'none' | 'low' | 'medium' | 'high' | 'critical';
  message?: string;
} {
  if (!subscription || subscription.status === null) {
    return { level: 'low', message: 'Upgrade to unlock premium features' };
  }

  // Complementary = no urgency
  if (subscription.is_complementary) {
    return { level: 'none' };
  }

  // Past due = critical
  if (subscription.status === 'past_due') {
    return { level: 'critical', message: 'Payment failed - update payment method' };
  }

  // Paused = high
  if (subscription.status === 'paused') {
    return { level: 'high', message: 'Subscription paused - resume to regain access' };
  }

  // Canceled = high
  if (subscription.status === 'canceled') {
    return { level: 'high', message: 'Subscription canceled - reactivate to regain access' };
  }

  // Trial ending soon
  if (subscription.status === 'trialing') {
    const daysLeft = getTrialDaysRemaining(subscription);
    if (daysLeft === null) return { level: 'none' };

    if (daysLeft === 0) {
      return { level: 'critical', message: 'Trial ends today!' };
    } else if (daysLeft === 1) {
      return { level: 'high', message: 'Trial ends tomorrow' };
    } else if (daysLeft <= 3) {
      return { level: 'medium', message: `Trial ends in ${daysLeft} days` };
    } else {
      return { level: 'low', message: `${daysLeft} days left in trial` };
    }
  }

  // Scheduled for cancellation
  if (subscription.cancel_at_period_end && subscription.current_period_end) {
    const daysUntilEnd = Math.ceil(
      (new Date(subscription.current_period_end).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    return {
      level: 'medium',
      message: `Subscription ends in ${daysUntilEnd} days`,
    };
  }

  return { level: 'none' };
}

/**
 * Gets the next available upgrade plan
 */
export function getNextUpgradePlan(currentPlan: PlanTier): PlanTier | null {
  const currentTier = PLAN_HIERARCHY[currentPlan];
  const nextTiers = Object.entries(PLAN_HIERARCHY)
    .filter(([_, tier]) => tier === currentTier + 1)
    .map(([name]) => name as PlanTier);

  return nextTiers[0] || null;
}

/**
 * Formats subscription status for display
 */
export function formatSubscriptionStatus(subscription: SubscriptionData | null): string {
  if (!subscription || subscription.status === null) return 'Free Plan';

  if (subscription.is_complementary) return 'Complimentary Access';

  switch (subscription.status) {
    case 'active':
      return 'Active';
    case 'trialing':
      return 'Free Trial';
    case 'canceled':
      return 'Canceled';
    case 'past_due':
      return 'Payment Issue';
    case 'paused':
      return 'Paused';
    case 'incomplete':
      return 'Incomplete';
    case 'incomplete_expired':
      return 'Expired';
    default:
      return subscription.status;
  }
}

/**
 * Checks if usage-based upgrade prompts should be shown
 * Returns false if user has complementary subscription or is on highest tier
 */
export function shouldShowUsageUpgradePrompt(
  subscription: SubscriptionData | null,
  usagePercentage: number
): boolean {
  // Don't show if user shouldn't see upgrade prompts at all
  if (!shouldShowUpgradePrompt(subscription)) return false;

  // Only show if usage is approaching or at limit (75%+)
  return usagePercentage >= 75;
}

/**
 * Gets complementary subscription display info
 */
export function getComplementarySubscriptionInfo(subscription: SubscriptionData | null): {
  isComplementary: boolean;
  message?: string;
} {
  if (!subscription?.is_complementary) {
    return { isComplementary: false };
  }

  return {
    isComplementary: true,
    message: 'You have complimentary access to this plan',
  };
}
