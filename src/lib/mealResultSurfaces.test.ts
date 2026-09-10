import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Logging a meal by voice and logging it in the app must leave Health in the
 * same state.
 *
 * `LogMealResultIntent` runs without AppState and writes plan_entries.result
 * straight through DataService, so it skipped everything
 * `AppState.updatePlanEntry` does after the write. HealthKit sync was one of
 * those things. A user who had opted into Health sync got a nutrition log that
 * was complete or not depending on which surface they happened to use, with
 * nothing to tell them which.
 *
 * Both paths now go through `HealthKitService.applyMealResult`. Keeping the
 * logic in one place is the actual fix; these assertions are here to stop it
 * being copied back apart.
 *
 * Badges and the analytics event are still in-app only -- see US-853.
 */

const ROOT = path.resolve(__dirname, '../..');
const read = (relative: string) => readFileSync(path.join(ROOT, relative), 'utf8');

const SERVICE = read('ios/EatPal/EatPal/Services/HealthKitService.swift');
const APP_STATE = read('ios/EatPal/EatPal/App/AppState.swift');
const INTENT = read('ios/EatPal/EatPal/Intents/MealAppIntents.swift');

describe('meal result surfaces', () => {
  it('has one shared implementation', () => {
    expect(SERVICE).toContain('func applyMealResult(');
    // Neither caller reimplements the recipe lookup or the date parse.
    for (const [name, source] of [
      ['AppState', APP_STATE],
      ['LogMealResultIntent', INTENT],
    ] as const) {
      expect(source, `${name} calls the shared helper`).toContain('applyMealResult(');
      expect(source, `${name} still builds its own write`).not.toContain('service.writeMeal(');
    }
  });

  it('runs from the in-app path', () => {
    const branch = APP_STATE.slice(APP_STATE.indexOf('let isEaten = result == MealResult.ate.rawValue')).slice(
      0,
      300,
    );
    expect(branch).toContain('syncHealthSample(for: entry, isEaten: isEaten)');
  });

  it('runs from the Siri path', () => {
    const perform = INTENT.slice(INTENT.indexOf('let domainResult = mapResult(result)')).slice(0, 900);
    expect(perform).toContain('syncHealth(matches: matches, isEaten:');
    // After the rows are written, not instead of.
    expect(perform.indexOf('DataService.shared.updatePlanEntry')).toBeLessThan(
      perform.indexOf('syncHealth(matches:'),
    );
  });

  it('does not turn a Health failure into a failed voice command', () => {
    // The meal is logged either way; Siri reporting an error for a HealthKit
    // problem would be a lie about what happened.
    const fn = INTENT.slice(INTENT.indexOf('private func syncHealth('));
    const body = fn.slice(0, fn.indexOf('\n    private func mapResult'));
    expect(body).toContain('SentryService.capture');
    expect(body).not.toContain('throw');
  });

  it('applies the removal side too', () => {
    const fn = SERVICE.slice(SERVICE.indexOf('func applyMealResult('));
    const body = fn.slice(0, fn.indexOf('\n    /// Removes the meal'));
    expect(body).toContain('guard isEaten else {');
    expect(body).toContain('deleteMeal(planEntryId: entry.id)');
  });
});
