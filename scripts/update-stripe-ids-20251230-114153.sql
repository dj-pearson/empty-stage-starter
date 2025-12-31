-- EatPal Stripe IDs Update Script
-- Generated: 2025-12-30 11:41:53
-- Mode: TEST

-- WARNING: Run this script to update your subscription_plans table with the new Stripe IDs

-- Update Pro plan
UPDATE subscription_plans SET
    stripe_product_id = 'prod_ThVx2lcELU0LRi',
    stripe_price_id_monthly = '',
    stripe_price_id_yearly = ''
WHERE name = 'Pro';

-- Update Family Plus plan
UPDATE subscription_plans SET
    stripe_product_id = 'prod_ThVxol4AScov3n',
    stripe_price_id_monthly = '',
    stripe_price_id_yearly = ''
WHERE name = 'Family Plus';

-- Update Professional plan
UPDATE subscription_plans SET
    stripe_product_id = 'prod_ThVx4c44EHCBM1',
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
