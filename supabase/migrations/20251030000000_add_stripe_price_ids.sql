-- Add separate Stripe price ID columns for monthly and yearly billing
-- This allows each plan to have different Stripe price IDs for monthly vs yearly subscriptions

ALTER TABLE subscription_plans 
ADD COLUMN IF NOT EXISTS stripe_price_id_monthly TEXT,
ADD COLUMN IF NOT EXISTS stripe_price_id_yearly TEXT,
ADD COLUMN IF NOT EXISTS stripe_product_id TEXT;

-- Remove the old unique constraint on the single stripe_price_id if it exists
ALTER TABLE subscription_plans 
DROP CONSTRAINT IF EXISTS subscription_plans_stripe_price_id_key;

-- Add new unique constraints for the separate price IDs
ALTER TABLE subscription_plans
ADD CONSTRAINT subscription_plans_stripe_price_id_monthly_key UNIQUE (stripe_price_id_monthly);

ALTER TABLE subscription_plans
ADD CONSTRAINT subscription_plans_stripe_price_id_yearly_key UNIQUE (stripe_price_id_yearly);

-- Add indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_subscription_plans_stripe_price_id_monthly 
  ON subscription_plans(stripe_price_id_monthly) WHERE stripe_price_id_monthly IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subscription_plans_stripe_price_id_yearly 
  ON subscription_plans(stripe_price_id_yearly) WHERE stripe_price_id_yearly IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subscription_plans_stripe_product_id 
  ON subscription_plans(stripe_product_id) WHERE stripe_product_id IS NOT NULL;

-- Comment explaining the change
COMMENT ON COLUMN subscription_plans.stripe_price_id_monthly IS 'Stripe Price ID for monthly billing';
COMMENT ON COLUMN subscription_plans.stripe_price_id_yearly IS 'Stripe Price ID for yearly billing';
COMMENT ON COLUMN subscription_plans.stripe_product_id IS 'Stripe Product ID for this plan';
COMMENT ON COLUMN subscription_plans.stripe_price_id IS 'DEPRECATED: Use stripe_price_id_monthly or stripe_price_id_yearly instead';

