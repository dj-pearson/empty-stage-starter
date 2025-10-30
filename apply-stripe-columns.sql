-- Safe migration to add Stripe price ID columns
-- This script is idempotent and safe to run multiple times

-- Step 1: Add the new columns (IF NOT EXISTS prevents errors)
ALTER TABLE subscription_plans 
ADD COLUMN IF NOT EXISTS stripe_price_id_monthly TEXT,
ADD COLUMN IF NOT EXISTS stripe_price_id_yearly TEXT,
ADD COLUMN IF NOT EXISTS stripe_product_id TEXT;

-- Step 2: Drop old constraint only if it exists
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'subscription_plans_stripe_price_id_key'
    ) THEN
        ALTER TABLE subscription_plans 
        DROP CONSTRAINT subscription_plans_stripe_price_id_key;
    END IF;
END $$;

-- Step 3: Add new unique constraints only if they don't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'subscription_plans_stripe_price_id_monthly_key'
    ) THEN
        ALTER TABLE subscription_plans
        ADD CONSTRAINT subscription_plans_stripe_price_id_monthly_key 
        UNIQUE (stripe_price_id_monthly);
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'subscription_plans_stripe_price_id_yearly_key'
    ) THEN
        ALTER TABLE subscription_plans
        ADD CONSTRAINT subscription_plans_stripe_price_id_yearly_key 
        UNIQUE (stripe_price_id_yearly);
    END IF;
END $$;

-- Step 4: Create indexes (IF NOT EXISTS prevents errors)
CREATE INDEX IF NOT EXISTS idx_subscription_plans_stripe_price_id_monthly 
  ON subscription_plans(stripe_price_id_monthly) 
  WHERE stripe_price_id_monthly IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subscription_plans_stripe_price_id_yearly 
  ON subscription_plans(stripe_price_id_yearly) 
  WHERE stripe_price_id_yearly IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subscription_plans_stripe_product_id 
  ON subscription_plans(stripe_product_id) 
  WHERE stripe_product_id IS NOT NULL;

-- Step 5: Verify the columns were created
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'subscription_plans'
  AND column_name IN ('stripe_price_id_monthly', 'stripe_price_id_yearly', 'stripe_product_id')
ORDER BY column_name;

-- You should see 3 rows returned:
-- stripe_price_id_monthly | text | YES
-- stripe_price_id_yearly  | text | YES  
-- stripe_product_id       | text | YES

