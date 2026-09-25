// Vitest mirror for the admin SEO tools' body validation and model-reply
// parsing (analyze-semantic-keywords, optimize-page-content), so the rules run
// in CI without Deno.
import { describe, expect, it } from 'vitest';
import {
  MAX_COMPETITOR_ENTRIES,
  MAX_COMPETITOR_URLS,
  MAX_CONTENT_TEXT_CHARS,
  MAX_KEYWORD_CHARS,
  parseModelJsonObject,
  parsePageOptimizationRequest,
  parseSemanticKeywordsRequest,
} from '../../supabase/functions/_shared/seoContentRequest';

describe('parseSemanticKeywordsRequest', () => {
  it('accepts the body ContentOptimizer sends', () => {
    // targetKeyword: undefined is dropped by JSON, so it arrives absent.
    expect(parseSemanticKeywordsRequest({ url: 'https://tryeatpal.com/blog/picky' })).toEqual({
      ok: true,
      value: { url: 'https://tryeatpal.com/blog/picky', targetKeyword: null, contentText: null },
    });
  });

  it('accepts pasted content with no URL', () => {
    const parsed = parseSemanticKeywordsRequest({ contentText: '  toddler meals  ', targetKeyword: 'picky eater' });
    expect(parsed).toEqual({
      ok: true,
      value: { url: null, targetKeyword: 'picky eater', contentText: 'toddler meals' },
    });
  });

  it.each([
    ['no body', null],
    ['an array', []],
    ['a string', 'https://tryeatpal.com'],
  ])('refuses %s', (_label, body) => {
    expect(parseSemanticKeywordsRequest(body)).toEqual({ ok: false, error: 'Request body must be a JSON object' });
  });

  it('needs a URL or content', () => {
    expect(parseSemanticKeywordsRequest({})).toEqual({ ok: false, error: 'Either URL or contentText is required' });
    expect(parseSemanticKeywordsRequest({ url: '   ', contentText: '' })).toEqual({
      ok: false,
      error: 'Either URL or contentText is required',
    });
  });

  it('refuses a non-string field instead of passing it to fetch', () => {
    expect(parseSemanticKeywordsRequest({ url: { href: 'https://x.test' } })).toEqual({
      ok: false,
      error: 'url must be a string',
    });
    expect(parseSemanticKeywordsRequest({ contentText: 'x', targetKeyword: 7 })).toEqual({
      ok: false,
      error: 'targetKeyword must be a string',
    });
  });

  it('caps pasted content and the keyword', () => {
    expect(parseSemanticKeywordsRequest({ contentText: 'a'.repeat(MAX_CONTENT_TEXT_CHARS + 1) }).ok).toBe(false);
    expect(
      parseSemanticKeywordsRequest({ contentText: 'x', targetKeyword: 'k'.repeat(MAX_KEYWORD_CHARS + 1) }).ok,
    ).toBe(false);
  });

  it.each([
    'http://tryeatpal.com/',
    'https://169.254.169.254/latest/meta-data/',
    'https://localhost:8080/',
    'https://10.0.0.5/admin',
    'https://user:pass@tryeatpal.com/',
    'file:///etc/passwd',
    'not a url',
  ])('refuses %s before anything is fetched', (url) => {
    const parsed = parseSemanticKeywordsRequest({ url });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toMatch(/^url: /);
  });
});

describe('parsePageOptimizationRequest', () => {
  it('accepts the body ContentOptimizer sends', () => {
    expect(
      parsePageOptimizationRequest({
        url: 'https://tryeatpal.com/',
        competitorUrls: ['https://a.example/', ' https://b.example/ ', ''],
        includeContentGapAnalysis: true,
      }),
    ).toEqual({
      ok: true,
      value: {
        url: 'https://tryeatpal.com/',
        targetKeyword: null,
        competitorUrls: ['https://a.example/', 'https://b.example/'],
        includeContentGapAnalysis: true,
      },
    });
  });

  it('defaults competitors to none and gap analysis to on', () => {
    expect(parsePageOptimizationRequest({ url: 'https://tryeatpal.com/' })).toEqual({
      ok: true,
      value: { url: 'https://tryeatpal.com/', targetKeyword: null, competitorUrls: [], includeContentGapAnalysis: true },
    });
  });

  it('requires a URL', () => {
    expect(parsePageOptimizationRequest({})).toEqual({ ok: false, error: 'URL is required' });
    expect(parsePageOptimizationRequest({ contentText: 'x' })).toEqual({ ok: false, error: 'URL is required' });
  });

  it('refuses a private target', () => {
    const parsed = parsePageOptimizationRequest({ url: 'https://192.168.1.1/' });
    expect(parsed.ok).toBe(false);
  });

  it('checks every competitor URL against the same SSRF rules', () => {
    const parsed = parsePageOptimizationRequest({
      url: 'https://tryeatpal.com/',
      competitorUrls: ['https://a.example/', 'https://169.254.169.254/'],
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toMatch(/^competitorUrls: /);
  });

  it('refuses a competitor list that is not an array of strings', () => {
    expect(parsePageOptimizationRequest({ url: 'https://tryeatpal.com/', competitorUrls: 'https://a.example/' })).toEqual({
      ok: false,
      error: 'competitorUrls must be an array of URLs',
    });
    expect(parsePageOptimizationRequest({ url: 'https://tryeatpal.com/', competitorUrls: [42] })).toEqual({
      ok: false,
      error: 'competitorUrls must be an array of URLs',
    });
  });

  it(`fetches at most ${MAX_COMPETITOR_URLS} competitors and refuses an oversized list`, () => {
    const five = ['a', 'b', 'c', 'd', 'e'].map((h) => `https://${h}.example/`);
    const parsed = parsePageOptimizationRequest({ url: 'https://tryeatpal.com/', competitorUrls: five });
    expect(parsed.ok && parsed.value.competitorUrls).toEqual(five.slice(0, MAX_COMPETITOR_URLS));

    const tooMany = Array.from({ length: MAX_COMPETITOR_ENTRIES + 1 }, (_, i) => `https://c${i}.example/`);
    expect(parsePageOptimizationRequest({ url: 'https://tryeatpal.com/', competitorUrls: tooMany }).ok).toBe(false);
  });

  it('refuses a non-boolean gap-analysis flag', () => {
    expect(
      parsePageOptimizationRequest({ url: 'https://tryeatpal.com/', includeContentGapAnalysis: 'yes' }),
    ).toEqual({ ok: false, error: 'includeContentGapAnalysis must be a boolean' });
  });
});

describe('parseModelJsonObject', () => {
  it('reads a fenced reply with a trailing comma', () => {
    expect(parseModelJsonObject('```json\n{"overallScore": 72, "lsiKeywords": [1, 2,],}\n```')).toEqual({
      overallScore: 72,
      lsiKeywords: [1, 2],
    });
  });

  it('reads the object out of surrounding prose', () => {
    expect(parseModelJsonObject('Here you go:\n{"a": {"b": 1}}\nHope that helps')).toEqual({ a: { b: 1 } });
  });

  it.each(['', 'no json here', '[1, 2]', '{"a": ', 'null'])('returns null for %j', (reply) => {
    expect(parseModelJsonObject(reply)).toBeNull();
  });
});
