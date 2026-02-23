/**
 * Create Checkout Edge Function
 *
 * Creates a Stripe checkout session for subscription purchases.
 *
 * POST /create-checkout
 * Body: { "price_id": "price_xxx", "user_id": "uuid" }
 * Auth: JWT required
 *
 * Response (200):
 * { "checkout_url": "https://checkout.stripe.com/..." }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeSecretKey) {
      return new Response(
        JSON.stringify({ error: 'Stripe is not configured' }),
        { status: 503, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );

    const body = await req.json();
    const { price_id, user_id } = body;

    if (!price_id || typeof price_id !== 'string') {
      return new Response(
        JSON.stringify({ error: 'price_id is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    if (!user_id || typeof user_id !== 'string') {
      return new Response(
        JSON.stringify({ error: 'user_id is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    // Get user email for Stripe
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Failed to get user info' }),
        { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    const siteUrl = Deno.env.get('SITE_URL') ?? 'https://tryeatpal.com';

    // Create Stripe checkout session via REST API
    const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        'mode': 'subscription',
        'payment_method_types[0]': 'card',
        'line_items[0][price]': price_id,
        'line_items[0][quantity]': '1',
        'success_url': `${siteUrl}/dashboard/billing?session_id={CHECKOUT_SESSION_ID}&success=true`,
        'cancel_url': `${siteUrl}/pricing?canceled=true`,
        'customer_email': user.email ?? '',
        'client_reference_id': user_id,
        'metadata[user_id]': user_id,
        'subscription_data[metadata][user_id]': user_id,
      }),
    });

    if (!stripeResponse.ok) {
      const stripeError = await stripeResponse.json();
      console.error('Stripe error:', stripeError);
      return new Response(
        JSON.stringify({ error: 'Failed to create checkout session', details: stripeError.error?.message }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    const session = await stripeResponse.json();

    // Store pending subscription
    await supabaseClient.from('user_subscriptions').upsert({
      user_id,
      status: 'pending',
      stripe_customer_id: session.customer ?? null,
      stripe_subscription_id: session.subscription ?? null,
    }, { onConflict: 'user_id' });

    return new Response(
      JSON.stringify({ checkout_url: session.url }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  } catch (error) {
    console.error('create-checkout error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  }
});
