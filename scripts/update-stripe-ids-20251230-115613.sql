-- EatPal Stripe IDs Update Script
-- Generated: 2025-12-30 11:56:13
-- Mode: PRODUCTION

-- WARNING: Run this script to update your subscription_plans table with the new Stripe IDs

-- Update Pro plan
UPDATE subscription_plans SET
    stripe_product_id = 'prod_ThWBJX53VadQpg',
    stripe_price_id_monthly = 'price_1Sk79MEQGPvinhrFca44B9YY',
    stripe_price_id_yearly = 'price_1Sk79NEQGPvinhrFmvriMWGy'
WHERE name = 'Pro';

-- Update Family Plus plan
UPDATE subscription_plans SET
    stripe_product_id = 'prod_ThWBTqGbTpxApb',
    stripe_price_id_monthly = 'price_1Sk79QEQGPvinhrFuBcfG2HC',
    stripe_price_id_yearly = 'price_1Sk79QEQGPvinhrFfrQlu0Hd'
WHERE name = 'Family Plus';

-- Update Professional plan
UPDATE subscription_plans SET
    stripe_product_id = 'prod_ThWBw8KZQOyXKw',
    stripe_price_id_monthly = 'price_1Sk79TEQGPvinhrFgQUSzPuu',
    stripe_price_id_yearly = 'price_1Sk79TEQGPvinhrFIipmIQ9f'
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
