/**
 * Pure SEO audit scoring for the admin SEOManager (US-553 AC1) — extracted out
 * of the 5.6k-line component so the scoring math is unit-tested and reusable,
 * mirroring the computeInsights (US-540) / pantryData / groceryData pattern.
 */

export interface AuditResult {
  category: string;
  item: string;
  status: "passed" | "warning" | "failed" | "info";
  message: string;
  impact: "high" | "medium" | "low";
  fix?: string;
}

export interface SEOScore {
  overall: number;
  technical: number;
  onPage: number;
  performance: number;
  mobile: number;
  accessibility: number;
}

/** Score a single category: passed = 1.0, warning = 0.5, failed = 0; empty = 100. */
export function calculateCategoryScore(categoryResults: AuditResult[]): number {
  if (categoryResults.length === 0) return 100;
  const passed = categoryResults.filter((r) => r.status === "passed").length;
  const warnings = categoryResults.filter((r) => r.status === "warning").length;
  const score = ((passed + warnings * 0.5) / categoryResults.length) * 100;
  return Math.round(score);
}

/**
 * Compute per-category and overall SEO scores from audit results. Pure — the
 * component wraps this with setSeoScore for state. Weighting: technical 30%,
 * on-page 25%, performance 25%, mobile 20%.
 */
export function computeSEOScore(results: AuditResult[]): SEOScore {
  const categories = {
    technical: results.filter(
      (r) => r.category === "Technical SEO" || r.category === "Security"
    ),
    onPage: results.filter((r) => r.category === "On-Page SEO"),
    performance: results.filter((r) => r.category === "Performance"),
    mobile: results.filter((r) => r.category === "Mobile & Accessibility"),
    content: results.filter((r) => r.category === "Content Quality"),
  };

  const scores = {
    technical: calculateCategoryScore(categories.technical),
    onPage: calculateCategoryScore(categories.onPage),
    performance: calculateCategoryScore(categories.performance),
    mobile: calculateCategoryScore(categories.mobile),
    accessibility: calculateCategoryScore(categories.mobile), // Using mobile results
  };

  const overall = Math.round(
    scores.technical * 0.3 +
      scores.onPage * 0.25 +
      scores.performance * 0.25 +
      scores.mobile * 0.2
  );

  return { overall, ...scores };
}

/** Tailwind text color for a 0-100 score: green ≥90, yellow ≥70, else red. */
export function getScoreColor(score: number): string {
  if (score >= 90) return "text-green-600";
  if (score >= 70) return "text-yellow-600";
  return "text-red-600";
}
