import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A deferred purchase is not a cancelled one.
 *
 * `Product.PurchaseResult.pending` means the purchase is waiting on somebody
 * else. On a family meal-planning app that is overwhelmingly Ask to Buy: a
 * child taps Subscribe, iOS sends an approval request to the parent, and
 * nothing else happens until they act.
 *
 * StoreKitService.purchase returned `Transaction?`, so `.pending` and
 * `.userCancelled` both came back as nil and the paywall's `!= nil` check
 * treated them identically -- no toast, no state change, the button simply
 * re-enabled. From the child's side that is indistinguishable from a dead
 * button, and tapping it again sends the parent another request each time.
 * The entitlement does arrive later through Transaction.updates; what was
 * missing was ever saying so.
 *
 * Source-contract assertions: there is no Swift runtime here, and StoreKit
 * cannot be driven outside a device or a StoreKit test session anyway.
 */

const ROOT = path.resolve(__dirname, '../..');
const read = (relative: string) => readFileSync(path.join(ROOT, relative), 'utf8');

const SERVICE = read('ios/EatPal/EatPal/Services/StoreKitService.swift');
const PAYWALL = read('ios/EatPal/EatPal/Views/Subscription/PaywallView.swift');

/** The body of `StoreKitService.purchase`. */
const purchaseBody = (() => {
  const start = SERVICE.indexOf('func purchase(_ product: Product)');
  expect(start, 'StoreKitService.purchase not found').toBeGreaterThan(-1);
  return SERVICE.slice(start, SERVICE.indexOf('\n    // MARK: - Restore', start));
})();

describe('purchase outcomes', () => {
  it('models the three outcomes separately', () => {
    for (const outcome of ['case completed(', 'case cancelled', 'case awaitingApproval']) {
      expect(SERVICE).toContain(outcome);
    }
    // Returning an optional Transaction is what collapsed pending into
    // cancelled in the first place.
    expect(purchaseBody).not.toContain('async throws -> StoreKit.Transaction?');
  });

  it('maps .pending to awaitingApproval, not to cancelled', () => {
    const pending = purchaseBody.slice(purchaseBody.indexOf('case .pending:'));
    const nextCase = pending.indexOf('case ', 'case .pending:'.length);
    expect(pending.slice(0, nextCase)).toContain('.awaitingApproval');
  });

  it('never unlocks anything on an unknown future case', () => {
    const unknown = purchaseBody.slice(purchaseBody.indexOf('@unknown default:'));
    expect(unknown.slice(0, 300)).toContain('.cancelled');
    expect(unknown.slice(0, 300)).not.toContain('.completed');
  });

  it('tells the user when a purchase is waiting on someone else', () => {
    expect(PAYWALL).toContain('case .awaitingApproval:');
    const branch = PAYWALL.slice(PAYWALL.indexOf('case .awaitingApproval:')).slice(0, 700);
    expect(branch).toContain('ToastManager.shared.info');
    // And does not close the paywall: nothing has been bought yet.
    const beforeNextCase = branch.slice(0, branch.indexOf('case .cancelled:'));
    expect(beforeNextCase).not.toContain('dismiss()');
  });

  it('still confirms and closes on a completed purchase', () => {
    const branch = PAYWALL.slice(PAYWALL.indexOf('case .completed:')).slice(0, 500);
    expect(branch).toContain('ToastManager.shared.success');
    expect(branch).toContain('dismiss()');
  });
});
