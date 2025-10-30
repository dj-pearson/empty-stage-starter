-- Populate Stripe Price IDs and Product IDs
-- Run this AFTER apply-stripe-columns.sql completes successfully

-- Step 1: Update Pro plan
UPDATE subscription_plans SET 
  stripe_price_id_monthly = 'price_1SNfxeCaWdkEYkkC67P6cITY',
  stripe_price_id_yearly = 'price_1SNfyZCaWdkEYkkCNtJ2wuNt',
  stripe_product_id = 'prod_TKKcpXgTgmj7Gz'
WHERE name = 'Pro';

-- Step 2: Update Family Plus plan
UPDATE subscription_plans SET 
  stripe_price_id_monthly = 'price_1SNfxzCaWdkEYkkCKlYGMven',
  stripe_price_id_yearly = 'price_1SNfywCaWdkEYkkCgwFiL4TL',
  stripe_product_id = 'prod_TKKdN0Lh9oyWJJ'
WHERE name = 'Family Plus';

-- Step 3: Update Professional plan
UPDATE subscription_plans SET 
  stripe_price_id_monthly = 'price_1SNfxFCaWdkEYkkCjYKIx9Q9',
  stripe_price_id_yearly = 'price_1SNfzGCaWdkEYkkCs9lOQ0lx',
  stripe_product_id = 'prod_TKKcXp6qAfS9MN'
WHERE name = 'Professional';

-- Step 4: Verify the updates
SELECT 
  name,
  stripe_product_id,
  stripe_price_id_monthly,
  stripe_price_id_yearly,
  price_monthly,
  price_yearly,
  is_active
FROM subscription_plans
WHERE name IN ('Pro', 'Family Plus', 'Professional')
ORDER BY sort_order;

-- Expected results:
-- Pro            | prod_TKKcpXgTgmj7Gz | price_1SNfxeCaWdkEYkkC67P6cITY | price_1SNfyZCaWdkEYkkCNtJ2wuNt | 14.99 | 143.90 | true
-- Family Plus    | prod_TKKdN0Lh9oyWJJ | price_1SNfxzCaWdkEYkkCKlYGMven | price_1SNfywCaWdkEYkkCgwFiL4TL | 24.99 | 239.90 | true
-- Professional   | prod_TKKcXp6qAfS9MN | price_1SNfxFCaWdkEYkkCjYKIx9Q9 | price_1SNfzGCaWdkEYkkCs9lOQ0lx | 99.00 | 950.00 | true

