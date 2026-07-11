/**
 * Unit tests for onboarding nurture templates (US-499).
 * Run with: `deno test functions/_shared/nurture-templates_test.ts`
 */

import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { renderTemplate, NURTURE_TEMPLATES } from './nurture-templates.ts';

const ctx = {
  unsubscribeUrl: 'https://fn.tryeatpal.com/nurture-unsubscribe?t=tok',
  kidCount: 2,
  foodsAdded: 7,
  encouragement: 'You are off to a great start!',
};

Deno.test('all four onboarding templates are registered', () => {
  for (const key of ['welcome', 'add_kid', 'first_plan', 'week1_recap']) {
    assert(key in NURTURE_TEMPLATES, `missing template ${key}`);
  }
});

Deno.test('welcome: templated, has subject + unsubscribe + encouragement', () => {
  const r = renderTemplate('welcome', ctx);
  assertEquals(r.templated, true);
  assert(r.subject.includes('Welcome'));
  assert(r.body.includes(ctx.unsubscribeUrl));
  assert(r.body.includes('You are off to a great start!'));
});

Deno.test('first_plan: merges kid + food counts', () => {
  const r = renderTemplate('first_plan', ctx);
  assert(r.body.includes('7 food'));
  assert(r.body.includes('2 child'));
});

Deno.test('unknown key: generic fallback, not templated', () => {
  const r = renderTemplate('does_not_exist', ctx);
  assertEquals(r.templated, false);
  assert(r.body.includes(ctx.unsubscribeUrl));
});

// AC5 (in-sandbox): the welcome step of a simulated signup enrollment renders a
// real welcome draft. Mirrors the engine's send path for step 0.
Deno.test('signup -> welcome draft (end-to-end template path)', () => {
  const step = { delay_hours: 0, template_key: 'welcome' };
  const rendered = renderTemplate(step.template_key, ctx);
  assertEquals(rendered.templated, true); // templated:true -> bulk-approvable
  assert(rendered.subject.length > 0 && rendered.body.length > 0);
});
