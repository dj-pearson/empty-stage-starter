import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { SAFETY_RESOURCES, AI_COACH_DISCLAIMER, CRISIS_HELP_LINE, detectRedFlags, telHref } from './aiSafety';

/**
 * The crisis resources exist twice - once for the model (Deno) and once for the
 * UI (web) - because the two trees cannot import each other. A number that is
 * right in one place and stale in the other is worse than no number, so these
 * tests fail the build the moment they disagree.
 */
const EDGE_SAFETY = readFileSync(
  path.resolve(__dirname, '../../supabase/functions/_shared/safety.ts'),
  'utf-8'
);

describe('AI safety resources', () => {
  it.each(SAFETY_RESOURCES)('$name is mirrored in the edge function', (resource) => {
    expect(EDGE_SAFETY).toContain(resource.name);
    expect(EDGE_SAFETY).toContain(resource.contact);
  });

  it('lists the same number of resources on both sides', () => {
    const edgeEntries = EDGE_SAFETY.match(/^\s*name: '/gm) ?? [];
    expect(edgeEntries).toHaveLength(SAFETY_RESOURCES.length);
  });

  it('surfaces the helpline numbers in UI copy, not only in the prompt', () => {
    expect(CRISIS_HELP_LINE).toContain('988');
    expect(CRISIS_HELP_LINE).toContain('1-888-375-7767');
  });

  it('says plainly that the coach is not medical advice', () => {
    expect(AI_COACH_DISCLAIMER).toMatch(/not medical advice/i);
    expect(AI_COACH_DISCLAIMER).toMatch(/pediatrician/i);
  });
});

describe('edge-function safety prompt', () => {
  it('tells the model to stop coaching rather than counsel through a crisis', () => {
    expect(EDGE_SAFETY).toMatch(/STOP coaching/);
    expect(EDGE_SAFETY).toMatch(/do not counsel/i);
  });

  it('covers self-harm, disordered eating, and medical symptoms', () => {
    expect(EDGE_SAFETY).toMatch(/Suicidal thoughts, self-harm/i);
    expect(EDGE_SAFETY).toMatch(/eating disorder/i);
    expect(EDGE_SAFETY).toMatch(/choking/i);
  });

  it('forbids diagnosis and child weight-management advice', () => {
    expect(EDGE_SAFETY).toMatch(/Never diagnose/i);
    expect(EDGE_SAFETY).toMatch(/Never set calorie targets, weight goals/i);
  });
});

describe('safety block wiring', () => {
  const readFn = (name: string) =>
    readFileSync(path.resolve(__dirname, '../../supabase/functions', name, 'index.ts'), 'utf-8');

  it('applies full safety rules to the free-text coach', () => {
    expect(readFn('ai-coach-chat')).toMatch(/content:\s*withSafetyRules\(systemPrompt\)/);
  });

  it.each(['ai-meal-plan', 'suggest-recipe', 'suggest-foods'])(
    'applies standing limits to %s',
    (fn) => {
      expect(readFn(fn)).toMatch(/withStandingLimits\(systemPrompt\)/);
    }
  );
});

describe('detectRedFlags', () => {
  const tiers = (text: string) => detectRedFlags(text).map((f) => f.tier);

  it.each([
    ['He was choking on a grape', 'emergency'],
    ["She can't breathe after eating shrimp", 'emergency'],
    ['His lips are turning blue', 'emergency'],
    ['Her face is swollen', 'emergency'],
    ['broke out in hives after dinner', 'emergency'],
    ['last time it was anaphylaxis', 'emergency'],
    ['she has lost weight this month', 'clinician'],
    ['he is losing weight', 'clinician'],
    ['not gaining at all according to the chart', 'clinician'],
    ['I think he is dehydrated', 'clinician'],
    ["she hasn't eaten in 2 days", 'clinician'],
    ['he vomits after meals', 'clinician'],
    ['she only eats 5 foods', 'eating_disorder'],
    ["he won't eat anything", 'eating_disorder'],
    ['she has a fear of eating', 'eating_disorder'],
    ['could this be ARFID?', 'eating_disorder'],
    ['I feel suicidal', 'crisis'],
    ['worried about self-harm', 'crisis'],
    ['I want to die', 'crisis'],
  ])('%s -> %s', (text, tier) => {
    expect(tiers(text)).toContain(tier);
  });

  it.each(['peanut butter sandwich', 'the weight of the pan', 'she only eats beige food', 'he ate a blueberry'])(
    'no flag for %s',
    (text) => {
      expect(detectRedFlags(text)).toEqual([]);
    },
  );

  it('documents the figurative "chokes up" false positive', () => {
    // Kept on purpose: see the comment on RedFlagTier.
    expect(tiers('she chokes up with emotion')).toEqual(['emergency']);
  });

  it('dedupes by tier, emergency first, with the matching resource', () => {
    const flags = detectRedFlags('ARFID? she only eats 3 foods, lost weight, and was choking yesterday');
    expect(flags.map((f) => f.tier)).toEqual(['emergency', 'clinician', 'eating_disorder']);
    expect(flags[0].resource.contact).toContain('911');
    expect(flags[2].resource.contact).toBe('1-888-375-7767');
    expect(detectRedFlags('self-harm')[0].resource.contact).toContain('988');
  });
});

describe('telHref', () => {
  it('pulls the dialable digits from each resource', () => {
    expect(telHref('call or text 988 (US)')).toBe('tel:988');
    expect(telHref('1-888-375-7767')).toBe('tel:18883757767');
    expect(telHref('911 in an emergency (US)')).toBe('tel:911');
  });

  it('gives every resource a number', () => {
    for (const r of SAFETY_RESOURCES) expect(telHref(r.contact)).toMatch(/^tel:\d+$/);
  });

  it('returns null without a number', () => {
    expect(telHref('your pediatrician')).toBeNull();
  });
});
