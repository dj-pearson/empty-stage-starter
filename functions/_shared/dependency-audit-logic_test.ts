/**
 * Unit tests for dependency audit logic (US-507).
 * Run with: `deno test functions/_shared/dependency-audit-logic_test.ts`
 */

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  normalizeVersion,
  parseDependencies,
  vulnSeverity,
  hasCritical,
  countBySeverity,
  reportTitle,
  type VulnFinding,
} from './dependency-audit-logic.ts';

Deno.test('normalizeVersion: strips range prefixes, skips non-pinnable', () => {
  assertEquals(normalizeVersion('^1.2.3'), '1.2.3');
  assertEquals(normalizeVersion('~2.0.0'), '2.0.0');
  assertEquals(normalizeVersion('>=3.1.0'), '3.1.0');
  assertEquals(normalizeVersion('4.5.6'), '4.5.6');
  assertEquals(normalizeVersion('1.2.3-beta.1'), '1.2.3-beta.1');
  assertEquals(normalizeVersion('workspace:*'), '');
  assertEquals(normalizeVersion('*'), '');
  assertEquals(normalizeVersion('file:../x'), '');
});

Deno.test('parseDependencies: merges deps + devDeps, drops non-pinnable', () => {
  const deps = parseDependencies({
    dependencies: { react: '^19.0.0', local: 'workspace:*' },
    devDependencies: { vitest: '~3.0.1' },
  });
  assertEquals(deps, [
    { name: 'react', version: '19.0.0' },
    { name: 'vitest', version: '3.0.1' },
  ]);
});

Deno.test('vulnSeverity: GHSA severity + CVSS fallback', () => {
  assertEquals(vulnSeverity({ database_specific: { severity: 'CRITICAL' } }), 'critical');
  assertEquals(vulnSeverity({ database_specific: { severity: 'MODERATE' } }), 'medium');
  assertEquals(vulnSeverity({ severity: [{ type: 'CVSS_V3', score: '9.8' }] }), 'critical');
  assertEquals(vulnSeverity({ severity: [{ type: 'CVSS_V3', score: '5.0' }] }), 'medium');
  assertEquals(vulnSeverity({}), 'unknown');
});

Deno.test('hasCritical + countBySeverity', () => {
  const findings: VulnFinding[] = [
    { package: 'a', version: '1', id: 'X', severity: 'critical', summary: '' },
    { package: 'b', version: '1', id: 'Y', severity: 'low', summary: '' },
  ];
  assertEquals(hasCritical(findings), true);
  assertEquals(countBySeverity(findings), { critical: 1, high: 0, medium: 0, low: 1, unknown: 0 });
  assertEquals(hasCritical([findings[1]]), false);
});

Deno.test('reportTitle', () => {
  assertEquals(reportTitle('2026-07-11'), 'Weekly dependency report 2026-07-11');
});
