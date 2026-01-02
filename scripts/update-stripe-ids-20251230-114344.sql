-- EatPal Stripe IDs Update Script
-- Generated: 2025-12-30 11:43:44
-- Mode: TEST

-- WARNING: Run this script to update your subscription_plans table with the new Stripe IDs

-- Update Pro plan
UPDATE subscription_plans SET
    stripe_product_id = 'prod_ThVzJI81Nwo29e',
    stripe_price_id_monthly = 'price_1Sk6xMEQGPvinhrF1nd5Y2XP',
    stripe_price_id_yearly = 'price_1Sk6xMEQGPvinhrFZKoByA0o'
WHERE name = 'Pro';

-- Update Family Plus plan
UPDATE subscription_plans SET
    stripe_product_id = 'prod_ThVz4xstrj5fGL',
    stripe_price_id_monthly = 'price_1Sk6xNEQGPvinhrFwcx0ECD3',
    stripe_price_id_yearly = 'price_1Sk6xOEQGPvinhrFmQFLEsUr'
WHERE name = 'Family Plus';

-- Update Professional plan
UPDATE subscription_plans SET
    stripe_product_id = 'prod_ThVz8x7ciByi4L',
    stripe_price_id_monthly = 'price_1Sk6xPEQGPvinhrFHXlvNsTI',
    stripe_price_id_yearly = 'price_1Sk6xQEQGPvinhrFstvt8P52'
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
