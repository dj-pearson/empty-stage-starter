import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import {
  MARKETING_TRIAL_DAYS,
  hasTrial,
  formatTrialLength,
  formatTrialDisclosure,
  firstChargeDate,
} from './trialDisclosure';

describe('hasTrial', () => {
  it.each([
    [7, true],
    [1, true],
    [0, false],
    [null, false],
    [undefined, false],
    [-3, false],
  ])('trialPeriodDays %s -> %s', (days, expected) => {
    expect(hasTrial({ trialPeriodDays: days as number | null | undefined })).toBe(expected);
  });
});

describe('formatTrialLength', () => {
  it('pluralises correctly', () => {
    expect(formatTrialLength(7)).toBe('7 days free');
    expect(formatTrialLength(1)).toBe('1 day free');
  });

  it('returns null with no trial', () => {
    expect(formatTrialLength(0)).toBeNull();
    expect(formatTrialLength(null)).toBeNull();
  });
});

describe('formatTrialDisclosure', () => {
  it('states the amount, the date basis, and how to cancel', () => {
    const copy = formatTrialDisclosure({
      trialPeriodDays: 7,
      price: 9.99,
      billingCycle: 'monthly',
    });

    expect(copy).toContain('Free for 7 days');
    expect(copy).toContain('$9.99 per month');
    expect(copy).toMatch(/email you before the first charge/i);
    expect(copy).toMatch(/cancel any time/i);
  });

  it('uses the yearly cadence when billed yearly', () => {
    expect(
      formatTrialDisclosure({ trialPeriodDays: 14, price: 99, billingCycle: 'yearly' })
    ).toContain('$99.00 per year');
  });

  it('renders nothing for a plan without a trial', () => {
    expect(
      formatTrialDisclosure({ trialPeriodDays: null, price: 9.99, billingCycle: 'monthly' })
    ).toBeNull();
  });
});

describe('firstChargeDate', () => {
  it('lands trialPeriodDays after the start', () => {
    const start = new Date('2026-08-18T12:00:00Z');

    expect(firstChargeDate(7, start).toISOString().slice(0, 10)).toBe('2026-08-25');
  });

  it('does not mutate the date it was given', () => {
    const start = new Date('2026-08-18T12:00:00Z');
    firstChargeDate(30, start);

    expect(start.toISOString().slice(0, 10)).toBe('2026-08-18');
  });
});

describe('MARKETING_TRIAL_DAYS', () => {
  it('matches the trial length the migration seeds', () => {
    const migration = readFileSync(
      path.resolve(__dirname, '../../supabase/migrations/20260818000000_add_plan_trial_period.sql'),
      'utf-8'
    );
    const seeded = migration.match(/SET trial_period_days = (\d+)/)?.[1];

    expect(seeded).toBeDefined();
    expect(Number(seeded)).toBe(MARKETING_TRIAL_DAYS);
  });
});

/**
 * create-checkout is Deno and cannot be imported here. These are structural
 * guards: the trial has to reach Stripe, and it has to come from the plan row
 * rather than a literal, or the page and the session drift apart again.
 */
describe('create-checkout trial wiring', () => {
  const source = readFileSync(
    path.resolve(__dirname, '../../supabase/functions/create-checkout/index.ts'),
    'utf-8'
  );

  it('reads the trial length from the plan row, not a hardcoded number', () => {
    expect(source).toMatch(/plan\.trial_period_days/);
    expect(source).not.toMatch(/trial_period_days:\s*\d+/);
  });

  it('passes the trial to Stripe in subscription_data', () => {
    const subscriptionData = source.slice(
      source.indexOf('subscription_data: {'),
      source.indexOf('    });', source.indexOf('subscription_data: {'))
    );
    expect(subscriptionData).toMatch(/trial_period_days:/);
  });

  it('cancels rather than stranding a trial with no payment method', () => {
    expect(source).toMatch(/missing_payment_method:\s*"cancel"/);
  });

  it('omits trial config entirely for a plan without one', () => {
    expect(source).toMatch(/hasTrial\s*\n?\s*\?/);
    expect(source).toMatch(/:\s*\{\}\)/);
  });
});

describe('trial marketing copy', () => {
  const read = (rel: string) => readFileSync(path.resolve(__dirname, '../..', rel), 'utf-8');

  it.each(['src/pages/Pricing.tsx', 'src/pages/Landing.tsx'])(
    '%s discloses the terms wherever it says free trial',
    (file) => {
      const source = read(file);
      if (!/free trial/i.test(source)) return;
      expect(source).toMatch(/formatTrialDisclosure/);
    }
  );
});
