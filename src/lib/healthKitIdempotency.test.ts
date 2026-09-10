import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A meal logged twice must not be counted twice in the Health app.
 *
 * `AppState.updatePlanEntry` writes an HKCorrelation every time a plan
 * entry's result is set to `.ate`, and there are several ways to set it more
 * than once for the same meal: re-tapping the control, marking refused and
 * then eaten again, or logging the same entry from the Siri intent and from
 * the phone. Each of those added another correlation. The user's nutrition for
 * that day was then wrong, and the only way to fix it was deleting the extras
 * by hand in Health.
 *
 * The other half is the reverse: nothing removed the sample when a result
 * moved away from `.ate`, so unmarking a meal left the food in Health for
 * good.
 *
 * Both hang on HKMetadataKeyExternalUUID, which is Apple's field for tying a
 * sample back to the record that produced it. HealthKit does not deduplicate
 * on it by itself, so the check has to be explicit.
 *
 * Source-contract assertions: HealthKit cannot be driven off-device.
 */

const ROOT = path.resolve(__dirname, '../..');
const read = (relative: string) => readFileSync(path.join(ROOT, relative), 'utf8');

const SERVICE = read('ios/EatPal/EatPal/Services/HealthKitService.swift');
const APP_STATE = read('ios/EatPal/EatPal/App/AppState.swift');

/** The body of `HealthKitService.writeMeal`. */
const writeMeal = (() => {
  const start = SERVICE.indexOf('func writeMeal(');
  expect(start, 'writeMeal not found').toBeGreaterThan(-1);
  return SERVICE.slice(start, SERVICE.indexOf('\n    /// Removes the meal', start));
})();

describe('HealthKit meal idempotency', () => {
  it('identifies each sample by the plan entry that produced it', () => {
    expect(writeMeal).toContain('planEntryId: String');
    expect(SERVICE).toContain('HKMetadataKeyExternalUUID: planEntryId');
    // Scoped by that key, so the queries and deletes cannot reach a sample
    // this app did not write for this entry.
    expect(SERVICE).toContain('withMetadataKey: HKMetadataKeyExternalUUID');
  });

  it('checks for an existing sample before writing', () => {
    expect(writeMeal).toContain('hasMealSample(planEntryId: planEntryId)');
    // The guard has to precede the save, not follow it.
    expect(writeMeal.indexOf('hasMealSample')).toBeLessThan(writeMeal.indexOf('store.save'));
  });

  it('treats a failed lookup as "not present"', () => {
    // Writing a possible duplicate is recoverable. Skipping a write the user
    // asked for silently loses their data, so the failure mode is chosen.
    const lookup = SERVICE.slice(SERVICE.indexOf('private func hasMealSample'));
    const body = lookup.slice(0, lookup.indexOf('\n    private static func'));
    expect(body).toContain('if error != nil');
    expect(body).toContain('continuation.resume(returning: false)');
  });

  it('removes the sample when a meal is no longer eaten', () => {
    expect(SERVICE).toContain('func deleteMeal(planEntryId: String)');
    expect(SERVICE).toContain('store.deleteObjects(');
    // And the result branch actually reaches it. Both directions now go
    // through one call that takes `isEaten`, shared with the Siri intent --
    // see src/lib/mealResultSurfaces.test.ts.
    const branch = APP_STATE.slice(
      APP_STATE.indexOf('let isEaten = result == MealResult.ate.rawValue'),
    ).slice(0, 300);
    expect(branch).toContain('syncHealthSample(for: entry, isEaten: isEaten)');
    const apply = SERVICE.slice(SERVICE.indexOf('func applyMealResult('));
    expect(apply.slice(0, 800)).toContain('deleteMeal(planEntryId: entry.id)');
  });

  it('keeps names out of HealthKit metadata', () => {
    // The dish name is deliberate context; a child's name is not, and the
    // opaque row id is not a name.
    expect(SERVICE).toContain('HKMetadataKeyFoodType');
    expect(SERVICE).not.toContain('kidName');
    expect(SERVICE).not.toContain('kidId');
  });
});
