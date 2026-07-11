/**
 * Stripe Webhook Edge Function
 *
 * Processes Stripe webhook events to synchronize subscription status.
 *
 * POST /stripe-webhook
 * Headers: stripe-signature (required)
 * Auth: No JWT (webhook signature verification instead)
 *
 * Handled Events:
 * - checkout.session.completed -> activate subscription
 * - customer.subscription.updated -> sync plan changes
 * - customer.subscription.deleted -> deactivate subscription
 * - invoice.payment_failed -> flag past_due
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsPreFlight } from '../_shared/cors.ts';
import { isFreshStripeEvent, isDuplicateInsertError } from '../_shared/stripe-webhook-logic.ts';

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

/**
 * Ordering guard (US-519): returns true when this event is STALE for the target
 * subscription row (its `event.created` is older than the newest event already
 * applied), so the caller should skip the mutation. A row that does not exist
 * yet, or has no recorded ordering, is never stale.
 */
async function isStaleForRow(
  db: SupabaseClient,
  matchCol: 'user_id' | 'stripe_subscription_id',
  matchVal: string,
  eventCreated: number | null,
): Promise<boolean> {
  const { data } = await db
    .from('user_subscriptions')
    .select('last_stripe_event_created')
    .eq(matchCol, matchVal)
    .maybeSingle();
  if (!data) return false;
  return !isFreshStripeEvent(eventCreated, data.last_stripe_event_created);
}

/** Verify Stripe webhook signature using HMAC-SHA256 */
async function verifyStripeSignature(
  payload: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  try {
    const parts = signature.split(',');
    const timestampPart = parts.find((p) => p.startsWith('t='));
    const sigPart = parts.find((p) => p.startsWith('v1='));

    if (!timestampPart || !sigPart) return false;

    const timestamp = timestampPart.split('=')[1];
    const expectedSig = sigPart.split('=')[1];

    // Check timestamp tolerance (5 minutes)
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - parseInt(timestamp)) > 300) return false;

    const signedPayload = `${timestamp}.${payload}`;
    const encoder = new TextEncoder();

    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );

    const signatureBytes = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(signedPayload),
    );

    // Convert computed HMAC to hex string
    const computed = Array.from(new Uint8Array(signatureBytes))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    // Use constant-time comparison to prevent timing attacks
    if (computed.length !== expectedSig.length) return false;

    const computedBytes = encoder.encode(computed);
    const expectedBytes = encoder.encode(expectedSig);

    // crypto.subtle.timingSafeEqual is not available in all runtimes,
    // so implement constant-time comparison manually
    let mismatch = 0;
    for (let i = 0; i < computedBytes.length; i++) {
      mismatch |= computedBytes[i] ^ expectedBytes[i];
    }
    return mismatch === 0;
  } catch {
    return false;
  }
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return handleCorsPreFlight(req);
  }

  try {
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    const stripeWebhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
    if (!stripeWebhookSecret) {
      console.error('STRIPE_WEBHOOK_SECRET is not configured');
      return new Response(
        JSON.stringify({ error: 'Webhook not configured' }),
        { status: 503, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    const signature = req.headers.get('stripe-signature');
    if (!signature) {
      return new Response(
        JSON.stringify({ error: 'Missing stripe-signature header' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    const payload = await req.text();

    // Verify signature
    const isValid = await verifyStripeSignature(payload, signature, stripeWebhookSecret);
    if (!isValid) {
      return new Response(
        JSON.stringify({ error: 'Invalid signature' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    const event = JSON.parse(payload);
    const eventCreated: number | null = typeof event.created === 'number' ? event.created : null;

    // Use service role for webhook operations (no user auth context)
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    );

    // Idempotency (US-519): record the Stripe event id. A redelivered event hits
    // the unique primary key and is treated as an already-processed no-op.
    const { error: dedupeError } = await supabaseClient
      .from('stripe_webhook_events')
      .insert({ event_id: event.id, event_type: event.type, event_created: eventCreated });
    if (dedupeError) {
      if (isDuplicateInsertError(dedupeError)) {
        return new Response(
          JSON.stringify({ received: true, duplicate: true, type: event.type }),
          { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
        );
      }
      throw dedupeError;
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.metadata?.user_id ?? session.client_reference_id;

        if (userId) {
          if (await isStaleForRow(supabaseClient, 'user_id', userId, eventCreated)) break;
          await supabaseClient.from('user_subscriptions').upsert({
            user_id: userId,
            status: 'active',
            stripe_customer_id: session.customer,
            stripe_subscription_id: session.subscription,
            current_period_start: new Date().toISOString(),
            last_stripe_event_created: eventCreated,
          }, { onConflict: 'user_id' });
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const userId = subscription.metadata?.user_id;

        if (userId) {
          // Ordering guard: a late (older) update must not overwrite a newer
          // state such as a prior subscription.deleted (US-519).
          if (await isStaleForRow(supabaseClient, 'user_id', userId, eventCreated)) break;
          await supabaseClient
            .from('user_subscriptions')
            .update({
              status: subscription.status === 'active' ? 'active' : subscription.status,
              cancel_at_period_end: subscription.cancel_at_period_end ?? false,
              current_period_start: subscription.current_period_start
                ? new Date(subscription.current_period_start * 1000).toISOString()
                : undefined,
              current_period_end: subscription.current_period_end
                ? new Date(subscription.current_period_end * 1000).toISOString()
                : undefined,
              last_stripe_event_created: eventCreated,
            })
            .eq('user_id', userId);
        } else {
          // Fallback: look up by stripe_subscription_id
          if (await isStaleForRow(supabaseClient, 'stripe_subscription_id', subscription.id, eventCreated)) break;
          await supabaseClient
            .from('user_subscriptions')
            .update({
              status: subscription.status === 'active' ? 'active' : subscription.status,
              cancel_at_period_end: subscription.cancel_at_period_end ?? false,
              last_stripe_event_created: eventCreated,
            })
            .eq('stripe_subscription_id', subscription.id);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const userId = subscription.metadata?.user_id;

        if (userId) {
          if (await isStaleForRow(supabaseClient, 'user_id', userId, eventCreated)) break;
          await supabaseClient
            .from('user_subscriptions')
            .update({ status: 'canceled', last_stripe_event_created: eventCreated })
            .eq('user_id', userId);
        } else {
          if (await isStaleForRow(supabaseClient, 'stripe_subscription_id', subscription.id, eventCreated)) break;
          await supabaseClient
            .from('user_subscriptions')
            .update({ status: 'canceled', last_stripe_event_created: eventCreated })
            .eq('stripe_subscription_id', subscription.id);
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const subscriptionId = invoice.subscription;

        if (subscriptionId) {
          if (await isStaleForRow(supabaseClient, 'stripe_subscription_id', subscriptionId, eventCreated)) break;
          await supabaseClient
            .from('user_subscriptions')
            .update({ status: 'past_due', last_stripe_event_created: eventCreated })
            .eq('stripe_subscription_id', subscriptionId);
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return new Response(
      JSON.stringify({ received: true, type: event.type }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  } catch (error) {
    console.error('stripe-webhook error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  }
});
