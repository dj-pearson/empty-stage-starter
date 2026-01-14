/**
 * Accessibility Scanner
 *
 * Integrates axe-core into the discovery process to catch
 * WCAG 2.1 AA violations on every page.
 */

import { Page } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

export interface A11yViolation {
  id: string;
  impact: 'critical' | 'serious' | 'moderate' | 'minor';
  description: string;
  help: string;
  helpUrl: string;
  nodes: { html: string; target: string[] }[];
}

export interface A11yResult {
  page: string;
  violations: A11yViolation[];
  passes: number;
  timestamp: number;
}

/**
 * Scan a page for accessibility violations
 */
export async function scanAccessibility(page: Page): Promise<A11yResult> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();

  return {
    page: page.url(),
    violations: results.violations.map(v => ({
      id: v.id,
      impact: v.impact as A11yViolation['impact'],
      description: v.description,
      help: v.help,
      helpUrl: v.helpUrl,
      nodes: v.nodes.map(n => ({
        html: n.html,
        target: n.target as string[],
      })),
    })),
    passes: results.passes.length,
    timestamp: Date.now(),
  };
}

/**
 * Get severity score for prioritization
 */
export function getA11ySeverityScore(violations: A11yViolation[]): number {
  const weights = { critical: 10, serious: 5, moderate: 2, minor: 1 };
  return violations.reduce((sum, v) => sum + weights[v.impact], 0);
}

/**
 * Format violations for report
 */
export function formatA11yReport(results: A11yResult[]): string {
  const totalViolations = results.reduce((sum, r) => sum + r.violations.length, 0);
  const criticalCount = results.reduce(
    (sum, r) => sum + r.violations.filter(v => v.impact === 'critical').length,
    0
  );

  let report = `\n=== Accessibility Report ===\n`;
  report += `Pages scanned: ${results.length}\n`;
  report += `Total violations: ${totalViolations}\n`;
  report += `Critical issues: ${criticalCount}\n\n`;

  for (const result of results) {
    if (result.violations.length === 0) continue;

    report += `\n📄 ${result.page}\n`;
    for (const violation of result.violations) {
      const icon = violation.impact === 'critical' ? '🔴' :
                   violation.impact === 'serious' ? '🟠' :
                   violation.impact === 'moderate' ? '🟡' : '🔵';
      report += `  ${icon} [${violation.impact}] ${violation.help}\n`;
      report += `     ${violation.helpUrl}\n`;
    }
  }

  return report;
}

export default { scanAccessibility, getA11ySeverityScore, formatA11yReport };
