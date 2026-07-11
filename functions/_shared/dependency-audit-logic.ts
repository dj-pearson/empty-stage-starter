/**
 * Pure logic for the dependency audit agent (US-507).
 * DB/network-free so version parsing, dependency extraction, severity mapping,
 * and report titling are unit-testable.
 */

export interface Dependency {
  name: string;
  version: string;
}

/** Strip a semver range prefix to a concrete version; '' for non-pinnable specs. */
export function normalizeVersion(range: string): string {
  const r = range.trim();
  // Skip specs OSV can't query by version.
  if (!r || /^(workspace:|file:|link:|git\+|github:|https?:|\*$|latest$)/i.test(r)) return '';
  const m = r.match(/(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/);
  return m ? m[1] : '';
}

/** Merge dependencies + devDependencies into a queryable, pinned list. */
export function parseDependencies(pkg: {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}): Dependency[] {
  const all = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  const out: Dependency[] = [];
  for (const [name, range] of Object.entries(all)) {
    const version = normalizeVersion(range);
    if (version) out.push({ name, version });
  }
  return out;
}

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'unknown';

/** Map an OSV vuln to a severity band (GHSA database_specific.severity or CVSS score). */
export function vulnSeverity(vuln: {
  database_specific?: { severity?: string };
  severity?: Array<{ type?: string; score?: string }>;
}): Severity {
  const ds = vuln.database_specific?.severity?.toUpperCase();
  if (ds === 'CRITICAL') return 'critical';
  if (ds === 'HIGH') return 'high';
  if (ds === 'MODERATE' || ds === 'MEDIUM') return 'medium';
  if (ds === 'LOW') return 'low';

  // Fall back to a CVSS numeric score if present.
  const cvss = vuln.severity?.find((s) => (s.type ?? '').startsWith('CVSS'));
  const score = cvss ? Number(String(cvss.score).match(/(\d+(\.\d+)?)/)?.[1]) : NaN;
  if (Number.isFinite(score)) {
    if (score >= 9) return 'critical';
    if (score >= 7) return 'high';
    if (score >= 4) return 'medium';
    if (score > 0) return 'low';
  }
  return 'unknown';
}

export interface VulnFinding {
  package: string;
  version: string;
  id: string;
  severity: Severity;
  summary: string;
}

/** Any critical-severity finding? */
export function hasCritical(findings: VulnFinding[]): boolean {
  return findings.some((f) => f.severity === 'critical');
}

/** Count findings per severity band. */
export function countBySeverity(findings: VulnFinding[]): Record<Severity, number> {
  const out: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 };
  for (const f of findings) out[f.severity]++;
  return out;
}

/** Weekly report title with a YYYY-MM-DD date. */
export function reportTitle(dateStr: string): string {
  return `Weekly dependency report ${dateStr}`;
}
