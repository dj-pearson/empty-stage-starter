/**
 * US-842: a TTL any unrelated write can renew is not a TTL.
 *
 * The old cache was `{ flags: Record<string, boolean>, timestamp: number }` --
 * ONE timestamp for every flag. Both readers rejected the whole object once it
 * aged past five minutes, and all three writers reset that timestamp to now.
 * So writing any flag renewed every other flag in the cache, and a value whose
 * consumer was not currently mounted could stay "fresh" for as long as the
 * browser stayed open.
 *
 * The first test below is the one that matters: it is the old behaviour,
 * written out, and it must fail.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  FLAG_CACHE_KEY,
  FLAG_CACHE_TTL_MS,
  evictFlag,
  readAllFlags,
  readFlag,
  writeFlag,
  writeFlags,
} from './featureFlagCache';

const T0 = 1_700_000_000_000;
const later = (ms: number) => T0 + ms;

beforeEach(() => {
  localStorage.clear();
});

describe('US-842: a write renews only what it wrote', () => {
  it('does not renew an unrelated flag', () => {
    writeFlag('old_flag', true, T0);

    // Four minutes later something else is evaluated. Under the old shape this
    // set the shared timestamp to now and old_flag became fresh again.
    writeFlag('other_flag', false, later(4 * 60_000));

    // Six minutes after old_flag was written, it is stale, whatever else has
    // been written since.
    expect(readFlag('old_flag', later(6 * 60_000))).toBeNull();
    expect(readFlag('other_flag', later(6 * 60_000))).toBe(false);
  });

  it('cannot be kept alive indefinitely by a busy neighbour', () => {
    writeFlag('kill_switch', true, T0);
    for (let minute = 1; minute <= 60; minute += 1) {
      writeFlag('chatty_flag', true, later(minute * 60_000));
    }
    expect(readFlag('kill_switch', later(61 * 60_000))).toBeNull();
  });

  it('expires exactly at the TTL boundary, not before', () => {
    writeFlag('f', true, T0);
    expect(readFlag('f', later(FLAG_CACHE_TTL_MS))).toBe(true);
    expect(readFlag('f', later(FLAG_CACHE_TTL_MS + 1))).toBeNull();
  });
});

describe('US-842: reading', () => {
  it('distinguishes a cached false from a cache miss', () => {
    writeFlag('f', false, T0);
    expect(readFlag('f', T0)).toBe(false);
    expect(readFlag('never_written', T0)).toBeNull();
  });

  it('readAllFlags returns only the flags still inside their own TTL', () => {
    writeFlag('fresh_one', true, later(5 * 60_000));
    writeFlag('stale_one', true, T0);
    expect(readAllFlags(later(6 * 60_000))).toEqual({ fresh_one: true });
  });

  it('readAllFlags returns null rather than an empty object when nothing is fresh', () => {
    writeFlag('stale_one', true, T0);
    expect(readAllFlags(later(60 * 60_000))).toBeNull();
  });

  it('writeFlags timestamps each key it writes', () => {
    writeFlags({ a: true, b: false }, T0);
    writeFlags({ b: true }, later(4 * 60_000));
    expect(readFlag('a', later(6 * 60_000))).toBeNull();
    expect(readFlag('b', later(6 * 60_000))).toBe(true);
  });
});

describe('US-842: eviction is what the admin dashboard does now', () => {
  it('forgets the flag so the next read misses and re-evaluates', () => {
    writeFlag('rollout_flag', true, T0);
    evictFlag('rollout_flag');
    expect(readFlag('rollout_flag', T0)).toBeNull();
  });

  it('leaves every other flag alone', () => {
    writeFlags({ a: true, b: true }, T0);
    evictFlag('a');
    expect(readFlag('a', T0)).toBeNull();
    expect(readFlag('b', T0)).toBe(true);
  });

  it('is a no-op on an empty cache', () => {
    expect(() => evictFlag('nothing')).not.toThrow();
  });
});

describe('US-842: what is on disk from before', () => {
  it('rejects a versionless payload even when its entries look modern', () => {
    // The discriminating case. An old-shape payload happens to be rejected by
    // the freshness arithmetic anyway (`now - undefined` is NaN), so it does
    // not prove the version check does anything. This one would be read
    // happily without it.
    localStorage.setItem(
      FLAG_CACHE_KEY,
      JSON.stringify({ flags: { modern_looking: { value: true, at: T0 } } })
    );
    expect(readFlag('modern_looking', T0)).toBeNull();
    expect(readAllFlags(T0)).toBeNull();
  });

  it('treats the old single-timestamp shape as expired rather than trusting it', () => {
    // Its values may have been renewed arbitrarily far past their real age --
    // that is the defect -- so there is nothing worth carrying forward.
    localStorage.setItem(
      FLAG_CACHE_KEY,
      JSON.stringify({ flags: { legacy: true }, timestamp: T0 })
    );
    expect(readFlag('legacy', T0)).toBeNull();
    expect(readAllFlags(T0)).toBeNull();
  });

  it('replaces the old shape on the next write without losing the new value', () => {
    localStorage.setItem(
      FLAG_CACHE_KEY,
      JSON.stringify({ flags: { legacy: true }, timestamp: T0 })
    );
    writeFlag('modern', true, T0);
    expect(readFlag('modern', T0)).toBe(true);
    expect(readFlag('legacy', T0)).toBeNull();
  });

  it('survives corrupt JSON and a non-object payload', () => {
    localStorage.setItem(FLAG_CACHE_KEY, '{not json');
    expect(readFlag('f', T0)).toBeNull();
    localStorage.setItem(FLAG_CACHE_KEY, '"a string"');
    expect(readAllFlags(T0)).toBeNull();
    expect(() => writeFlag('f', true, T0)).not.toThrow();
    expect(readFlag('f', T0)).toBe(true);
  });

  it('keeps the key US-835 scrubs on sign-out', () => {
    // signOutScrub.ts lists this literal; renaming it here would silently take
    // the flag cache off the sign-out scrub list.
    expect(FLAG_CACHE_KEY).toBe('eatpal_feature_flags');
  });
});

describe('US-842: the admin surface may forget a flag, never assert one', () => {
  it('FeatureFlagDashboard imports eviction and nothing that writes a value', () => {
    // The dashboard cannot compute the per-user rollout result, so writing any
    // value from there is a claim it is not in a position to make. Enforced on
    // the import rather than the call so a new write site cannot be added
    // quietly either.
    const source = readFileSync(
      join(process.cwd(), 'src', 'components', 'admin', 'FeatureFlagDashboard.tsx'),
      'utf8'
    );
    const importLine = source
      .split('\n')
      .find((line) => line.includes('@/lib/featureFlagCache'));
    expect(importLine, 'the dashboard no longer imports the flag cache at all').toBeTruthy();
    expect(importLine).toContain('evictFlag');
    expect(importLine).not.toMatch(/\bwriteFlags?\b/);
    expect(source).not.toMatch(/\bwriteFlags?\(/);
  });
});
