/**
 * Pure classification + escalation-mapping logic for the support triage agent
 * (US-490). Kept free of the runtime/DB/network so the classification-to-
 * escalation decision is unit-testable.
 */

export type TicketCategory =
  | 'bug'
  | 'billing'
  | 'how_to'
  | 'feature_request'
  | 'account_data'
  | 'other';
export type TicketSentiment = 'positive' | 'neutral' | 'frustrated' | 'angry';
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface TicketClassification {
  category: TicketCategory;
  sentiment: TicketSentiment;
  priority: TicketPriority;
  /** Model-suggested ticket tier (1 = routine … 3 = urgent/sensitive). */
  tier: number;
}

export interface EscalationDecision {
  /** agent_escalations.tier (2 or 3). */
  tier: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  /** Human-readable reasons the ticket was escalated. */
  reasons: string[];
}

/**
 * Map a classification to an escalation (or null when none is warranted).
 *
 * Tier model:
 *   - tier 3 (severity high): urgent priority, or account_data category
 *     (potentially sensitive personal-data request).
 *   - tier 2 (severity medium): angry sentiment, or billing category.
 * When several conditions match, the highest tier wins and all reasons are
 * recorded. No match -> null (routine ticket, no escalation).
 */
export function classificationToEscalation(c: TicketClassification): EscalationDecision | null {
  const reasons: string[] = [];
  let tier = 0;

  if (c.priority === 'urgent') {
    reasons.push('urgent priority');
    tier = Math.max(tier, 3);
  }
  if (c.category === 'account_data') {
    reasons.push('account/data request');
    tier = Math.max(tier, 3);
  }
  if (c.sentiment === 'angry') {
    reasons.push('angry sentiment');
    tier = Math.max(tier, 2);
  }
  if (c.category === 'billing') {
    reasons.push('billing issue');
    tier = Math.max(tier, 2);
  }

  if (tier === 0) return null;
  return { tier, severity: tier >= 3 ? 'high' : 'medium', reasons };
}
