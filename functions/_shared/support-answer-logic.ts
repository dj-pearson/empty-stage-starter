/**
 * Pure decision logic for the RAG support answer agent (US-491).
 *
 * Free of runtime/DB/network so the "draft vs escalate" gate and the approval
 * payload shape are unit-testable.
 */

/** Minimum cosine similarity for the top KB match to be considered relevant. */
export const MIN_SIMILARITY = 0.75;

export type ModelConfidence = 'low' | 'medium' | 'high';

export interface KnowledgeMatch {
  id: string;
  title: string;
  content: string;
  similarity: number;
}

/** Is the best retrieval match relevant enough to ground an answer? */
export function retrievalConfident(matches: KnowledgeMatch[], min: number = MIN_SIMILARITY): boolean {
  if (matches.length === 0) return false;
  return matches[0].similarity >= min;
}

/**
 * Decide whether to draft a reply or escalate.
 * Escalate when retrieval is weak OR the model itself reports low confidence;
 * otherwise draft. Keeps low-quality answers out of the approval queue.
 */
export function decideAnswer(
  matches: KnowledgeMatch[],
  modelConfidence: ModelConfidence,
  min: number = MIN_SIMILARITY,
): 'draft' | 'escalate' {
  if (!retrievalConfident(matches, min)) return 'escalate';
  if (modelConfidence === 'low') return 'escalate';
  return 'draft';
}

/** Compact record of which KB entries grounded the answer (for the approval UI). */
export function knowledgeUsed(matches: KnowledgeMatch[]): Array<{ id: string; title: string; similarity: number }> {
  return matches.map((m) => ({
    id: m.id,
    title: m.title,
    similarity: Math.round(m.similarity * 1000) / 1000,
  }));
}

/** Reply subject line for a ticket (adds "Re:" once). */
export function replySubject(subject: string): string {
  return /^re:/i.test(subject.trim()) ? subject.trim() : `Re: ${subject}`;
}
