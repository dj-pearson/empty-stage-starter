// Deno tests for create-checkout's server-side double-billing guard.
// Run with: deno test supabase/functions/_shared/checkoutEntitlement.test.ts
// Vitest mirror: src/lib/checkoutEntitlementShared.test.ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  ALREADY_SUBSCRIBED_CODE,
  ENTITLEMENT_UNVERIFIED_CODE,
  decideCheckoutGate,
  entitlementSource,
  type EntitlementFacts,
} from './checkoutEntitlement.ts';

const NOW = new Date('2026-09-25T12:00:00Z');
const FREE: EntitlementFacts = { stripe: null, apple: [], effectivePlanName: null };

Deno.test('a new account with no rows may check out', () => {
  assertEquals(decideCheckoutGate({ ok: true, facts: FREE }, NOW), { allow: true });
});

Deno.test('an effective Free plan may check out', () => {
  assertEquals(entitlementSource({ ...FREE, effectivePlanName: 'Free' }, NOW), null);
});

Deno.test('an active or trialing Stripe subscription is refused with 409', () => {
  for (const status of ['active', 'trialing']) {
    const gate = decideCheckoutGate(
      { ok: true, facts: { ...FREE, stripe: { status, stripe_subscription_id: 'sub_XXXX' }, effectivePlanName: 'Pro' } },
      NOW,
    );
    assertEquals(gate.allow, false);
    if (!gate.allow) {
      assertEquals(gate.status, 409);
      assertEquals(gate.code, ALREADY_SUBSCRIBED_CODE);
    }
  }
});

Deno.test('past_due with a Stripe subscription is still a live subscription', () => {
  assertEquals(entitlementSource({ ...FREE, stripe: { status: 'past_due', stripe_subscription_id: 'sub_XXXX' } }, NOW), 'stripe');
});

Deno.test('an incomplete row left by an abandoned checkout may check out', () => {
  assertEquals(entitlementSource({ ...FREE, stripe: { status: 'incomplete', stripe_subscription_id: null } }, NOW), null);
});

Deno.test('a canceled Stripe row may check out again', () => {
  assertEquals(entitlementSource({ ...FREE, stripe: { status: 'canceled', stripe_subscription_id: 'sub_XXXX' } }, NOW), null);
});

Deno.test('an active, unexpired App Store subscription is refused', () => {
  const facts = { ...FREE, apple: [{ status: 'active', expires_at: '2026-10-25T00:00:00Z' }], effectivePlanName: 'Pro' };
  assertEquals(entitlementSource(facts, NOW), 'appStore');
});

Deno.test('an expired App Store row does not count', () => {
  const facts = { ...FREE, apple: [{ status: 'active', expires_at: '2026-09-01T00:00:00Z' }] };
  assertEquals(entitlementSource(facts, NOW), null);
});

Deno.test('an App Store row with no expiry counts, as in effective_plan_id', () => {
  assertEquals(entitlementSource({ ...FREE, apple: [{ status: 'active', expires_at: null }] }, NOW), 'appStore');
});

Deno.test('a complimentary plan is refused whether flagged on the row or only in effective_plan_id', () => {
  assertEquals(
    entitlementSource({ ...FREE, stripe: { status: 'active', stripe_subscription_id: null, is_complementary: true } }, NOW),
    'comp',
  );
  assertEquals(entitlementSource({ ...FREE, effectivePlanName: 'Family Plus' }, NOW), 'comp');
});

Deno.test('a failed lookup refuses with 503 rather than guessing free', () => {
  const gate = decideCheckoutGate({ ok: false }, NOW);
  assertEquals(gate.allow, false);
  if (!gate.allow) {
    assertEquals(gate.status, 503);
    assertEquals(gate.code, ENTITLEMENT_UNVERIFIED_CODE);
  }
});
