// Deno tests for the pure parts of delete-account (owner decision 1a).
// Run with: deno test supabase/functions/_shared/accountDeletion.test.ts
// Vitest mirror: src/lib/accountDeletionShared.test.ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { parseDeleteMode, stripeSubscriptionToCancel, toPreflight } from './accountDeletion.ts';

Deno.test('only an explicit preflight is a preflight; the iOS body is a delete', () => {
  assertEquals(parseDeleteMode({ mode: 'preflight' }), 'preflight');
  assertEquals(parseDeleteMode({}), 'delete');
  assertEquals(parseDeleteMode(null), 'delete');
  assertEquals(parseDeleteMode({ mode: 'PREFLIGHT' }), 'delete');
  assertEquals(parseDeleteMode(['preflight']), 'delete');
});

Deno.test('the server cancels a live Stripe subscription and nothing else', () => {
  const live = { status: 'active', cancel_at_period_end: false, is_complementary: false, stripe_subscription_id: 'sub_123' };
  assertEquals(stripeSubscriptionToCancel(live), 'sub_123');
  assertEquals(stripeSubscriptionToCancel({ ...live, status: 'trialing' }), 'sub_123');
  assertEquals(stripeSubscriptionToCancel({ ...live, status: 'past_due' }), 'sub_123');
  assertEquals(stripeSubscriptionToCancel({ ...live, status: 'canceled' }), null);
  assertEquals(stripeSubscriptionToCancel({ ...live, cancel_at_period_end: true }), null);
  assertEquals(stripeSubscriptionToCancel({ ...live, is_complementary: true }), null);
  assertEquals(stripeSubscriptionToCancel({ ...live, stripe_subscription_id: null }), null);
  // An App Store purchase mirrored without a Stripe id.
  assertEquals(stripeSubscriptionToCancel({ ...live, stripe_subscription_id: '2000000123456789' }), null);
  assertEquals(stripeSubscriptionToCancel(null), null);
});

Deno.test('toPreflight reshapes the RPC summary and tolerates junk', () => {
  const view = toPreflight({
    sole_member: false,
    households: [{
      household_id: 'h1', household_name: 'The Parks', successor_user_id: 'u2',
      successor_name: 'Sam', successor_role: 'parent', remaining_members: 2, kid_names: ['Mia', 'Leo', 3],
    }, { household_id: 'h2' }],
    transferred: { kids: 2, foods: '4' },
    left_for_deletion: { kids: 0, junk: 'x' },
  });
  assertEquals(view, {
    soleMember: false,
    households: [{
      householdId: 'h1', householdName: 'The Parks', successorUserId: 'u2', successorName: 'Sam',
      successorRole: 'parent', remainingMembers: 2, kidNames: ['Mia', 'Leo'],
    }],
    transferred: { kids: 2, foods: 4 },
    deleted: { kids: 0 },
  });
  assertEquals(toPreflight(null), { soleMember: true, households: [], transferred: {}, deleted: {} });
});
