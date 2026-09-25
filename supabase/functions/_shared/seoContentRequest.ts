/**
 * Body validation and model-output parsing for the two admin SEO tools,
 * analyze-semantic-keywords and optimize-page-content.
 *
 * Both handlers used to destructure `await req.json()` straight into a fetch
 * and a prompt: a non-string url reached `fetch()`, a megabyte of contentText
 * reached the model, and competitor URLs were fetched with no host check. The
 * rules here run after requireAdmin and before anything is fetched or spent.
 *
 * Pure: no Deno globals, no network. URL rules come from url-rules.ts, the
 * Deno-free half of url-validator.ts, so this file type-checks in the web
 * project too.
 * Vitest mirror: src/lib/seoContentRequestShared.test.ts.
 */
import { extractJsonObject } from './modelJson.ts';
import { validateUrl } from './url-rules.ts';

/** Longest URL accepted. Anything longer is not a page an admin pasted. */
export const MAX_URL_CHARS = 2048;
/** Longest target keyword accepted. */
export const MAX_KEYWORD_CHARS = 200;
/** Pasted content cap. The prompt only reads the first 2000 characters. */
export const MAX_CONTENT_TEXT_CHARS = 50_000;
/** Competitor pages actually fetched; extra entries are ignored, as before. */
export const MAX_COMPETITOR_URLS = 3;
/** Entries accepted in competitorUrls before the request is refused. */
export const MAX_COMPETITOR_ENTRIES = 20;

export type BodyParse<T> = { ok: true; value: T } | { ok: false; error: string };

export interface SemanticKeywordsRequest {
  url: string | null;
  targetKeyword: string | null;
  contentText: string | null;
}

export interface PageOptimizationRequest {
  url: string;
  targetKeyword: string | null;
  competitorUrls: string[];
  includeContentGapAnalysis: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Empty string, null and undefined all mean "not given". */
function optionalString(
  body: Record<string, unknown>,
  key: string,
  max: number,
): BodyParse<string | null> {
  const raw = body[key];
  if (raw === undefined || raw === null) return { ok: true, value: null };
  if (typeof raw !== 'string') return { ok: false, error: `${key} must be a string` };
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: true, value: null };
  if (trimmed.length > max) return { ok: false, error: `${key} must be at most ${max} characters` };
  return { ok: true, value: trimmed };
}

/** An https URL on a public host, or a refusal naming the field. */
function checkUrl(field: string, url: string): BodyParse<string> {
  if (url.length > MAX_URL_CHARS) {
    return { ok: false, error: `${field} must be at most ${MAX_URL_CHARS} characters` };
  }
  const check = validateUrl(url);
  if (!check.valid) return { ok: false, error: `${field}: ${check.error ?? 'URL rejected'}` };
  return { ok: true, value: url };
}

export function parseSemanticKeywordsRequest(body: unknown): BodyParse<SemanticKeywordsRequest> {
  if (!isRecord(body)) return { ok: false, error: 'Request body must be a JSON object' };

  const url = optionalString(body, 'url', MAX_URL_CHARS);
  if (!url.ok) return url;
  const targetKeyword = optionalString(body, 'targetKeyword', MAX_KEYWORD_CHARS);
  if (!targetKeyword.ok) return targetKeyword;
  const contentText = optionalString(body, 'contentText', MAX_CONTENT_TEXT_CHARS);
  if (!contentText.ok) return contentText;

  if (!url.value && !contentText.value) {
    return { ok: false, error: 'Either URL or contentText is required' };
  }

  // The URL is only fetched when no contentText is given, but a URL that is
  // stored alongside the analysis is still checked.
  if (url.value) {
    const checked = checkUrl('url', url.value);
    if (!checked.ok) return checked;
  }

  return {
    ok: true,
    value: { url: url.value, targetKeyword: targetKeyword.value, contentText: contentText.value },
  };
}

export function parsePageOptimizationRequest(body: unknown): BodyParse<PageOptimizationRequest> {
  if (!isRecord(body)) return { ok: false, error: 'Request body must be a JSON object' };

  const url = optionalString(body, 'url', MAX_URL_CHARS);
  if (!url.ok) return url;
  if (!url.value) return { ok: false, error: 'URL is required' };
  const checkedUrl = checkUrl('url', url.value);
  if (!checkedUrl.ok) return checkedUrl;

  const targetKeyword = optionalString(body, 'targetKeyword', MAX_KEYWORD_CHARS);
  if (!targetKeyword.ok) return targetKeyword;

  const rawCompetitors = body.competitorUrls ?? [];
  if (!Array.isArray(rawCompetitors)) {
    return { ok: false, error: 'competitorUrls must be an array of URLs' };
  }
  if (rawCompetitors.length > MAX_COMPETITOR_ENTRIES) {
    return { ok: false, error: `competitorUrls must have at most ${MAX_COMPETITOR_ENTRIES} entries` };
  }
  const competitorUrls: string[] = [];
  for (const entry of rawCompetitors) {
    if (typeof entry !== 'string') return { ok: false, error: 'competitorUrls must be an array of URLs' };
    const trimmed = entry.trim();
    if (trimmed.length === 0) continue;
    const checked = checkUrl('competitorUrls', trimmed);
    if (!checked.ok) return checked;
    competitorUrls.push(trimmed);
  }

  const rawInclude = body.includeContentGapAnalysis;
  if (rawInclude !== undefined && rawInclude !== null && typeof rawInclude !== 'boolean') {
    return { ok: false, error: 'includeContentGapAnalysis must be a boolean' };
  }

  return {
    ok: true,
    value: {
      url: checkedUrl.value,
      targetKeyword: targetKeyword.value,
      competitorUrls: competitorUrls.slice(0, MAX_COMPETITOR_URLS),
      includeContentGapAnalysis: rawInclude ?? true,
    },
  };
}

/**
 * The JSON object in a model reply, or null.
 *
 * Tolerates a ```json fence, prose around the object and trailing commas,
 * which is what the handlers already stripped by hand. A reply that parses to
 * something other than an object is null: every caller reads named fields.
 */
export function parseModelJsonObject(content: string): Record<string, unknown> | null {
  return extractJsonObject(content);
}
