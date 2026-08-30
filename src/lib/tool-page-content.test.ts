import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { BUDGET_PAGE, QUIZ_PAGE, ToolPageContent } from "./tool-page-content";
import { SIMPLIFIED_MONTHLY_COSTS } from "./budgetCalculator/usdaData";
import { getAllPersonalityTypes } from "./quiz/personalityTypes";
import { QUIZ_QUESTIONS } from "./quiz/questions";

/**
 * The rules in the comment block at the top of tool-page-content.ts, as checks.
 *
 * Two of these are doing more work than they look like. The USDA arithmetic test
 * recomputes the four figures quoted on /budget-calculator from the table the calculator
 * actually uses, so editing usdaData.ts fails the build rather than silently making the
 * page lie. The question-count test does the same for "twelve questions" on the quiz
 * page. Numbers in prose drift away from the code that produced them, and this repo has
 * already shipped four invented ones.
 */

const REPO = path.resolve(__dirname, "..", "..");

const PAGES: ReadonlyArray<readonly [string, ToolPageContent]> = [
  ["quiz", QUIZ_PAGE],
  ["budget", BUDGET_PAGE],
];

/** Every string a reader can actually see, per page. */
function visibleText(page: ToolPageContent): string {
  return [
    page.answer,
    ...page.intro,
    page.howTo.name,
    page.howTo.description,
    ...page.howTo.steps.flatMap((s) => [s.name, s.text]),
    ...page.faqs.flatMap((f) => [f.question, f.answer]),
  ].join("\n");
}

describe.each(PAGES)("%s tool page content", (_name, page) => {
  const text = visibleText(page);

  it("leads with a direct answer, so an assistant has a sentence to quote", () => {
    expect(page.answer.length).toBeGreaterThan(80);
    expect(page.answer.length).toBeLessThan(400);
  });

  it("carries enough FAQ entries to justify its FAQPage markup", () => {
    expect(page.faqs.length).toBeGreaterThanOrEqual(4);
    for (const faq of page.faqs) {
      expect(faq.question.trim().endsWith("?")).toBe(true);
      expect(faq.answer.length).toBeGreaterThan(40);
    }
  });

  it("carries enough HowTo steps to justify its HowTo markup", () => {
    expect(page.howTo.steps.length).toBeGreaterThanOrEqual(3);
    expect(page.howTo.totalTime).toMatch(/^PT\d+[HM]$/);
    for (const step of page.howTo.steps) {
      expect(step.name.length).toBeGreaterThan(0);
      expect(step.text.length).toBeGreaterThan(40);
    }
  });

  it("makes no clinical claim on EatPal's behalf", () => {
    // Rule 2. src/lib/no-false-credentials.test.ts scans the whole tree for the
    // credential patterns; this catches the ones specific to a tool that people will
    // reasonably mistake for a screening instrument.
    //
    // Only declarative sentences are scanned. "Does this quiz diagnose ARFID?" is a
    // question the page asks in order to answer no, and a gate that fails on it would
    // be teaching the next person to phrase the claim as a heading. The denial itself
    // is checked below.
    const declarative = text
      .split("\n")
      .filter((line) => !line.trim().endsWith("?"))
      .join("\n");
    const patterns = [
      /\b(we|this quiz|this calculator|eatpal) (can )?(diagnose|assess|screen for|treat)/i,
      /\bclinically (proven|validated)\b/i,
      /\bmedically (reviewed|approved)\b/i,
      /\bvalidated (screening|assessment) (tool|instrument)\b/i,
    ];
    const hits = patterns.filter((re) => re.test(declarative)).map(String);
    expect(hits).toEqual([]);
  });

  it("answers any diagnosis question with a denial", () => {
    // The other half of the check above: a page may raise the question, but only to
    // say no and point at a clinician.
    for (const faq of page.faqs) {
      if (!/\b(diagnose|diagnosis|screen)\b/i.test(faq.question)) continue;
      expect(faq.answer, `${faq.question} is not answered with a denial`).toMatch(
        /^No[.,]|\bcannot\b|\bnot\b/i,
      );
      expect(faq.answer).toMatch(/clinician|doctor|pediatrician|assessment/i);
    }
  });

  it("states no statistic that is not attributed to something checkable", () => {
    // Rule 1. The USDA figures are exempt: they are quoted from usdaData.ts, which cites
    // fns.usda.gov, and the test below recomputes them. Everything else is banned.
    const withoutUsda = text
      .replace(/\$[\d,]+/g, "")
      .replace(/USDA[^.]*\./g, "");
    const patterns = [
      /\b\d+(\.\d+)?\s*%/,
      /\b\d+\s+(out\s+of|in)\s+\d+\b/i,
      /\b\d+x\s+(more|less|faster|better)\b/i,
      /\bthousands of\b/i,
      /\bmillions of\b/i,
      /\bstudies (show|found|suggest)\b/i,
      /\bresearch (shows|proves|confirms)\b/i,
    ];
    const hits = patterns.filter((re) => re.test(withoutUsda)).map(String);
    expect(hits).toEqual([]);
  });

  it("is prerendered, so crawlers that do not run JavaScript see the prose", () => {
    const routes = JSON.parse(
      readFileSync(path.join(REPO, "scripts", "prerender-routes.json"), "utf8"),
    ) as { static: string[] };
    expect(routes.static).toContain(page.route);
  });
});

describe("quiz page content", () => {
  it("quotes the question count the quiz actually has", () => {
    // "twelve questions" appears in the answer, a how-to step and an FAQ. If a question
    // is added to src/lib/quiz/questions.ts, all three become wrong at once.
    expect(QUIZ_QUESTIONS.length).toBe(12);
  });

  it("names every personality type the quiz can return", () => {
    // The FAQ lists the six by name. A seventh type added without touching this file
    // would make that answer incomplete, which is the kind of small lie nobody notices.
    const listed = QUIZ_PAGE.faqs.find((f) =>
      f.question.includes("six picky eater personality types"),
    );
    expect(listed).toBeDefined();
    for (const type of getAllPersonalityTypes()) {
      expect(listed!.answer, `FAQ does not name ${type.name}`).toContain(type.name);
    }
    expect(getAllPersonalityTypes()).toHaveLength(6);
  });

  it("answers the adult self-assessment queries without claiming to screen for ARFID", () => {
    // "am i a picky eater quiz" and "are you a picky eater quiz" are adults asking about
    // themselves, and the quiz is written about a child. The note may address them; it
    // may not imply the quiz can tell an adult whether they have ARFID.
    const body = QUIZ_PAGE.adultNote.body.join("\n");
    expect(body.toLowerCase()).toContain("arfid");
    expect(body).toMatch(/cannot|not tell|clinician/i);
    expect(body).not.toMatch(/\bthis quiz (can|will) tell you (if|whether) you have\b/i);
  });

  it("does not claim the result is ungated, because the recommendations are not", () => {
    // src/pages/PickyEaterQuizResults.tsx puts the food recommendations behind an email
    // capture. Copy that promised no email at all would be false the moment a reader
    // finished the quiz.
    const howLong = QUIZ_PAGE.faqs.find((f) => f.question.includes("How long"));
    expect(howLong!.answer).toMatch(/email/i);
  });
});

describe("budget page content", () => {
  it("quotes USDA figures that match the table the calculator uses", () => {
    // Two adults and two school-age children, which is what the page says. The
    // calculator buckets an adult at 35 and a child at 8 (see calculateBaseCosts in
    // src/lib/budgetCalculator/calculator.ts), so those are the rows to sum.
    const familyOfFour = (level: "thrifty" | "low_cost" | "moderate" | "liberal") =>
      2 * SIMPLIFIED_MONTHLY_COSTS.adult[level] + 2 * SIMPLIFIED_MONTHLY_COSTS.child_6_11[level];

    const expected = {
      thrifty: familyOfFour("thrifty"),
      low_cost: familyOfFour("low_cost"),
      moderate: familyOfFour("moderate"),
      liberal: familyOfFour("liberal"),
    };

    // Guard the arithmetic itself, so a change to usdaData.ts is visible here.
    expect(expected).toEqual({ thrifty: 818, low_cost: 1072, moderate: 1334, liberal: 1604 });

    const text = visibleText(BUDGET_PAGE);
    for (const value of Object.values(expected)) {
      const formatted = `$${value.toLocaleString("en-US")}`;
      expect(text, `page does not quote ${formatted}`).toContain(formatted);
    }
  });

  it("says out loud that the calculator ignores ages and waste", () => {
    // Rule 3. Both are true of calculateBaseCosts, and both make the number an
    // underestimate for exactly the households this site is for.
    const text = visibleText(BUDGET_PAGE).toLowerCase();
    expect(text).toContain("waste factor");
    expect(text).toMatch(/assumes? (an adult of 35|every adult is 35)/);
  });

  it("cites where the USDA figures come from", () => {
    expect(visibleText(BUDGET_PAGE)).toContain("fns.usda.gov");
  });
});
