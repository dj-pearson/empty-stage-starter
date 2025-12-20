#!/bin/bash
# Test Stripe Webhook with CLI
# Prerequisites: Install Stripe CLI (https://stripe.com/docs/stripe-cli)

echo "🧪 Testing Stripe Webhook Integration"
echo "======================================"
echo ""
echo "Step 1: Login to Stripe (if not already logged in)"
stripe login

echo ""
echo "Step 2: Forward webhooks to your Supabase function"
echo "This will listen for events from Stripe..."
# Using self-hosted Supabase Edge Functions at functions.tryeatpal.com
stripe listen --forward-to https://functions.tryeatpal.com/stripe-webhook &
LISTEN_PID=$!

echo "Webhook listener started (PID: $LISTEN_PID)"
echo ""
echo "Waiting 5 seconds for listener to initialize..."
sleep 5

echo ""
echo "Step 3: Triggering test events..."
echo ""

echo "📦 Triggering: checkout.session.completed"
stripe trigger checkout.session.completed
sleep 2

echo "📦 Triggering: customer.subscription.created"
stripe trigger customer.subscription.created
sleep 2

echo "📦 Triggering: customer.subscription.updated"
stripe trigger customer.subscription.updated
sleep 2

echo "💰 Triggering: invoice.payment_succeeded"
stripe trigger invoice.payment_succeeded
sleep 2

echo "❌ Triggering: invoice.payment_failed"
stripe trigger invoice.payment_failed
sleep 2

echo "🗑️  Triggering: customer.subscription.deleted"
stripe trigger customer.subscription.deleted
sleep 2

echo ""
echo "✅ All test events triggered!"
echo ""
echo "Check the output above for webhook responses."
echo "Also check Supabase Dashboard > Functions > stripe-webhook > Logs"
echo ""
echo "Press Ctrl+C to stop the webhook listener"

# Keep the listener running
wait $LISTEN_PID

