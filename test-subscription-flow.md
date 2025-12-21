# Test Subscription Flow - Verification Checklist

## ✅ Pre-Deployment Checks

### 1. Database Schema ✓
- [ ] Run migration SQL in Supabase Dashboard SQL Editor
- [ ] Verify new columns exist: `stripe_price_id_monthly`, `stripe_price_id_yearly`, `stripe_product_id`
- [ ] Update subscription plans with Stripe IDs

### 2. Edge Function Deployment ✓
- [x] `stripe-webhook` function deployed successfully

## 🧪 Testing Steps

### Test 1: Verify Webhook Endpoint
```bash
# Test that the webhook endpoint is accessible
curl -X POST https://functions.tryeatpal.com/stripe-webhook \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
```
Expected: Should return 403 Forbidden (because no Stripe signature)

### Test 2: Create Checkout Session
1. Log into your EatPal app
2. Navigate to `/pricing`
3. Click "Upgrade Now" on any paid plan
4. Check browser console for any errors
5. Should redirect to Stripe Checkout

### Test 3: Test with Stripe CLI (Recommended)
```bash
# Install Stripe CLI: https://stripe.com/docs/stripe-cli
# Login to your Stripe account
stripe login

# Forward webhooks to your Edge Function
stripe listen --forward-to https://functions.tryeatpal.com/stripe-webhook

# In a new terminal, trigger test events
stripe trigger checkout.session.completed
stripe trigger customer.subscription.created
stripe trigger customer.subscription.updated
stripe trigger invoice.payment_succeeded
stripe trigger invoice.payment_failed
stripe trigger customer.subscription.deleted
```

### Test 4: Check Webhook in Supabase Logs
1. Go to Supabase Dashboard → Functions → stripe-webhook
2. Click "Logs" tab
3. Look for successful webhook processing
4. Verify no errors in the logs

### Test 5: Verify Database Updates
After triggering test webhooks, check:
```sql
-- Check for new subscriptions
SELECT * FROM user_subscriptions ORDER BY created_at DESC LIMIT 5;

-- Check subscription events
SELECT * FROM subscription_events ORDER BY created_at DESC LIMIT 10;

-- Check payment history
SELECT * FROM payment_history ORDER BY created_at DESC LIMIT 10;
```

## 🔧 Configure Stripe Webhook (Production)

Once testing is complete, configure the webhook in Stripe Dashboard:

1. Go to **Stripe Dashboard** → **Developers** → **Webhooks**
2. Click **Add endpoint**
3. Set URL: `https://functions.tryeatpal.com/stripe-webhook`
4. Select these events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
5. Click **Add endpoint**
6. Copy the **Signing secret** (starts with `whsec_`)
7. Add to Supabase secrets:
   ```bash
   supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_your_secret_here
   ```

## ✅ Success Criteria

- [ ] Database migration applied successfully
- [ ] Subscription plans have Stripe price IDs
- [ ] Webhook function deployed
- [ ] Checkout session creates successfully
- [ ] Webhook processes events without errors
- [ ] User subscriptions are updated correctly
- [ ] Stripe webhook configured in Dashboard

## 🐛 Troubleshooting

### Issue: Checkout fails with "Price ID not configured"
**Solution:** Verify subscription_plans table has correct Stripe price IDs

### Issue: Webhook returns 400 error
**Solution:** Check Supabase function logs for detailed error message

### Issue: Subscription not updating after payment
**Solution:** 
1. Check Stripe webhook delivery in Stripe Dashboard
2. Verify webhook secret is correct
3. Check Supabase function logs

### Issue: "No plan found for price ID"
**Solution:** The webhook can't find a matching plan. Verify:
```sql
SELECT 
  name,
  stripe_price_id_monthly,
  stripe_price_id_yearly
FROM subscription_plans;
```
Compare with your Stripe price IDs.

## 📊 Monitor After Deployment

Watch these metrics for the first 24-48 hours:

1. **Webhook Success Rate** (Stripe Dashboard → Webhooks)
   - Should be > 99%
   
2. **Checkout Conversion Rate**
   - Track create-checkout calls vs completed checkouts
   
3. **Supabase Function Errors**
   - Monitor function logs for any errors

4. **Failed Payments**
   - Check payment_history table for failed status

