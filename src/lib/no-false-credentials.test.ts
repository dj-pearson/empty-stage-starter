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
    pattern: /\bdecades of (combined )?clinical experience\b/i,
    why: "asserts clinical experience EatPal does not have",
  },
  {
    pattern: /\bfeeding therapy specialists\b/i,
    why: "used as a description of EatPal's own staff",
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
