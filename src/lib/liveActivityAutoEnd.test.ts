import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The grocery-trip Live Activity's 8-hour safety net was documented but not
 * implemented.
 *
 * The header said "Activities auto-end 8 hours after start as a safety net so
 * abandoned trips don't stick on the Lock Screen forever". Nothing ended
 * anything. `autoEndInterval` was only ever passed as
 * `ActivityContent.staleDate`, which marks content as out of date so the
 * widget can render accordingly -- it does not end the activity. And every
 * `update` recomputed that date from "now", so a trip being actively checked
 * off never reached it either.
 *
 * The net is real now, and anchored to the trip's own `startedAt` rather than
 * to whenever the last item was ticked. There is no timer to lean on: a
 * suspended app runs no code, so the check happens on launch and on
 * foreground.
 *
 * Source-contract assertions: ActivityKit cannot be driven off-device.
 */

const ROOT = path.resolve(__dirname, '../..');
const read = (relative: string) => readFileSync(path.join(ROOT, relative), 'utf8');

const SERVICE = read('ios/EatPal/EatPal/Services/GroceryTripActivityService.swift');
const ATTRIBUTES = read('ios/EatPal/Shared/GroceryTripActivityAttributes.swift');
const ROOT_VIEW = read('ios/EatPal/EatPal/App/RootView.swift');

describe('grocery trip live activity', () => {
  it('is worth checking: the start time is on the attributes', () => {
    // Floor. Without startedAt there is nothing to age a recovered activity
    // against and the whole approach would need rethinking.
    expect(ATTRIBUTES).toContain('public var startedAt: Date');
  });

  it('actually ends an expired trip', () => {
    expect(SERVICE).toContain('func endIfExpired() async');
    const fn = SERVICE.slice(SERVICE.indexOf('func endIfExpired() async'));
    const body = fn.slice(0, fn.indexOf('\n    /// When a trip stops'));
    expect(body).toContain('Self.deadline(for: current.attributes)');
    expect(body).toContain('await end(');
    // Abandoned, so it should go rather than linger through a grace period.
    expect(body).toContain('.immediate');
  });

  it('anchors the deadline to the start, not to the last update', () => {
    expect(SERVICE).toContain('attributes.startedAt.addingTimeInterval(autoEndInterval)');
    // A stale date recomputed from now on every update is what made the
    // original never fire.
    expect(SERVICE).not.toContain('staleDate: Date().addingTimeInterval');
  });

  it('keeps one definition of the interval', () => {
    const literals = SERVICE.match(/8 \* 60 \* 60/g) ?? [];
    expect(literals.length).toBe(1);
  });

  it('checks on launch and on foreground', () => {
    // A suspended app runs no timers, so these are the only two moments the
    // check can happen.
    const init = SERVICE.slice(SERVICE.indexOf('private init() {'));
    expect(init.slice(0, 900)).toContain('endIfExpired()');
    expect(ROOT_VIEW).toContain('GroceryTripActivityService.shared.endIfExpired()');
  });

  it('ends orphaned activities it cannot manage', () => {
    const init = SERVICE.slice(SERVICE.indexOf('private init() {'));
    const body = init.slice(0, 900);
    expect(body).toContain('dropFirst()');
    expect(body).toContain('dismissalPolicy: .immediate');
  });
});
