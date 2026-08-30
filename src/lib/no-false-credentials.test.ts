import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * EatPal does not employ licensed clinicians, and its content is about feeding
 * children with ARFID and pediatric feeding disorders. Copy that implies clinical
 * licensure is a false claim aimed at parents making medical decisions for a kid, and
 * it is also the pattern search engines penalise as deceptive E-E-A-T.
 *
 * This has now been fixed twice. The first pass deleted three invented clinicians
 * ("Dr. Sarah Johnson", an OT and an SLP) that rendered whenever blog_authors was
 * empty. The second pass found that no fake person remained but eight pieces of
 * hardcoded copy still asserted a team of registered dietitians and licensed feeding
 * specialists across /authors, the sitewide footer link, and the byline under every
 * blog post. Both times the claim came back because nothing failed when it did.
 *
 * So this test fails the build instead. It is a text scan, not a type check, because
 * the failure mode is prose.
 *
 * If EatPal ever does engage a credentialed reviewer, this test does not need
 * weakening: put the real person in public.blog_authors and let the page render them
 * from data. The rule being enforced is that credentials may not be asserted in
 * hardcoded copy, where nobody is accountable for whether they are true.
 */

const SRC = join(__dirname, "..");

/**
 * Each pattern is a claim EatPal cannot support. Keep them narrow enough that honest
 * copy still passes: "share your data with your occupational therapist" is fine and
 * must stay fine, "our occupational therapists" is not.
 */
const BANNED: ReadonlyArray<{ pattern: RegExp; why: string }> = [
  {
    pattern: /\b(our|the) (team of )?licensed (feeding )?(therapy )?(professional|clinician|specialist|therapist)/i,
    why: "asserts EatPal employs licensed clinicians",
  },
  {
    pattern: /\ball (of our )?authors are licensed/i,
    why: "asserts every author holds a licence",
  },
  {
    pattern: /\b(our|the) (team of )?(registered dietitian|occupational therapist|speech-language patholog)/i,
    why: "asserts in-house credentialed staff",
  },
  {
    pattern: /reviewed by (our |a |an )?(registered dietitian|licensed|feeding specialist|clinician)/i,
    why: "asserts clinical review that does not happen",
  },
  {
    pattern: /\bexpert[- ]reviewed\b/i,
    why: "implies credentialed review of every article",
  },
  {
    pattern: /\bclinically proven\b/i,
    why: "asserts clinical trial evidence EatPal does not have",
  },
  {
    // The softer form of the same claim, which "clinically proven" walked straight
    // past: /pricing's AI card and the /auth sidebar both called food chaining "the
    // proven feeding therapy method". It is a published method with named authors,
    // which is a different and checkable claim, and "published" is how the rest of the
    // site already words it.
    pattern: /\bproven\s+(feeding therapy|food[- ]chaining)\b/i,
    why: "asserts food chaining is proven rather than published",
  },
  {
    pattern: /\bdecades of (combined )?clinical experience\b/i,
    why: "asserts clinical experience EatPal does not have",
  },
  {
    pattern: /\bfeeding therapy specialists\b/i,
    why: "used as a description of EatPal's own staff",
  },
  {
    // public/rss.xml and public/feed.xml both said "Evidence-based guidance from
    // feeding specialists", which the pattern above misses because it lacks the word
    // "therapy". Anchored on the attribution rather than on the job title, so
    // "share this with your feeding specialist" and "widely used by pediatric feeding
    // specialists" stay legal; only sourcing EatPal's own output to them is banned.
    pattern:
      /\b(guidance|advice|tips|techniques|strategies|content|articles)\s+(from|by|developed by|written by)\s+(our\s+)?(pediatric\s+)?feeding\s+specialists\b/i,
    why: "attributes EatPal's own content to feeding specialists",
  },
  // ---- unsourced numbers ----
  //
  // These were added after two survivors of an earlier cleanup turned up. The comment
  // block in src/lib/seo-config.ts records "70%+ prediction accuracy", "200+ feeding
  // therapists", "2,000+ families helped" and "100K+ mealtime data points" as removed
  // for being unsourced. The prediction-accuracy claim was still rendering on the
  // pricing page, and a lead-magnet email still said the guide had "helped thousands of
  // parents". Prose deleted in one file has a habit of surviving in three others, which
  // is the whole reason this test scans rather than trusts.
  // Anchored on a marketing verb rather than on any number near the word "parents".
  // The bare version flagged "Professional plan - start with 3 families", which is a
  // plan limit, and "Foods with 50%+ success rate", which is a label on a value
  // computed from the user's own tracking data. Neither is a claim about EatPal, and a
  // gate that cries wolf gets switched off.
  {
    pattern:
      /\b(join|trusted by|used by|helped|helping|loved by|serving|over|more than)\s+(<[^>]+>\s*)?\d[\d,]*\+?\s*(families|parents|therapists|clinicians|users|customers)\b/i,
    why: "counts users or families without a source",
  },
  {
    pattern: /\b\d+(\.\d+)?\s*%\+?\s*(prediction accuracy|accurate|effective)\b/i,
    why: "states an accuracy rate with nothing behind it",
  },
  {
    pattern: /\bthousands of (parents|families|kids|children|users)\b/i,
    why: "an unsourced scale claim",
  },
  {
    pattern: /\b(scientifically|clinically) (proven|validated)\b/i,
    why: "asserts evidence EatPal does not have",
  },
];

/** Source files whose prose ships to users. Tests and generated types are skipped. */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "ui") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
      continue;
    }
    if (!/\.(tsx?|json)$/.test(entry)) continue;
    if (/\.test\.tsx?$/.test(entry)) continue;
    if (entry === "types.ts" && full.includes("integrations")) continue;
    out.push(full);
  }
  return out;
}

/**
 * Shipped copy that lives outside src/, which the walk above cannot see.
 *
 * It scans src/ for .ts/.tsx/.json, and that missed four claims sitting in
 * public/rss.xml and public/feed.xml: "Evidence-based guidance from feeding
 * specialists" in both channel descriptions, and "techniques developed by feeding
 * therapy specialists" in both item summaries, alongside an unsourced "from 5 foods to
 * 50+". SEOHead renders a <link rel="alternate" type="application/rss+xml"> pointing at
 * /rss.xml on every page, so that feed is advertised sitewide and read by aggregators.
 * It was as public as the pages the first two cleanups fixed, and no test could see it.
 *
 * public/ is served verbatim by Cloudflare Pages and index.html is the document every
 * visitor gets, so both are shipped copy by any definition. documents/ is deliberately
 * NOT included: those are internal specs, and lines like "Dietitians, therapists,
 * feeding specialists (white-label)" describe who EatPal sells to rather than who it
 * employs. Scanning them would make this gate cry wolf, and a gate that cries wolf gets
 * switched off.
 */
function shippedFilesOutsideSrc(): string[] {
  const repo = join(SRC, "..");
  const out: string[] = [];

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (/\.(txt|xml|html|json)$/.test(entry)) out.push(full);
    }
  };

  walk(join(repo, "public"));
  out.push(join(repo, "index.html"));
  return out;
}

/** XML and HTML comments, which withoutComments does not know about. */
function withoutMarkupComments(source: string): string {
  return source.replace(/<!--[\s\S]*?-->/g, " ");
}

/**
 * Comments are stripped before matching. The comment blocks in Authors.tsx,
 * ArticleSchema.tsx and BlogPost.tsx quote the removed wording verbatim so the next
 * person understands why it is banned, and that explanation must not trip the test it
 * is explaining.
 */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
}

describe("no false credential claims in shipped copy", () => {
  const files = sourceFiles(SRC);

  it("scans a meaningful number of source files", () => {
    // Guards against a broken walk silently passing this whole suite.
    expect(files.length).toBeGreaterThan(100);
  });

  it.each(BANNED)("never claims: $why", ({ pattern, why }) => {
    const hits: string[] = [];

    for (const file of files) {
      const body = withoutComments(readFileSync(file, "utf8"));
      for (const [index, line] of body.split("\n").entries()) {
        if (pattern.test(line)) {
          hits.push(`${relative(SRC, file)}:${index + 1}  ${line.trim().slice(0, 120)}`);
        }
      }
    }

    expect(
      hits,
      `Copy ${why}. EatPal has no licensed clinicians on staff; see the comment at the ` +
        `top of src/pages/Authors.tsx. Put a real credentialed reviewer in ` +
        `public.blog_authors and render them from data instead.\n\n${hits.join("\n")}`,
    ).toEqual([]);
  });
});

describe("no false credential claims in shipped files outside src/", () => {
  const files = shippedFilesOutsideSrc();

  it("scans the feeds and the AI-facing files", () => {
    // Named explicitly rather than counted: these four are the ones that carried the
    // claims or are most likely to next, and a walk that silently stopped finding them
    // would make this whole block pass while checking nothing.
    const names = files.map((f) => relative(join(SRC, ".."), f).replace(/\\/g, "/"));
    for (const expected of [
      "public/rss.xml",
      "public/feed.xml",
      "public/llms.txt",
      "public/llms-full.txt",
      "index.html",
    ]) {
      expect(names, `${expected} is not being scanned`).toContain(expected);
    }
  });

  it.each(BANNED)("never claims: $why", ({ pattern, why }) => {
    const hits: string[] = [];

    for (const file of files) {
      const body = withoutMarkupComments(withoutComments(readFileSync(file, "utf8")));
      for (const [index, line] of body.split("\n").entries()) {
        if (pattern.test(line)) {
          hits.push(
            `${relative(join(SRC, ".."), file)}:${index + 1}  ${line.trim().slice(0, 120)}`,
          );
        }
      }
    }

    expect(
      hits,
      `Shipped copy ${why}, outside src/ where the scan above cannot reach. ` +
        `public/ is served verbatim and /rss.xml is advertised on every page.\n\n` +
        `${hits.join("\n")}`,
    ).toEqual([]);
  });
});
