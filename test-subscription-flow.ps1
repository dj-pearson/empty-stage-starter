#!/usr/bin/env pwsh
# =================================================================
# EatPal Subscription & Checkout Flow - Full Test Script
# =================================================================
# Prerequisites:
#   1. Stripe CLI installed: https://stripe.com/docs/stripe-cli
#   2. Stripe CLI logged in: stripe login
#   3. Edge functions deployed
#   4. STRIPE_WEBHOOK_SECRET set in environment
# =================================================================

Write-Host ""
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "  EatPal Subscription & Checkout Flow - Full Test Suite" -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host ""

# ---- Configuration ----
$FUNCTIONS_URL = "https://functions.tryeatpal.com"
$WEBHOOK_ENDPOINT = "$FUNCTIONS_URL/stripe-webhook"

Write-Host "Webhook Endpoint: $WEBHOOK_ENDPOINT" -ForegroundColor Gray
Write-Host ""

# ---- Step 1: Verify Stripe CLI ----
Write-Host "STEP 1: Verifying Stripe CLI..." -ForegroundColor Yellow
try {
    $stripeVersion = stripe --version 2>&1
    Write-Host "  ✅ Stripe CLI: $stripeVersion" -ForegroundColor Green
} catch {
    Write-Host "  ❌ Stripe CLI not found. Install from https://stripe.com/docs/stripe-cli" -ForegroundColor Red
    exit 1
}

# ---- Step 2: Start webhook listener ----
Write-Host ""
Write-Host "STEP 2: Starting webhook listener..." -ForegroundColor Yellow
Write-Host "  Forwarding Stripe events to: $WEBHOOK_ENDPOINT" -ForegroundColor Gray

$listenerJob = Start-Job -ScriptBlock {
    param($endpoint)
    stripe listen --forward-to $endpoint 2>&1
} -ArgumentList $WEBHOOK_ENDPOINT

Start-Sleep -Seconds 5
Write-Host "  ✅ Webhook listener started (Job ID: $($listenerJob.Id))" -ForegroundColor Green

# ---- Step 3: Test Event Sequence ----
Write-Host ""
Write-Host "STEP 3: Running subscription lifecycle test events..." -ForegroundColor Yellow
Write-Host "========================================================" -ForegroundColor Gray
Write-Host ""

$testEvents = @(
    @{ Name = "Checkout Session Completed"; Event = "checkout.session.completed"; Emoji = "🛒"; Description = "Simulates a user completing Stripe Checkout" },
    @{ Name = "Subscription Created"; Event = "customer.subscription.created"; Emoji = "🆕"; Description = "Stripe creates the subscription after payment" },
    @{ Name = "Invoice Payment Succeeded"; Event = "invoice.payment_succeeded"; Emoji = "💰"; Description = "First invoice paid successfully" },
    @{ Name = "Subscription Updated"; Event = "customer.subscription.updated"; Emoji = "🔄"; Description = "Subscription plan or billing cycle changed" },
    @{ Name = "Invoice Payment Failed"; Event = "invoice.payment_failed"; Emoji = "❌"; Description = "Simulates a failed renewal payment (card declined)" },
    @{ Name = "Subscription Deleted"; Event = "customer.subscription.deleted"; Emoji = "🗑️"; Description = "User cancels and subscription period ends" }
)

$passed = 0
$failed = 0

foreach ($test in $testEvents) {
    Write-Host "$($test.Emoji) Testing: $($test.Name)" -ForegroundColor White
    Write-Host "   $($test.Description)" -ForegroundColor Gray
    
    try {
        $result = stripe trigger $test.Event 2>&1
        $exitCode = $LASTEXITCODE
        
        if ($exitCode -eq 0) {
            Write-Host "   ✅ PASSED - Event triggered and webhook responded" -ForegroundColor Green
            $passed++
        } else {
            Write-Host "   ❌ FAILED - Exit code: $exitCode" -ForegroundColor Red
            Write-Host "   Output: $result" -ForegroundColor Red
            $failed++
        }
    } catch {
        Write-Host "   ❌ FAILED - Error: $_" -ForegroundColor Red
        $failed++
    }
    
    Start-Sleep -Seconds 3
    Write-Host ""
}

# ---- Step 4: Summary ----
Write-Host "========================================================" -ForegroundColor Gray
Write-Host ""
Write-Host "TEST RESULTS SUMMARY" -ForegroundColor Cyan
Write-Host "===================" -ForegroundColor Cyan
Write-Host "  Total Tests:  $($passed + $failed)" -ForegroundColor White
Write-Host "  Passed:       $passed" -ForegroundColor Green
Write-Host "  Failed:       $failed" -ForegroundColor $(if ($failed -gt 0) { "Red" } else { "Green" })
Write-Host ""

# ---- Step 5: Manual Verification Checklist ----
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "  MANUAL VERIFICATION CHECKLIST" -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "After running these tests, verify the following in your database:" -ForegroundColor Yellow
Write-Host ""
Write-Host "  1. CHECKOUT FLOW" -ForegroundColor White
Write-Host "     [ ] User redirected to Stripe Checkout page" -ForegroundColor Gray
Write-Host "     [ ] After payment, redirected to /checkout/success?session_id=..." -ForegroundColor Gray
Write-Host "     [ ] CheckoutSuccess page shows plan details and features" -ForegroundColor Gray
Write-Host "     [ ] user_subscriptions row created with stripe_customer_id" -ForegroundColor Gray
Write-Host ""
Write-Host "  2. SUBSCRIPTION ACTIVATION" -ForegroundColor White
Write-Host "     [ ] user_subscriptions.status = 'active'" -ForegroundColor Gray
Write-Host "     [ ] user_subscriptions.stripe_subscription_id populated" -ForegroundColor Gray
Write-Host "     [ ] user_subscriptions.plan_id matches selected plan" -ForegroundColor Gray
Write-Host "     [ ] user_subscriptions.current_period_start/end set" -ForegroundColor Gray
Write-Host "     [ ] subscription_events row with event_type = 'renewed' or 'upgraded'" -ForegroundColor Gray
Write-Host ""
Write-Host "  3. PAYMENT RECORDING" -ForegroundColor White
Write-Host "     [ ] payment_history row with status = 'succeeded'" -ForegroundColor Gray
Write-Host "     [ ] payment_history.amount matches plan price" -ForegroundColor Gray
Write-Host "     [ ] payment_history.stripe_invoice_id populated" -ForegroundColor Gray
Write-Host ""
Write-Host "  4. PAYMENT FAILURE" -ForegroundColor White
Write-Host "     [ ] user_subscriptions.status = 'past_due'" -ForegroundColor Gray
Write-Host "     [ ] payment_history row with status = 'failed'" -ForegroundColor Gray
Write-Host "     [ ] subscription_events row with event_type = 'payment_failed'" -ForegroundColor Gray
Write-Host "     [ ] Frontend shows 'Payment Issue' banner" -ForegroundColor Gray
Write-Host ""
Write-Host "  5. SUBSCRIPTION CANCELLATION" -ForegroundColor White
Write-Host "     [ ] user_subscriptions.status = 'canceled'" -ForegroundColor Gray
Write-Host "     [ ] user_subscriptions.plan_id changed to Free plan" -ForegroundColor Gray
Write-Host "     [ ] user_subscriptions.stripe_subscription_id cleared (null)" -ForegroundColor Gray
Write-Host "     [ ] subscription_events row with event_type = 'canceled'" -ForegroundColor Gray
Write-Host "     [ ] Frontend shows 'Canceled' status and upgrade prompt" -ForegroundColor Gray
Write-Host ""
Write-Host "  6. REALTIME MONITORING" -ForegroundColor White
Write-Host "     [ ] Dashboard updates automatically when subscription changes" -ForegroundColor Gray
Write-Host "     [ ] SubscriptionStatusBanner reflects correct state" -ForegroundColor Gray
Write-Host "     [ ] No page reload needed to see status changes" -ForegroundColor Gray
Write-Host ""
Write-Host "  7. CANCELLATION -> REACTIVATION" -ForegroundColor White
Write-Host "     [ ] 'Cancel' sets cancel_at_period_end = true (not immediate)" -ForegroundColor Gray
Write-Host "     [ ] User can 'Reactivate' before period ends" -ForegroundColor Gray
Write-Host "     [ ] After period ends, subscription.deleted fires -> Free plan" -ForegroundColor Gray
Write-Host ""

# ---- Step 6: SQL Verification Queries ----
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "  SQL VERIFICATION QUERIES (run in Supabase SQL Editor)" -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host @"
-- Check user subscription status
SELECT us.user_id, us.status, us.plan_id, sp.name as plan_name,
       us.stripe_customer_id, us.stripe_subscription_id,
       us.cancel_at_period_end, us.current_period_end
FROM user_subscriptions us
LEFT JOIN subscription_plans sp ON us.plan_id = sp.id
ORDER BY us.updated_at DESC
LIMIT 10;

-- Check subscription events (audit trail)
SELECT se.user_id, se.event_type, 
       old_plan.name as old_plan, new_plan.name as new_plan,
       se.metadata, se.created_at
FROM subscription_events se
LEFT JOIN subscription_plans old_plan ON se.old_plan_id = old_plan.id
LEFT JOIN subscription_plans new_plan ON se.new_plan_id = new_plan.id
ORDER BY se.created_at DESC
LIMIT 20;

-- Check payment history
SELECT ph.user_id, ph.amount, ph.currency, ph.status, 
       ph.description, ph.stripe_invoice_id, ph.created_at
FROM payment_history ph
ORDER BY ph.created_at DESC
LIMIT 10;

-- Verify Stripe price IDs are configured
SELECT id, name, price_monthly, price_yearly, 
       stripe_price_id_monthly, stripe_price_id_yearly
FROM subscription_plans
WHERE is_active = true
ORDER BY sort_order;
"@ -ForegroundColor DarkGray

Write-Host ""

# ---- Cleanup ----
Write-Host "Stopping webhook listener..." -ForegroundColor Yellow
Stop-Job $listenerJob -ErrorAction SilentlyContinue
Remove-Job $listenerJob -Force -ErrorAction SilentlyContinue
Write-Host "✅ Listener stopped" -ForegroundColor Green
Write-Host ""
Write-Host "Done! Review the checklist above to verify your subscription flow." -ForegroundColor Cyan
