// @vitest-environment node
// WebCrypto here must get Node's own typed arrays; jsdom's Uint8Array is a
// different realm and Node 20's subtle.sign rejects it (CI runs Node 20).
// Vitest mirror for what a verified App Store transaction may write, so the
// decision runs in CI without Deno.
// Deno twin: supabase/functions/_shared/appStoreTransaction.test.ts
import { expect, it } from 'vitest';
import {
  KNOWN_APP_STORE_PRODUCT_IDS,
  TRANSACTION_OWNED_ELSEWHERE_CODE,
  decideNotificationInsert,
  decideVerifiedTransaction,
  readSignedTransaction,
  statusForNotification,
  type ExistingAppleRow,
} from '../../supabase/functions/_shared/appStoreTransaction';

const assertEquals = (actual: unknown, expected: unknown) => expect(actual).toEqual(expected);

const NOW = new Date('2026-10-01T12:00:00Z');
const DAY = 86_400_000;
const USER = '11111111-2222-4333-8444-555555555555';
const OTHER = '99999999-2222-4333-8444-555555555555';

function txn(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    transactionId: '2000000900000002',
    originalTransactionId: '2000000900000001',
    bundleId: 'com.eatpal.app',
    productId: 'com.eatpal.app.pro.monthly',
    expiresDate: NOW.getTime() + 30 * DAY,
    environment: 'Production',
    appAccountToken: USER,
    signedDate: NOW.getTime(),
    ...over,
  };
}

const row = (over: Partial<ExistingAppleRow> = {}): ExistingAppleRow => ({
  user_id: USER,
  status: 'active',
  expires_at: new Date(NOW.getTime() + 30 * DAY).toISOString(),
  store_transaction_id: '2000000900000002',
  ...over,
});

const decide = (payload: Record<string, unknown>, existing: ExistingAppleRow | null, caller = USER) =>
  decideVerifiedTransaction({ payload, callerUserId: caller, existing, now: NOW });

it('a new monthly subscription is inserted for the caller, every column from the payload', () => {
  assertEquals(decide(txn(), null), {
    kind: 'insert',
    row: {
      user_id: USER,
      original_transaction_id: '2000000900000001',
      store_transaction_id: '2000000900000002',
      product_id: 'com.eatpal.app.pro.monthly',
      status: 'active',
      expires_at: new Date(NOW.getTime() + 30 * DAY).toISOString(),
      environment: 'Production',
    },
  });
});

it('a yearly subscription and a transaction with no appAccountToken (older builds) are accepted', () => {
  const d = decide(txn({ productId: 'com.eatpal.app.professional.yearly', expiresDate: NOW.getTime() + 365 * DAY, appAccountToken: undefined }), null);
  assertEquals(d.kind, 'insert');
  if (d.kind === 'insert') assertEquals(d.row.product_id, 'com.eatpal.app.professional.yearly');
});

it('the caller id is compared case-insensitively with the token and the row', () => {
  assertEquals(decide(txn({ appAccountToken: USER.toUpperCase() }), row(), USER.toUpperCase()).kind, 'update');
});

it('a transaction already linked to another account is 409', () => {
  const d = decide(txn({ appAccountToken: undefined }), row({ user_id: OTHER }));
  assertEquals(d.kind === 'refuse' && [d.status, d.code], [409, TRANSACTION_OWNED_ELSEWHERE_CODE]);
});

it('a purchase made under another account (appAccountToken) is 409 even with no row', () => {
  const d = decide(txn({ appAccountToken: OTHER }), null);
  assertEquals(d.kind === 'refuse' && [d.status, d.code], [409, TRANSACTION_OWNED_ELSEWHERE_CODE]);
});

it('wrong bundle, unknown product and missing expiry are 422', () => {
  for (const [over, code] of [
    [{ bundleId: 'com.example.other' }, 'wrong_bundle'],
    [{ productId: 'com.eatpal.app.professional.lifetime' }, 'unknown_product'],
    [{ expiresDate: undefined }, 'missing_expiry'],
  ] as const) {
    const d = decide(txn(over), null);
    assertEquals(d.kind === 'refuse' && [d.status, d.code], [422, code]);
  }
});

it('a payload without transaction ids is 400', () => {
  const d = decide({ bundleId: 'com.eatpal.app' }, null);
  assertEquals(d.kind === 'refuse' && d.status, 400);
});

it('status comes from the signed payload: revoked, expired, active', () => {
  const revoked = decide(txn({ revocationDate: NOW.getTime() - DAY }), null);
  assertEquals(revoked.kind === 'insert' && revoked.row.status, 'revoked');
  const expired = decide(txn({ expiresDate: NOW.getTime() - DAY }), null);
  assertEquals(expired.kind === 'insert' && expired.row.status, 'expired');
});

it('a renewal (later expiry, new transaction id) updates the caller row', () => {
  const d = decide(txn({ transactionId: '2000000900000003', expiresDate: NOW.getTime() + 60 * DAY }), row());
  assertEquals(d.kind === 'update' && [d.row.store_transaction_id, d.row.status], ['2000000900000003', 'active']);
});

it('a replayed older transaction writes nothing', () => {
  const stored = row({ expires_at: new Date(NOW.getTime() + 60 * DAY).toISOString(), store_transaction_id: '2000000900000003' });
  assertEquals(decide(txn(), stored), { kind: 'keep' });
});

it('the same transaction cannot bring a server-revoked or server-expired row back to active', () => {
  assertEquals(decide(txn(), row({ status: 'revoked' })), { kind: 'keep' });
  assertEquals(decide(txn(), row({ status: 'expired' })), { kind: 'keep' });
});

it('a newer transaction after a lapse re-activates the row', () => {
  const d = decide(txn({ transactionId: '2000000900000009', expiresDate: NOW.getTime() + 40 * DAY }), row({ status: 'expired' }));
  assertEquals(d.kind === 'update' && d.row.status, 'active');
});

it('a forged forever row owned by the caller is corrected by a real transaction', () => {
  const d = decide(txn(), row({ expires_at: null, store_transaction_id: 'forged' }));
  assertEquals(d.kind === 'update' && d.row.expires_at, new Date(NOW.getTime() + 30 * DAY).toISOString());
});

it('the product list is the six ids StoreKitService.swift sells', () => {
  assertEquals(KNOWN_APP_STORE_PRODUCT_IDS.length, 6);
  for (const tier of ['pro', 'familyplus', 'professional']) {
    for (const period of ['monthly', 'yearly']) {
      assertEquals(KNOWN_APP_STORE_PRODUCT_IDS.includes(`com.eatpal.app.${tier}.${period}`), true);
    }
  }
});

it('readSignedTransaction ignores a token that is not a uuid', () => {
  assertEquals(readSignedTransaction(txn({ appAccountToken: 'not-a-uuid' }))?.appAccountToken, null);
});

it('notification statuses are unchanged from the handler they came from', () => {
  assertEquals(statusForNotification('REFUND'), 'revoked');
  assertEquals(statusForNotification('REVOKE'), 'revoked');
  assertEquals(statusForNotification('EXPIRED'), 'expired');
  for (const t of ['SUBSCRIBED', 'DID_RENEW', 'OFFER_REDEEMED', 'RESUBSCRIBE']) assertEquals(statusForNotification(t), 'active');
  for (const t of ['GRACE_PERIOD_EXPIRED', 'DID_CHANGE_RENEWAL_STATUS', 'TEST', '']) assertEquals(statusForNotification(t), null);
});

it('a notification creates a row only with a verified chain and an appAccountToken', () => {
  const base = { txnPayload: txn(), notificationStatus: 'active' as const, chainVerified: true, now: NOW };
  const ok = decideNotificationInsert(base);
  assertEquals(ok.insert && [ok.row.user_id, ok.row.status, ok.row.product_id], [USER, 'active', 'com.eatpal.app.pro.monthly']);
  assertEquals(decideNotificationInsert({ ...base, chainVerified: false }), { insert: false, reason: 'chain_not_verified' });
  assertEquals(decideNotificationInsert({ ...base, txnPayload: txn({ appAccountToken: undefined }) }), { insert: false, reason: 'no_app_account_token' });
  assertEquals(decideNotificationInsert({ ...base, txnPayload: txn({ bundleId: 'x' }) }), { insert: false, reason: 'wrong_bundle' });
  const refund = decideNotificationInsert({ ...base, notificationStatus: 'revoked' });
  assertEquals(refund.insert && refund.row.status, 'revoked');
});
