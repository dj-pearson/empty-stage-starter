import { describe, it, expect } from 'vitest';
import { totalsFromFunnelEvents, type FunnelEventRow } from './funnelTotals';
import { ACTIVATION_EVENT_TYPES } from './conversion-tracking';

const row = (event_type: string, user_id: string | null = null): FunnelEventRow => ({
  event_type,
  user_id,
});

describe('counting funnel_events (US-707)', () => {
  it('counts an acquisition step by event, because it is one per visit', () => {
    const totals = totalsFromFunnelEvents([
      row('landing_view'),
      row('landing_view'),
      row('landing_view'),
    ]);
    expect(totals.pageViews).toBe(3);
  });

  /**
   * The reason this module exists. A household adds forty foods and activates
   * once; counting rows would put "Pantry Started" above "Account Signups" and
   * the chart would be unreadable.
   */
  it('counts an activation step by distinct account, not by event', () => {
    const totals = totalsFromFunnelEvents([
      row('food_added', 'user-1'),
      row('food_added', 'user-1'),
      row('food_added', 'user-1'),
      row('food_added', 'user-2'),
    ]);
    expect(totals.foodsAdded).toBe(2);
  });

  it('never lets an activation step exceed the signups above it, for one account', () => {
    const totals = totalsFromFunnelEvents([
      row('signup'),
      ...Array.from({ length: 50 }, () => row('meal_planned', 'user-1')),
    ]);
    expect(totals.mealsPlanned).toBe(1);
    expect(totals.mealsPlanned).toBeLessThanOrEqual(totals.signups);
  });

  it('drops an activation row with no account rather than counting it as one', () => {
    // It should not happen -- these all fire behind the login -- but a row that
    // cannot be attributed cannot be part of a per-account count.
    const totals = totalsFromFunnelEvents([
      row('child_created', null),
      row('child_created', 'user-1'),
    ]);
    expect(totals.childrenCreated).toBe(1);
  });

  it('keeps an acquisition row with no account, because most of them have none', () => {
    const totals = totalsFromFunnelEvents([row('quiz_start'), row('quiz_start')]);
    expect(totals.quizStarts).toBe(2);
  });

  it('reports zero for every step on an empty table', () => {
    const totals = totalsFromFunnelEvents([]);
    expect(Object.values(totals).every((n) => n === 0)).toBe(true);
  });

  it('ignores an event type it does not know', () => {
    const totals = totalsFromFunnelEvents([row('something_new', 'user-1'), row('signup')]);
    expect(totals.signups).toBe(1);
    expect(Object.values(totals).reduce((a, b) => a + b, 0)).toBe(1);
  });

  it('has a total for every activation type the tracker can emit', () => {
    // A new type added to conversion-tracking.ts with no total here would be
    // recorded and never shown, which is the state this story started in.
    const totals = totalsFromFunnelEvents(
      ACTIVATION_EVENT_TYPES.map((type) => row(type, 'user-1')),
    );
    const activationTotals = [
      totals.onboardingStarts,
      totals.onboardingCompletes,
      totals.onboardingSkips,
      totals.childrenCreated,
      totals.foodsAdded,
      totals.mealsPlanned,
    ];
    expect(activationTotals).toHaveLength(ACTIVATION_EVENT_TYPES.length);
    expect(activationTotals.every((n) => n === 1)).toBe(true);
  });

  it('counts a whole mixed day the way the dashboard renders it', () => {
    const totals = totalsFromFunnelEvents([
      row('landing_view'),
      row('landing_view'),
      row('signup', 'user-1'),
      row('onboarding_start', 'user-1'),
      row('onboarding_complete', 'user-1'),
      row('child_created', 'user-1'),
      row('food_added', 'user-1'),
      row('food_added', 'user-1'),
      row('meal_planned', 'user-1'),
      row('paid_conversion', 'user-1'),
    ]);
    expect(totals).toMatchObject({
      pageViews: 2,
      signups: 1,
      onboardingStarts: 1,
      onboardingCompletes: 1,
      childrenCreated: 1,
      foodsAdded: 1,
      mealsPlanned: 1,
      paidConversions: 1,
    });
  });
});
