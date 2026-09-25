/**
 * What an Apple-signed transaction is allowed to write to apple_subscriptions.
 *
 * Two writers use this:
 *   - verify-app-store-transaction: the device posts Transaction.jwsRepresentation
 *     and the server writes the row, deriving every column from the signed
 *     payload. The caller contributes only who they are (from their JWT).
 *   - app-store-notifications: when Apple notifies about a transaction that
 *     has no row yet, the row may be created for the user named by the
 *     transaction's appAccountToken.
 *
 * appAccountToken MAPPING: the iOS app sets appAccountToken to the signed-in
 * Supabase user's id (auth.users.id, a uuid) when it calls
 * product.purchase(options: [.appAccountToken(userId)]). Apple copies it into
 * every transaction and notification for that purchase, so it names the
 * EatPal account the purchase was made from. Transactions made by builds that
 * predate this carry no token.
 *
 * Pure: no network, no Deno APIs, so the vitest mirror imports it directly.
 */

/** The bundle id of the shipped app (ios/EatPal/project.yml). */
export const APP_BUNDLE_ID = 'com.eatpal.app';

/**
 * Every product the app sells (ios/EatPal/EatPal/Services/StoreKitService.swift,
 * SubscriptionProduct). Keep in step with the SQL list in
 * supabase/migrations/20260928000012_apple_subscription_client_caps.sql.
 */
export const KNOWN_APP_STORE_PRODUCT_IDS: readonly string[] = [
  'com.eatpal.app.pro.monthly',
  'com.eatpal.app.pro.yearly',
  'com.eatpal.app.familyplus.monthly',
  'com.eatpal.app.familyplus.yearly',
  'com.eatpal.app.professional.monthly',
  'com.eatpal.app.professional.yearly',
];

export type AppleSubscriptionStatus = 'active' | 'expired' | 'revoked';

/** The fields of a JWSTransactionDecodedPayload this code reads. */
export interface SignedTransaction {
  transactionId: string;
  originalTransactionId: string;
  bundleId: string;
  productId: string;
  expiresDate: number | null;
  revocationDate: number | null;
  environment: string | null;
  appAccountToken: string | null;
}

/** The apple_subscriptions row as the writer needs to see it. */
export interface ExistingAppleRow {
  user_id: string;
  status: string | null;
  expires_at: string | null;
  store_transaction_id: string | null;
}

/** Columns the server writes. user_id is only ever set on insert. */
export interface AppleRowWrite {
  original_transaction_id: string;
  store_transaction_id: string;
  product_id: string;
  status: AppleSubscriptionStatus;
  expires_at: string;
  environment: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function str(v: unknown): string | null {
  if (typeof v === 'string' && v.length > 0) return v;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return null;
}

function ms(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null;
}

/** A uuid-shaped appAccountToken, lowercased; anything else is null. */
export function normalizeAccountToken(v: unknown): string | null {
  return typeof v === 'string' && UUID_RE.test(v) ? v.toLowerCase() : null;
}

/** Read the fields we use out of a verified payload. Null if the ids are missing. */
export function readSignedTransaction(payload: Record<string, unknown>): SignedTransaction | null {
  const transactionId = str(payload.transactionId);
  const originalTransactionId = str(payload.originalTransactionId);
  if (!transactionId || !originalTransactionId) return null;
  return {
    transactionId,
    originalTransactionId,
    bundleId: str(payload.bundleId) ?? '',
    productId: str(payload.productId) ?? '',
    expiresDate: ms(payload.expiresDate),
    revocationDate: ms(payload.revocationDate),
    environment: str(payload.environment),
    appAccountToken: normalizeAccountToken(payload.appAccountToken),
  };
}

/** Status the signed transaction itself implies at `now`. */
export function statusFromTransaction(txn: SignedTransaction, now: Date): AppleSubscriptionStatus {
  if (txn.revocationDate !== null) return 'revoked';
  if (txn.expiresDate !== null && txn.expiresDate <= now.getTime()) return 'expired';
  return 'active';
}

export type RowRefusal = { ok: false; status: 400 | 422; code: string; message: string };

/**
 * The columns a signed transaction produces, or why it produces none. Refuses
 * the wrong app, a product this app does not sell, and a transaction with no
 * expiry (every product here is an auto-renewable subscription; an entitlement
 * with no end date is exactly the forged row this work closes).
 */
export function rowFromTransaction(
  txn: SignedTransaction,
  now: Date,
  expectedBundleId: string = APP_BUNDLE_ID,
): { ok: true; row: AppleRowWrite } | RowRefusal {
  if (txn.bundleId !== expectedBundleId) {
    return { ok: false, status: 422, code: 'wrong_bundle', message: 'Transaction is for a different app' };
  }
  if (!KNOWN_APP_STORE_PRODUCT_IDS.includes(txn.productId)) {
    return { ok: false, status: 422, code: 'unknown_product', message: 'Transaction is for an unknown product' };
  }
  if (txn.expiresDate === null) {
    return { ok: false, status: 422, code: 'missing_expiry', message: 'Transaction has no expiry date' };
  }
  return {
    ok: true,
    row: {
      original_transaction_id: txn.originalTransactionId,
      store_transaction_id: txn.transactionId,
      product_id: txn.productId,
      status: statusFromTransaction(txn, now),
      expires_at: new Date(txn.expiresDate).toISOString(),
      environment: txn.environment,
    },
  };
}

export const TRANSACTION_OWNED_ELSEWHERE_CODE = 'transaction_owned_by_another_account';

export type VerifyDecision =
  | { kind: 'refuse'; status: 400 | 409 | 422; code: string; message: string }
  | { kind: 'insert'; row: AppleRowWrite & { user_id: string } }
  | { kind: 'update'; row: AppleRowWrite }
  /** Nothing to write: the stored row is newer or already says more. */
  | { kind: 'keep' };

/**
 * verify-app-store-transaction's decision, given a verified payload, the
 * caller's user id, and the row already stored under that
 * original_transaction_id (null when there is none).
 *
 *   - 409 when the row belongs to someone else, or when the purchase was made
 *     under a different EatPal account (appAccountToken names another user).
 *   - A stale snapshot never overwrites a newer one: a transaction that
 *     expires before the stored row is ignored. That is what stops a replayed
 *     pre-refund JWS from reviving a subscription Apple has revoked.
 *   - For the same transaction id, a server-set 'revoked' or 'expired' stands:
 *     the device may hold a copy signed before Apple revoked it.
 */
export function decideVerifiedTransaction(input: {
  payload: Record<string, unknown>;
  callerUserId: string;
  existing: ExistingAppleRow | null;
  now: Date;
  expectedBundleId?: string;
}): VerifyDecision {
  const txn = readSignedTransaction(input.payload);
  if (!txn) {
    return { kind: 'refuse', status: 400, code: 'not_a_transaction', message: 'Signed payload is not a transaction' };
  }
  const built = rowFromTransaction(txn, input.now, input.expectedBundleId);
  if (!built.ok) return { kind: 'refuse', status: built.status, code: built.code, message: built.message };

  const caller = input.callerUserId.toLowerCase();
  if (txn.appAccountToken && txn.appAccountToken !== caller) {
    return {
      kind: 'refuse',
      status: 409,
      code: TRANSACTION_OWNED_ELSEWHERE_CODE,
      message: 'This purchase was made from a different account',
    };
  }

  const existing = input.existing;
  if (!existing) return { kind: 'insert', row: { ...built.row, user_id: caller } };

  if (existing.user_id.toLowerCase() !== caller) {
    return {
      kind: 'refuse',
      status: 409,
      code: TRANSACTION_OWNED_ELSEWHERE_CODE,
      message: 'This purchase is linked to a different account',
    };
  }

  const storedExpiry = existing.expires_at ? Date.parse(existing.expires_at) : NaN;
  const incomingExpiry = Date.parse(built.row.expires_at);
  if (Number.isFinite(storedExpiry) && incomingExpiry < storedExpiry) return { kind: 'keep' };

  const sameTransaction = existing.store_transaction_id === built.row.store_transaction_id;
  if (
    sameTransaction &&
    built.row.status === 'active' &&
    (existing.status === 'revoked' || existing.status === 'expired')
  ) {
    return { kind: 'keep' };
  }

  return { kind: 'update', row: built.row };
}

/**
 * The status an App Store Server Notification V2 moves a subscription to, or
 * null when the notification does not change access. Moved unchanged from
 * app-store-notifications/index.ts.
 */
export function statusForNotification(notificationType: string): AppleSubscriptionStatus | null {
  switch (notificationType) {
    case 'REFUND':
    case 'REVOKE':
      return 'revoked';
    case 'EXPIRED':
      return 'expired';
    case 'SUBSCRIBED':
    case 'DID_RENEW':
    case 'OFFER_REDEEMED':
    case 'RESUBSCRIBE':
      return 'active';
    default:
      // GRACE_PERIOD_EXPIRED, DID_CHANGE_RENEWAL_STATUS/PREF, PRICE_INCREASE,
      // TEST, etc. don't change current access.
      return null;
  }
}

export type NotificationInsert =
  | { insert: true; row: AppleRowWrite & { user_id: string } }
  | { insert: false; reason: string };

/**
 * Whether app-store-notifications may CREATE a row for a transaction it found
 * no row for. Only when the whole certificate chain verified against the
 * pinned root (the legacy check it keeps for updates does not prove Apple
 * signed anything), the transaction carries an appAccountToken, and it is for
 * this app and a product this app sells. The status is the notification's.
 */
export function decideNotificationInsert(input: {
  txnPayload: Record<string, unknown>;
  notificationStatus: AppleSubscriptionStatus;
  chainVerified: boolean;
  now: Date;
  expectedBundleId?: string;
}): NotificationInsert {
  if (!input.chainVerified) return { insert: false, reason: 'chain_not_verified' };
  const txn = readSignedTransaction(input.txnPayload);
  if (!txn) return { insert: false, reason: 'not_a_transaction' };
  if (!txn.appAccountToken) return { insert: false, reason: 'no_app_account_token' };
  const built = rowFromTransaction(txn, input.now, input.expectedBundleId);
  if (!built.ok) return { insert: false, reason: built.code };
  return {
    insert: true,
    row: { ...built.row, status: input.notificationStatus, user_id: txn.appAccountToken },
  };
}
