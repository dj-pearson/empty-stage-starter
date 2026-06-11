import { describe, it, expect } from 'vitest';
import {
  getPriceMap,
  getPriceAllowlist,
  isAllowedPriceId,
  resolveCheckoutPrice,
  type EnvGetter,
} from '../../../functions/_shared/stripe-pricing';

/**
 * US-326: create-checkout must validate the Stripe price against a server-side
 * allowlist (or resolve a plan key server-side) so a client cannot pass an
 * arbitrary or cheaper price_id and provision a paid tier at the wrong price.
 * These tests cover the shared resolution helper in
 * functions/_shared/stripe-pricing.ts.
 */

// Build an env getter from a plain record, mirroring Deno.env.get.
function env(vars: Record<string, string | undefined>): EnvGetter {
  return (key) => vars[key];
}

const PRICE_MAP = JSON.stringify({
  pro_monthly: 'price_pro_m',
  pro_yearly: 'price_pro_y',
  family: 'price_family',
});

describe('getPriceMap', () => {
  it('parses a valid JSON map', () => {
    expect(getPriceMap(env({ STRIPE_PRICE_MAP: PRICE_MAP }))).toEqual({
      pro_monthly: 'price_pro_m',
      pro_yearly: 'price_pro_y',
      family: 'price_family',
    });
  });

  it('returns empty object on missing or invalid JSON', () => {
    expect(getPriceMap(env({}))).toEqual({});
    expect(getPriceMap(env({ STRIPE_PRICE_MAP: 'not json' }))).toEqual({});
    expect(getPriceMap(env({ STRIPE_PRICE_MAP: '["array"]' }))).toEqual({});
  });

  it('drops non-string / empty values', () => {
    const map = getPriceMap(env({ STRIPE_PRICE_MAP: '{"a":"price_a","b":1,"c":""}' }));
    expect(map).toEqual({ a: 'price_a' });
  });
});

describe('getPriceAllowlist', () => {
  it('unions explicit allowlist with map values', () => {
    const allow = getPriceAllowlist(
      env({
        STRIPE_PRICE_MAP: PRICE_MAP,
        STRIPE_PRICE_ALLOWLIST: 'price_extra1, price_extra2',
      }),
    );
    expect([...allow].sort()).toEqual(
      ['price_extra1', 'price_extra2', 'price_family', 'price_pro_m', 'price_pro_y'].sort(),
    );
  });

  it('splits the allowlist on commas and whitespace', () => {
    const allow = getPriceAllowlist(env({ STRIPE_PRICE_ALLOWLIST: 'price_a price_b,price_c\nprice_d' }));
    expect([...allow].sort()).toEqual(['price_a', 'price_b', 'price_c', 'price_d']);
  });

  it('is empty when nothing is configured', () => {
    expect(getPriceAllowlist(env({})).size).toBe(0);
  });
});

describe('isAllowedPriceId', () => {
  const getEnv = env({ STRIPE_PRICE_MAP: PRICE_MAP });
  it('accepts an allowlisted price', () => {
    expect(isAllowedPriceId('price_pro_m', getEnv)).toBe(true);
  });
  it('rejects an unknown price', () => {
    expect(isAllowedPriceId('price_attacker', getEnv)).toBe(false);
  });
});

describe('resolveCheckoutPrice', () => {
  const getEnv = env({
    STRIPE_PRICE_MAP: PRICE_MAP,
    STRIPE_PRICE_ALLOWLIST: 'price_native',
  });

  it('accepts a known direct price_id', () => {
    expect(resolveCheckoutPrice({ priceId: 'price_pro_m' }, getEnv)).toEqual({
      ok: true,
      priceId: 'price_pro_m',
    });
  });

  it('accepts a price_id only present in the explicit allowlist', () => {
    expect(resolveCheckoutPrice({ priceId: 'price_native' }, getEnv)).toEqual({
      ok: true,
      priceId: 'price_native',
    });
  });

  it('rejects an arbitrary/unknown price_id with 400 (tampering defense)', () => {
    const r = resolveCheckoutPrice({ priceId: 'price_cheap_attacker' }, getEnv);
    expect(r).toEqual({ ok: false, status: 400, error: 'Invalid price_id' });
  });

  it('resolves a plan key + billing cycle to the server-controlled price', () => {
    expect(
      resolveCheckoutPrice({ planKey: 'pro', billingCycle: 'monthly' }, getEnv),
    ).toEqual({ ok: true, priceId: 'price_pro_m' });
    expect(
      resolveCheckoutPrice({ planKey: 'pro', billingCycle: 'yearly' }, getEnv),
    ).toEqual({ ok: true, priceId: 'price_pro_y' });
  });

  it('falls back to a bare plan key when no cycle-specific entry exists', () => {
    expect(
      resolveCheckoutPrice({ planKey: 'family', billingCycle: 'monthly' }, getEnv),
    ).toEqual({ ok: true, priceId: 'price_family' });
  });

  it('rejects an unknown plan key with 400', () => {
    expect(
      resolveCheckoutPrice({ planKey: 'enterprise', billingCycle: 'monthly' }, getEnv),
    ).toEqual({ ok: false, status: 400, error: 'Invalid or unknown plan' });
  });

  it('rejects when neither price_id nor plan key is provided', () => {
    expect(resolveCheckoutPrice({}, getEnv)).toEqual({
      ok: false,
      status: 400,
      error: 'price_id or planId is required',
    });
  });

  it('ignores a non-string price_id and falls through to plan resolution', () => {
    expect(
      resolveCheckoutPrice({ priceId: 12345, planKey: 'pro', billingCycle: 'monthly' }, getEnv),
    ).toEqual({ ok: true, priceId: 'price_pro_m' });
  });

  it('fails closed with 503 when pricing is not configured', () => {
    const r = resolveCheckoutPrice({ priceId: 'price_pro_m' }, env({}));
    expect(r).toEqual({ ok: false, status: 503, error: 'Stripe pricing is not configured' });
  });
});
