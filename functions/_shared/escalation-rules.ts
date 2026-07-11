/**
 * Declarative escalation rules engine (US-492).
 *
 * Escalation routing is data, not code: rules live in agent_escalation_rules and
 * are evaluated by this pure function so policy changes need no deploy. Free of
 * runtime/DB/network so it is fully unit-testable.
 *
 * A rule's `condition` is a small JSON DSL:
 *   Clause (all present operators must hold — AND):
 *     { field, equals }            field value equals a string
 *     { field, in: [...] }         field value is in a list
 *     { anyKeyword: [...] }        any keyword is a substring of input.text
 *     { olderThanHours: n }        input.ageHours >= n  (SLA)
 *     { statusIn: [...] }          input.status is in a list
 *   Condition:
 *     Clause                       a single clause
 *     { any: [Clause, ...] }       OR of clauses
 */

export interface RuleInput {
  category?: string | null;
  sentiment?: string | null;
  priority?: string | null;
  status?: string | null;
  /** Lowercased subject + body for keyword matching. */
  text?: string;
  /** Hours since the ticket last needed action (for SLA rules). */
  ageHours?: number | null;
}

export interface RuleClause {
  field?: 'category' | 'sentiment' | 'priority' | 'status';
  equals?: string;
  in?: string[];
  anyKeyword?: string[];
  olderThanHours?: number;
  statusIn?: string[];
}

export type RuleCondition = RuleClause | { any: RuleClause[] };

export interface EscalationRule {
  id: string;
  domain: string | null;
  condition: RuleCondition;
  tier: number;
  severity: string;
  enabled: boolean;
  description: string | null;
}

export interface MatchedEscalation {
  rule_id: string;
  domain: string | null;
  tier: number;
  severity: string;
  description: string | null;
}

const SEVERITY_RANK: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };

function fieldValue(input: RuleInput, field: string): string | null | undefined {
  switch (field) {
    case 'category':
      return input.category;
    case 'sentiment':
      return input.sentiment;
    case 'priority':
      return input.priority;
    case 'status':
      return input.status;
    default:
      return undefined;
  }
}

/** Match a single clause: every operator present in the clause must hold. */
export function matchClause(input: RuleInput, clause: RuleClause): boolean {
  let sawOperator = false;

  if (clause.field && clause.equals !== undefined) {
    sawOperator = true;
    if (fieldValue(input, clause.field) !== clause.equals) return false;
  }
  if (clause.field && clause.in) {
    sawOperator = true;
    const v = fieldValue(input, clause.field);
    if (v == null || !clause.in.includes(v)) return false;
  }
  if (clause.anyKeyword) {
    sawOperator = true;
    const text = input.text ?? '';
    if (!clause.anyKeyword.some((k) => text.includes(k.toLowerCase()))) return false;
  }
  if (clause.olderThanHours !== undefined) {
    sawOperator = true;
    if (input.ageHours == null || input.ageHours < clause.olderThanHours) return false;
  }
  if (clause.statusIn) {
    sawOperator = true;
    if (input.status == null || !clause.statusIn.includes(input.status)) return false;
  }

  return sawOperator; // an empty clause matches nothing
}

export function matchCondition(input: RuleInput, condition: RuleCondition): boolean {
  if (condition && typeof condition === 'object' && 'any' in condition) {
    return condition.any.some((c) => matchClause(input, c));
  }
  return matchClause(input, condition as RuleClause);
}

/** Return every enabled rule that matches the input. */
export function evaluateEscalationRules(
  input: RuleInput,
  rules: EscalationRule[],
): MatchedEscalation[] {
  return rules
    .filter((r) => r.enabled)
    .filter((r) => matchCondition(input, r.condition))
    .map((r) => ({
      rule_id: r.id,
      domain: r.domain,
      tier: r.tier,
      severity: r.severity,
      description: r.description,
    }));
}

/**
 * Collapse multiple matches into a single escalation: highest tier, then
 * highest severity, carrying every matched reason + rule id. Null when empty.
 */
export function topEscalation(matches: MatchedEscalation[]): {
  tier: number;
  severity: string;
  domain: string | null;
  reasons: string[];
  rule_ids: string[];
} | null {
  if (matches.length === 0) return null;
  const best = matches.reduce((a, b) => {
    if (b.tier !== a.tier) return b.tier > a.tier ? b : a;
    return (SEVERITY_RANK[b.severity] ?? 0) > (SEVERITY_RANK[a.severity] ?? 0) ? b : a;
  });
  return {
    tier: best.tier,
    severity: best.severity,
    domain: best.domain,
    reasons: matches.map((m) => m.description ?? m.rule_id),
    rule_ids: matches.map((m) => m.rule_id),
  };
}
