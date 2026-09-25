// Vitest mirror of the Deno tests for create-checkout's server-side double-billing guard.
// Deno twin: supabase/functions/_shared/checkoutEntitlement.test.ts
import { expect, it } from 'vitest';
import {
  ALREADY_SUBSCRIBED_CODE,
  ENTITLEMENT_UNVERIFIED_CODE,
  decideCheckoutGate,
  entitlementSource,
  type EntitlementFacts,
} from '../../supabase/functions/_shared/checkoutEntitlement';

const expectEq = (actual: unknown, expected: unknown) => expect(actual).toEqual(expected);

const NOW = new Date('2026-09-25T12:00:00Z');
const FREE: EntitlementFacts = { stripe: null, apple: [], effectivePlanName: null };

it('a new account with no rows may check out', () => {
  expectEq(decideCheckoutGate({ ok: true, facts: FREE }, NOW), { allow: true });
});

it('an effective Free plan may check out', () => {
  expectEq(entitlementSource({ ...FREE, effectivePlanName: 'Free' }, NOW), null);
});

it('an active or trialing Stripe subscription is refused with 409', () => {
  for (const status of ['active', 'trialing']) {
    const gate = decideCheckoutGate(
      { ok: true, facts: { ...FREE, stripe: { status, stripe_subscription_id: 'sub_XXXX' }, effectivePlanName: 'Pro' } },
      NOW,
    );
    expectEq(gate.allow, false);
    if (!gate.allow) {
      expectEq(gate.status, 409);
      expectEq(gate.code, ALREADY_SUBSCRIBED_CODE);
    }
  }
});

it('past_due with a Stripe subscription is still a live subscription', () => {
  expectEq(entitlementSource({ ...FREE, stripe: { status: 'past_due', stripe_subscription_id: 'sub_XXXX' } }, NOW), 'stripe');
});

it('an incomplete row left by an abandoned checkout may check out', () => {
  expectEq(entitlementSource({ ...FREE, stripe: { status: 'incomplete', stripe_subscription_id: null } }, NOW), null);
});

it('a canceled Stripe row may check out again', () => {
  expectEq(entitlementSource({ ...FREE, stripe: { status: 'canceled', stripe_subscription_id: 'sub_XXXX' } }, NOW), null);
});

it('an active, unexpired App Store subscription is refused', () => {
  const facts = { ...FREE, apple: [{ status: 'active', expires_at: '2026-10-25T00:00:00Z' }], effectivePlanName: 'Pro' };
  expectEq(entitlementSource(facts, NOW), 'appStore');
});

it('an expired App Store row does not count', () => {
  const facts = { ...FREE, apple: [{ status: 'active', expires_at: '2026-09-01T00:00:00Z' }] };
  expectEq(entitlementSource(facts, NOW), null);
});

it('an App Store row with no expiry counts, as in effective_plan_id', () => {
  expectEq(entitlementSource({ ...FREE, apple: [{ status: 'active', expires_at: null }] }, NOW), 'appStore');
});

it('a complimentary plan is refused whether flagged on the row or only in effective_plan_id', () => {
  expectEq(
    entitlementSource({ ...FREE, stripe: { status: 'active', stripe_subscription_id: null, is_complementary: true } }, NOW),
    'comp',
  );
  expectEq(entitlementSource({ ...FREE, effectivePlanName: 'Family Plus' }, NOW), 'comp');
});

it('a failed lookup refuses with 503 rather than guessing free', () => {
  const gate = decideCheckoutGate({ ok: false }, NOW);
  expectEq(gate.allow, false);
  if (!gate.allow) {
    expectEq(gate.status, 503);
    expectEq(gate.code, ENTITLEMENT_UNVERIFIED_CODE);
  }
});
