import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { SAFETY_RESOURCES, AI_COACH_DISCLAIMER, CRISIS_HELP_LINE } from './aiSafety';

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
