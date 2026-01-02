-- EatPal Stripe IDs Update Script
-- Generated: 2025-12-30 11:43:12
-- Mode: TEST

-- WARNING: Run this script to update your subscription_plans table with the new Stripe IDs

-- Update Pro plan
UPDATE subscription_plans SET
    stripe_product_id = 'prod_ThVygeIdYW3ry3',
    stripe_price_id_monthly = '',
    stripe_price_id_yearly = ''
WHERE name = 'Pro';

-- Update Family Plus plan
UPDATE subscription_plans SET
    stripe_product_id = 'prod_ThVyL1gTXUa9H8',
    stripe_price_id_monthly = '',
    stripe_price_id_yearly = ''
WHERE name = 'Family Plus';

-- Update Professional plan
UPDATE subscription_plans SET
    stripe_product_id = 'prod_ThVyT6Map8RAIl',
    stripe_price_id_monthly = '',
    stripe_price_id_yearly = ''
WHERE name = 'Professional';

-- Verify the updates
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
