/**
 * Deterministic backward-compatibility SQL linter for the migration safety
 * checker (US-509). Mirrors the CLAUDE.md "Never do in a single migration" list.
 *
 * Pure and DB/network-free. Flags CANDIDATES; the agent then has Claude judge
 * each in context to drop false positives (e.g. a CHECK widening is safe).
 */

export interface LintViolation {
  rule: string;
  message: string;
  snippet: string;
}

/** Strip -- line comments and /* *\/ block comments (outside dollar-quotes is
 *  good enough for migration files). */
function stripComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

/**
 * Split into statements on ';', but NOT inside dollar-quoted blocks ($$ / $tag$)
 * so function bodies (which contain their own semicolons) stay intact.
 */
export function splitStatements(sql: string): string[] {
  const out: string[] = [];
  let buf = '';
  let i = 0;
  let dollarTag: string | null = null;
  while (i < sql.length) {
    if (dollarTag) {
      if (sql.startsWith(dollarTag, i)) {
        buf += dollarTag;
        i += dollarTag.length;
        dollarTag = null;
        continue;
      }
      buf += sql[i++];
      continue;
    }
    const m = sql.slice(i).match(/^\$[A-Za-z0-9_]*\$/);
    if (m) {
      dollarTag = m[0];
      buf += dollarTag;
      i += dollarTag.length;
      continue;
    }
    if (sql[i] === ';') {
      if (buf.trim()) out.push(buf.trim());
      buf = '';
      i++;
      continue;
    }
    buf += sql[i++];
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

const snippet = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, 160);

/** Lint a migration's SQL for backward-incompatible changes. */
export function lintMigrationSql(sql: string): LintViolation[] {
  const violations: LintViolation[] = [];
  const statements = splitStatements(stripComments(sql));

  for (const stmt of statements) {
    const s = stmt.replace(/\s+/g, ' ');
    const add = (rule: string, message: string) => violations.push({ rule, message, snippet: snippet(stmt) });

    if (/\bDROP\s+TABLE\b/i.test(s)) add('drop_table', 'DROP TABLE removes an object old clients may read.');
    if (/\bDROP\s+COLUMN\b/i.test(s)) add('drop_column', 'DROP COLUMN removes a column old clients may read/write.');
    if (/\bRENAME\s+(COLUMN\b|TO\b)/i.test(s) && /\bALTER\s+TABLE\b/i.test(s))
      add('rename', 'RENAME breaks old clients still querying the old name.');
    if (/\bALTER\s+COLUMN\b[\s\S]*?\b(TYPE|SET\s+DATA\s+TYPE)\b/i.test(s))
      add('type_change', 'In-place column type change breaks old clients; add a new column instead.');
    if (/\bALTER\s+COLUMN\b[\s\S]*?\bSET\s+NOT\s+NULL\b/i.test(s))
      add('set_not_null', 'Adding NOT NULL to an existing column can break in-flight old-client INSERTs.');
    if (/\bADD\s+COLUMN\b/i.test(s) && /\bNOT\s+NULL\b/i.test(s) && !/\bDEFAULT\b/i.test(s))
      add('add_not_null_no_default', 'ADD COLUMN NOT NULL without a DEFAULT rejects old-client INSERTs.');
    if (/\bDROP\s+TYPE\b/i.test(s) || /\bALTER\s+TYPE\b[\s\S]*?\b(RENAME|DROP)\b/i.test(s))
      add('enum_change', 'Removing/renaming an enum value breaks old clients sending the old label.');
    // CHECK constraint added to an EXISTING table (ALTER, not CREATE) — a widening
    // is safe, a tightening is not, so this is a review candidate.
    if (/\bALTER\s+TABLE\b[\s\S]*?\bADD\b[\s\S]*?\bCHECK\b/i.test(s))
      add('check_constraint', 'New/replaced CHECK on an existing table — verify it does not tighten (reject existing rows / old writes).');
  }

  return violations;
}

export function hasViolations(v: LintViolation[]): boolean {
  return v.length > 0;
}
