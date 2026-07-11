/**
 * Pure RLS-audit analysis for the RLS/permission audit agent (US-511).
 *
 * DB-free: takes the rows returned by the agent_rls_audit RPC (per-table RLS
 * status + policy summaries) and produces findings + a week-over-week diff.
 * Unit-testable against synthetic catalog fixtures.
 */

export interface TablePolicy {
  policyname: string;
  /** 'ALL' | 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' */
  cmd: string;
  /** USING expression text, or null. Postgres renders `USING (true)` as 'true'. */
  qual: string | null;
  /** WITH CHECK expression text, or null. */
  with_check: string | null;
  roles: string[];
}

export interface TableRls {
  schemaname: string;
  tablename: string;
  rls_enabled: boolean;
  /** True when the table has a user_id/household_id column (owner-scoped data). */
  has_user_data: boolean;
  policies: TablePolicy[];
}

export type FindingType = 'rls_disabled' | 'no_policies' | 'overly_permissive';

export interface RlsFinding {
  type: FindingType;
  table: string;
  /** True when the table holds owner-scoped (user) data — drives tier bump. */
  userData: boolean;
  detail: string;
  /** Names of the offending policies, when relevant. */
  policies?: string[];
}

const qualified = (t: TableRls) => `${t.schemaname}.${t.tablename}`;

/** A USING/CHECK expression that grants everyone access unconditionally. */
function isUnconditional(expr: string | null): boolean {
  if (!expr) return false;
  return expr.trim().toLowerCase() === 'true';
}

/** Reads-everyone policy: SELECT or ALL with an unconditional USING. */
function isReadEveryone(p: TablePolicy): boolean {
  const cmd = p.cmd.toUpperCase();
  return (cmd === 'SELECT' || cmd === 'ALL') && isUnconditional(p.qual);
}

/**
 * Classify every table into findings. Empty array = clean.
 *
 * - rls_disabled: RLS is off entirely.
 * - no_policies: RLS is on but the table has zero policies (deny-all, but almost
 *   always a mistake — the table is unreachable).
 * - overly_permissive: an owner-scoped table exposes a `USING (true)` SELECT/ALL
 *   policy, i.e. every authenticated user can read everyone's rows.
 */
export function analyzeRls(tables: TableRls[]): RlsFinding[] {
  const findings: RlsFinding[] = [];
  for (const t of tables) {
    const name = qualified(t);
    if (!t.rls_enabled) {
      findings.push({
        type: 'rls_disabled',
        table: name,
        userData: t.has_user_data,
        detail: t.has_user_data
          ? 'RLS is DISABLED on a table containing user data — rows are readable by anyone with table access.'
          : 'RLS is disabled.',
      });
      // A table with RLS off has no meaningful policies to further audit.
      continue;
    }
    if (t.policies.length === 0) {
      findings.push({
        type: 'no_policies',
        table: name,
        userData: t.has_user_data,
        detail: 'RLS is enabled but the table has no policies — it is effectively unreachable (deny-all). Likely a missing policy.',
      });
      continue;
    }
    if (t.has_user_data) {
      const leaky = t.policies.filter(isReadEveryone);
      if (leaky.length > 0) {
        findings.push({
          type: 'overly_permissive',
          table: name,
          userData: true,
          detail: `USING (true) SELECT/ALL policy on an owner-scoped table lets every user read all rows.`,
          policies: leaky.map((p) => p.policyname),
        });
      }
    }
  }
  return findings;
}

/**
 * Highest tier warranted by a finding set. Default tier-2; a table with user
 * data and RLS disabled is tier-3 (act now). Empty findings → null (no escalation).
 */
export function escalationTier(findings: RlsFinding[]): 2 | 3 | null {
  if (findings.length === 0) return null;
  const urgent = findings.some((f) => f.type === 'rls_disabled' && f.userData);
  return urgent ? 3 : 2;
}

export interface AuditSnapshot {
  tables: string[];
  /** "schema.table::policyname" for every policy present. */
  policies: string[];
}

/** Reduce a table list to the comparable snapshot shape. */
export function toSnapshot(tables: TableRls[]): AuditSnapshot {
  const tableNames: string[] = [];
  const policies: string[] = [];
  for (const t of tables) {
    const name = qualified(t);
    tableNames.push(name);
    for (const p of t.policies) policies.push(`${name}::${p.policyname}`);
  }
  return { tables: tableNames.sort(), policies: policies.sort() };
}

export interface SnapshotDiff {
  newTables: string[];
  newPolicies: string[];
  removedTables: string[];
  removedPolicies: string[];
}

/** What changed since the previous audit. `prev` null → everything is "new". */
export function diffSnapshots(prev: AuditSnapshot | null, current: AuditSnapshot): SnapshotDiff {
  const prevTables = new Set(prev?.tables ?? []);
  const prevPolicies = new Set(prev?.policies ?? []);
  const curTables = new Set(current.tables);
  const curPolicies = new Set(current.policies);
  return {
    newTables: current.tables.filter((t) => !prevTables.has(t)),
    newPolicies: current.policies.filter((p) => !prevPolicies.has(p)),
    removedTables: [...prevTables].filter((t) => !curTables.has(t)).sort(),
    removedPolicies: [...prevPolicies].filter((p) => !curPolicies.has(p)).sort(),
  };
}
