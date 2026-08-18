import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

/**
 * US-631 guards for the trial-reminder job.
 *
 * The job is Deno and cannot be imported here, so these assert the properties
 * that make it safe rather than exercising it: it must not double-send, it must
 * state the money terms, and it must not silently swallow a whole run. An
 * integration test needs a database and a Stripe fixture, which the repo does
 * not have.
 */
const FN = readFileSync(
  path.resolve(__dirname, '../../supabase/functions/schedule-trial-reminders/index.ts'),
  'utf-8'
);
const MIGRATION = readFileSync(
  path.resolve(__dirname, '../../supabase/migrations/20260818000001_trial_reminder_emails.sql'),
  'utf-8'
);

describe('trial reminder job', () => {
  it('only looks at subscriptions that are actually trialing', () => {
    expect(FN).toMatch(/\.eq\('status', 'trialing'\)/);
  });

  it('reminds at 3 days and 1 day', () => {
    expect(FN).toMatch(/label: '3d', days: 3/);
    expect(FN).toMatch(/label: '1d', days: 1/);
  });

  it('claims the send before queueing the email, so a failure cannot double-send', () => {
    const claimAt = FN.indexOf("from('subscription_notifications')");
    const queueAt = FN.indexOf("from('automation_email_queue')");

    expect(claimAt).toBeGreaterThan(-1);
    expect(queueAt).toBeGreaterThan(claimAt);
  });

  it('treats a unique violation as already-sent rather than an error', () => {
    expect(FN).toMatch(/'23505'/);
    expect(FN).toMatch(/results\.skipped\+\+/);
  });

  it('states the amount, the date, and how to cancel', () => {
    expect(FN).toMatch(/trial_end_date:/);
    expect(FN).toMatch(/amount:/);
    expect(FN).toMatch(/manage_url:/);
    expect(FN).toMatch(/won't be billed/);
  });

  it('keeps one subscription failure from killing the run', () => {
    const loopBody = FN.slice(FN.indexOf('for (const sub of'), FN.indexOf('console.log('));
    expect(loopBody).toMatch(/catch \(err\)/);
    expect(loopBody).toMatch(/results\.failed\+\+/);
  });
});

describe('trial reminder migration', () => {
  it('seeds both templates the job asks for', () => {
    expect(MIGRATION).toMatch(/'trial_ending_3d'/);
    expect(MIGRATION).toMatch(/'trial_ending_1d'/);
  });

  it('makes the idempotency index unique and partial', () => {
    expect(MIGRATION).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_notifications_trial_window/);
    expect(MIGRATION).toMatch(/WHERE notification_type = 'trial_ending'/);
    expect(MIGRATION).toMatch(/metadata ->> 'window'/);
  });

  it('tells the reader how to cancel in both templates', () => {
    const bodies = MIGRATION.match(/Cancel[^<]*not be billed|cancel before[^<]*not be billed/gi) ?? [];
    expect(bodies.length).toBeGreaterThanOrEqual(2);
  });

  it('does not reintroduce the gradient header the house style bans', () => {
    const newTemplates = MIGRATION.slice(MIGRATION.indexOf('trial_ending_3d'));
    expect(newTemplates).not.toMatch(/linear-gradient/);
  });
});

describe('dead trial automation', () => {
  it('is gone, not left looking live', () => {
    const stale = path.resolve(__dirname, 'trial-automation.ts');
    expect(() => readFileSync(stale, 'utf-8')).toThrow();
  });
});
