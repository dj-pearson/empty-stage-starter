import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { MEAL_IDEAS_PAGES, MEAL_IDEAS_ROUTES, getMealIdeasPage } from "./meal-ideas-content";

/**
 * The rules in the comment block at the top of meal-ideas-content.ts, as checks.
 *
 * This repo has already had to strip invented author credentials, an invented
 * aggregateRating, an invented "over 10,000 families" and a "Join thousands of parents"
 * CTA. A meal-ideas listicle is the single easiest place to reintroduce that kind of
 * claim, because "9 out of 10 parents find" reads like normal copy for the genre. So
 * the ban is mechanical rather than a note someone is expected to remember.
 */

const REPO = path.resolve(__dirname, "..", "..");

/** Every string a reader can actually see on one page. */
function visibleText(page: (typeof MEAL_IDEAS_PAGES)[number]): string {
  return [
    page.h1,
    page.title,
    page.metaDescription,
    page.answer,
    ...page.intro,
    ...page.groups.flatMap((g) => [g.anchor, g.why, g.nextStep, ...g.ideas]),
    ...page.insteadOf.flatMap((i) => [i.dont, i.instead]),
    ...page.faqs.flatMap((f) => [f.question, f.answer]),
  ].join("\n");
}

describe("meal ideas content", () => {
  it("covers the five meal occasions the keyword cluster splits into", () => {
    expect(MEAL_IDEAS_PAGES.map((p) => p.slug)).toEqual([
      "dinner-ideas",
      "lunch-ideas",
      "breakfast-ideas",
      "healthy-snacks",
      "healthy-meals",
    ]);
  });

  it("has no duplicate slugs", () => {
    const slugs = MEAL_IDEAS_PAGES.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  describe.each(MEAL_IDEAS_PAGES)("$slug", (page) => {
    const text = visibleText(page);

    it("states no statistic, because none of them would be sourced", () => {
      // Catches "9 out of 10", "80% of children", "3x more likely", "thousands of parents".
      const patterns = [
        /\b\d+(\.\d+)?\s*%/,
        /\b\d+\s+(out\s+of|in)\s+\d+\b/i,
        /\b\d+x\s+(more|less|faster|better)\b/i,
        /\bthousands of\b/i,
        /\bmillions of\b/i,
        /\bstudies (show|found|suggest)\b/i,
        /\bresearch (shows|proves|confirms)\b/i,
        /\bclinically proven\b/i,
      ];
      const hits = patterns.filter((re) => re.test(text)).map(String);
      expect(
        hits,
        `unsourced claim on /picky-eater/${page.slug}. Attribute it to something ` +
          `checkable or cut it; see the rules in meal-ideas-content.ts.`,
      ).toEqual([]);
    });

    it("claims no treatment, because a planning tool is not therapy", () => {
      const patterns = [/\bcures?\b/i, /\btreats? (arfid|your child)/i, /\bwill fix\b/i];
      const hits = patterns.filter((re) => re.test(text)).map(String);
      expect(hits).toEqual([]);
    });

    it("is organised around foods the child already accepts", () => {
      // Rule 4. Without this the page is one more listicle with no reason to outrank
      // the ones that already have a decade of links.
      expect(page.groups.length).toBeGreaterThanOrEqual(3);
      for (const group of page.groups) {
        expect(group.anchor.length).toBeGreaterThan(0);
        expect(group.ideas.length).toBeGreaterThanOrEqual(3);
        expect(group.nextStep.length).toBeGreaterThan(30);
      }
    });

    it("leads with a direct answer, so an assistant has a sentence to quote", () => {
      expect(page.answer.length).toBeGreaterThan(80);
      expect(page.answer.length).toBeLessThan(400);
    });

    it("carries enough FAQ entries to justify its FAQPage markup", () => {
      expect(page.faqs.length).toBeGreaterThanOrEqual(2);
      for (const faq of page.faqs) {
        expect(faq.question.trim().endsWith("?")).toBe(true);
        expect(faq.answer.length).toBeGreaterThan(40);
      }
    });

    it("names the UK and Australian phrasing somewhere on the page", () => {
      // "fussy eaters" is a separate 5,000/month keyword family, and those markets
      // convert better than the US. A page that never says the word cannot rank for it.
      expect(text.toLowerCase()).toContain("fussy");
    });

    it("links only to sibling pages that exist", () => {
      for (const relatedSlug of page.related) {
        expect(getMealIdeasPage(relatedSlug), `${page.slug} links to missing ${relatedSlug}`)
          .toBeDefined();
      }
      expect(page.related).not.toContain(page.slug);
    });

    it("keeps the meta description within what Google will render", () => {
      expect(page.metaDescription.length).toBeGreaterThan(70);
      expect(page.metaDescription.length).toBeLessThanOrEqual(175);
    });
  });

  it("is listed in the sitemap generator", () => {
    const sitemap = readFileSync(
      path.join(REPO, "supabase", "functions", "generate-sitemap", "index.ts"),
      "utf8",
    );
    for (const route of MEAL_IDEAS_ROUTES) {
      expect(sitemap, `sitemap is missing ${route}`).toContain(`path: '${route}'`);
    }
  });

  it("is prerendered, so crawlers that do not run JavaScript see the content", () => {
    // GPTBot, PerplexityBot, ClaudeBot and every social scraper read raw HTML only.
    // A route missing here ships as an empty shell to exactly the crawlers this
    // cluster is trying to reach.
    const routes = JSON.parse(
      readFileSync(path.join(REPO, "scripts", "prerender-routes.json"), "utf8"),
    ) as { static: string[] };
    for (const route of MEAL_IDEAS_ROUTES) {
      expect(routes.static, `prerender-routes.json is missing ${route}`).toContain(route);
    }
  });

  it("has a route registered in App.tsx", () => {
    const app = readFileSync(path.join(REPO, "src", "App.tsx"), "utf8");
    expect(app).toContain('path="/picky-eater/:slug"');
    expect(app).toContain("MealIdeasPage");
  });
});
