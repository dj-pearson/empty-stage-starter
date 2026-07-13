import { describe, it, expect } from "vitest";
import {
  calculateCategoryScore,
  computeSEOScore,
  getScoreColor,
  type AuditResult,
} from "./seoScore";

const r = (category: string, status: AuditResult["status"]): AuditResult =>
  ({ category, item: "x", status, message: "", impact: "low" });

describe("seoScore (US-553 AC1)", () => {
  it("calculateCategoryScore weights passed=1, warning=0.5, failed=0", () => {
    expect(calculateCategoryScore([])).toBe(100); // empty => full
    expect(calculateCategoryScore([r("c", "passed"), r("c", "passed")])).toBe(100);
    expect(calculateCategoryScore([r("c", "passed"), r("c", "failed")])).toBe(50);
    expect(calculateCategoryScore([r("c", "warning"), r("c", "warning")])).toBe(50);
    expect(calculateCategoryScore([r("c", "passed"), r("c", "warning"), r("c", "failed")])).toBe(50);
  });

  it("computeSEOScore folds Security into technical and weights overall", () => {
    const results: AuditResult[] = [
      r("Technical SEO", "passed"),
      r("Security", "failed"), // technical bucket => technical = 50
      r("On-Page SEO", "passed"), // 100
      r("Performance", "warning"), // 50
      r("Mobile & Accessibility", "passed"), // 100
    ];
    const s = computeSEOScore(results);
    expect(s.technical).toBe(50);
    expect(s.onPage).toBe(100);
    expect(s.performance).toBe(50);
    expect(s.mobile).toBe(100);
    expect(s.accessibility).toBe(100); // mirrors mobile
    // overall = 50*.3 + 100*.25 + 50*.25 + 100*.2 = 15 + 25 + 12.5 + 20 = 72.5 -> 73
    expect(s.overall).toBe(73);
  });

  it("computeSEOScore returns 100s for empty categories", () => {
    expect(computeSEOScore([])).toEqual({
      overall: 100,
      technical: 100,
      onPage: 100,
      performance: 100,
      mobile: 100,
      accessibility: 100,
    });
  });

  it("getScoreColor maps score bands to tailwind classes", () => {
    expect(getScoreColor(95)).toBe("text-green-600");
    expect(getScoreColor(90)).toBe("text-green-600");
    expect(getScoreColor(80)).toBe("text-yellow-600");
    expect(getScoreColor(70)).toBe("text-yellow-600");
    expect(getScoreColor(50)).toBe("text-red-600");
  });
});
