import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ARFID_PAGES, ARFID_ROUTES, getArfidPage } from "./arfid-content";

/**
 * The rules in the comment block at the top of arfid-content.ts, as checks.
 *
 * This is the highest-stakes copy on the site: writing about an eating disorder for
 * people deciding whether their child needs care. The repo has already had to delete
 * eight claims of in-house clinicians and four invented numbers, and both came back
 * after the first cleanup because nothing failed when they did.
 */

const REPO = path.resolve(__dirname, "..", "..");

/** Every string a reader can actually see on one page. */
function visibleText(page: (typeof ARFID_PAGES)[number]): string {
  return [
    page.h1,
    page.title,
    page.metaDescription,
    page.answer,
    ...page.intro,
    ...page.sections.flatMap((s) => [s.heading, ...s.paragraphs, ...(s.bullets ?? [])]),
    page.careNote,
    ...page.faqs.flatMap((f) => [f.question, f.answer]),
  ].join("\n");
}

describe("arfid content", () => {
  it("covers the four pages the cluster splits into", () => {
    expect(ARFID_PAGES.map((p) => p.slug)).toEqual([
      "what-is-arfid",
      "safe-foods-list",
      "arfid-vs-picky-eating",
      "arfid-in-adults",
    ]);
  });

  it("has no duplicate slugs", () => {
    const slugs = ARFID_PAGES.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  describe.each(ARFID_PAGES)("$slug", (page) => {
    const text = visibleText(page);

    it("says EatPal is not treatment", () => {
      // Rule 1. careNote is required by the type so it cannot be omitted; this checks it
      // actually says the thing rather than being filled in with anything at all.
      expect(page.careNote).toMatch(/does not (assess, )?diagnose|not a substitute/i);
      expect(page.careNote).toMatch(/feeding therapist|doctor|dietitian|clinician/i);
    });

    it("states no statistic, because none of them would be sourced", () => {
      // Rule 2. ARFID prevalence figures vary widely by population and method, and one
      // quoted without its study is worse than none. The DSM-5's publication year is
      // allowed through: it is a date, not a finding.
      const withoutDsmYear = text.replace(/DSM-5[^.]*2013/g, "").replace(/\b2013\b/g, "");
      const patterns = [
        /\b\d+(\.\d+)?\s*%/,
        /\b\d+\s+(out\s+of|in)\s+\d+\b/i,
        /\b\d+x\s+(more|less|faster|better)\b/i,
        /\b(one|two|three|four|five) in (ten|twenty|a hundred)\b/i,
        /\bthousands of\b/i,
        /\bmillions of\b/i,
        /\bstudies (show|found|suggest)\b/i,
        /\bresearch (shows|proves|confirms)\b/i,
        /\bmost (children|people|adults) with arfid\b/i,
      ];
      const hits = patterns.filter((re) => re.test(withoutDsmYear)).map(String);
      expect(
        hits,
        `unsourced claim on /arfid/${page.slug}. Attribute it or cut it; see the rules ` +
          `in arfid-content.ts.`,
      ).toEqual([]);
    });

    it("claims no treatment, cure or diagnosis on EatPal's behalf", () => {
      // Rule 4. Declarative sentences only: a page may ask "Can adults have ARFID?" in
      // order to answer it.
      const declarative = text
        .split("\n")
        .filter((line) => !line.trim().endsWith("?"))
        .join("\n");
      const patterns = [
        /\bcures?\b/i,
        /\bwill fix\b/i,
        /\b(we|eatpal|this (page|tool|app)) (can )?(diagnose|assess|treat)/i,
        /\bclinically proven\b/i,
        /\bevidence[- ]based treatment\b/i,
        /\bour (clinicians|therapists|dietitians)\b/i,
      ];
      const hits = patterns.filter((re) => re.test(declarative)).map(String);
      expect(hits).toEqual([]);
    });

    it("points at a real person to call before it points at the app", () => {
      // Rule 5. Every page has to name who actually helps.
      expect(text).toMatch(
        /pediatrician|feeding therapist|dietitian|clinician|GP|primary care|eating disorder service/i,
      );
    });

    it("attributes any feeding-therapy method to its published source", () => {
      // Rule 3, matching how the rest of the site does it. If food chaining is described
      // at all, Fraker and Walbert are named in the same breath.
      if (!/food chaining/i.test(text)) return;
      expect(text).toContain("Cheri Fraker, RD and Laura Walbert, SLP");
    });

    it("leads with a direct answer, so an assistant has a sentence to quote", () => {
      expect(page.answer.length).toBeGreaterThan(80);
      expect(page.answer.length).toBeLessThan(450);
    });

    it("carries enough body to be worth indexing", () => {
      expect(page.sections.length).toBeGreaterThanOrEqual(3);
      const words = text.split(/\s+/).filter(Boolean).length;
      expect(words, `/arfid/${page.slug} is thin at ${words} words`).toBeGreaterThan(600);
    });

    it("carries enough FAQ entries to justify its FAQPage markup", () => {
      expect(page.faqs.length).toBeGreaterThanOrEqual(4);
      for (const faq of page.faqs) {
        expect(faq.question.trim().endsWith("?")).toBe(true);
        expect(faq.answer.length).toBeGreaterThan(40);
      }
    });

    it("keeps the meta description within what Google will render", () => {
      expect(page.metaDescription.length).toBeGreaterThan(70);
      expect(page.metaDescription.length).toBeLessThanOrEqual(250);
    });

    it("links only to sibling pages that exist", () => {
      for (const relatedSlug of page.related) {
        expect(getArfidPage(relatedSlug), `${page.slug} links to missing ${relatedSlug}`)
          .toBeDefined();
      }
      expect(page.related).not.toContain(page.slug);
    });
  });

  it("is listed in the sitemap generator", () => {
    const sitemap = readFileSync(
      path.join(REPO, "supabase", "functions", "generate-sitemap", "index.ts"),
      "utf8",
    );
    for (const route of ARFID_ROUTES) {
      expect(sitemap, `sitemap is missing ${route}`).toContain(`path: '${route}'`);
    }
  });

  it("is prerendered, so crawlers that do not run JavaScript see the content", () => {
    // GPTBot, PerplexityBot, ClaudeBot and every social scraper read raw HTML only.
    const routes = JSON.parse(
      readFileSync(path.join(REPO, "scripts", "prerender-routes.json"), "utf8"),
    ) as { static: string[] };
    for (const route of ARFID_ROUTES) {
      expect(routes.static, `prerender-routes.json is missing ${route}`).toContain(route);
    }
  });

  it("has a route registered in App.tsx", () => {
    const app = readFileSync(path.join(REPO, "src", "App.tsx"), "utf8");
    expect(app).toContain('path="/arfid/:slug"');
    expect(app).toContain("ArfidPage");
  });
});
