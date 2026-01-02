-- EatPal Stripe IDs Update Script
-- Generated: 2025-12-30 11:44:20
-- Mode: TEST

-- WARNING: Run this script to update your subscription_plans table with the new Stripe IDs

-- Update Pro plan
UPDATE subscription_plans SET
    stripe_product_id = 'prod_ThVzmY96aArYDc',
    stripe_price_id_monthly = 'price_1Sk6xrEQGPvinhrFk3fq1Vr0',
    stripe_price_id_yearly = 'price_1Sk6xsEQGPvinhrFe4Fdnx5D'
WHERE name = 'Pro';

-- Update Family Plus plan
UPDATE subscription_plans SET
    stripe_product_id = 'prod_ThVzDwsAa0kHx2',
    stripe_price_id_monthly = 'price_1Sk6xuEQGPvinhrFbghsblrB',
    stripe_price_id_yearly = 'price_1Sk6xvEQGPvinhrFAiJ8mDKA'
WHERE name = 'Family Plus';

-- Update Professional plan
UPDATE subscription_plans SET
    stripe_product_id = 'prod_ThVz2N6GTW5yap',
    stripe_price_id_monthly = 'price_1Sk6xyEQGPvinhrFVI1vdYm6',
    stripe_price_id_yearly = 'price_1Sk6xyEQGPvinhrFrTcscCyk'
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
