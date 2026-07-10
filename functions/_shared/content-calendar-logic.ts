/**
 * Pure logic for the content calendar agent (US-502).
 *
 * DB-free so topic normalization and duplicate filtering are unit-testable.
 */

export type ContentType = 'blog' | 'social';

export interface ContentProposal {
  topic: string;
  content_type: ContentType;
  keywords: string[];
  rationale: string;
}

/** Normalize a topic into a duplicate-detection fingerprint. */
export function normalizeTopic(topic: string): string {
  return topic
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Drop proposals whose fingerprint already exists (in the calendar or the
 * published blog inventory) or that duplicate another proposal in this batch.
 */
export function dedupeProposals(
  proposals: ContentProposal[],
  existingFingerprints: Set<string>,
): ContentProposal[] {
  const seen = new Set(existingFingerprints);
  const out: ContentProposal[] = [];
  for (const p of proposals) {
    const fp = normalizeTopic(p.topic);
    if (!fp || seen.has(fp)) continue;
    seen.add(fp);
    out.push(p);
  }
  return out;
}

/** Read the seed keyword list from an agent's autonomy_policy. */
export function seedKeywords(autonomyPolicy: Record<string, unknown> | null | undefined): string[] {
  const kw = autonomyPolicy?.content_keywords;
  return Array.isArray(kw) ? kw.filter((k): k is string => typeof k === 'string') : [];
}
