-- EatPal Stripe IDs Update Script
-- Generated: 2025-12-30 11:52:06
-- Mode: PRODUCTION

-- WARNING: Run this script to update your subscription_plans table with the new Stripe IDs

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
