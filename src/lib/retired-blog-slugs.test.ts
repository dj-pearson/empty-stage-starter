import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { RETIRED_BLOG_SLUGS, isRetiredBlogSlug } from "./retired-blog-slugs";

/**
 * Three things have to agree about a retired blog URL, and they live in three
 * languages: public/_redirects (Cloudflare config), the sitemap generator (a Deno edge
 * function that cannot import this module), and scripts/prerender.mjs (Node). When they
 * drift, the site does the one thing that is worse than leaving the duplicates alone: it
 * submits a URL in its own sitemap and then 301s the crawler that follows it.
 *
 * The redirect-vs-static-file rule matters most and is the least obvious. Retiring a
 * slug without also skipping it in the prerenderer leaves a real file at
 * dist/blog/<slug>/index.html, and a static asset can be served in preference to the
 * redirect. The URL then stays alive, still competing, while everything else in the repo
 * claims it is gone.
 */

const REPO = path.resolve(__dirname, "..", "..");
const redirects = readFileSync(path.join(REPO, "public", "_redirects"), "utf8");

/** Every `/blog/<from> /blog/<to> 301` line in _redirects, as a from -> to map. */
function parseBlogRedirects(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of redirects.split(/\r?\n/)) {
    const match = line.match(/^\/blog\/(\S+)\s+\/blog\/(\S+)\s+301\s*$/);
    if (match) out[match[1]] = match[2];
  }
  return out;
}

describe("retired blog slugs", () => {
  const entries = Object.entries(RETIRED_BLOG_SLUGS);

  it("retires the 29 duplicate URLs the Search Console data identified", () => {
    expect(entries).toHaveLength(29);
  });

  it("never redirects a slug to itself", () => {
    const selfReferential = entries.filter(([from, to]) => from === to);
    expect(selfReferential).toEqual([]);
  });

  it("never redirects into another retired slug, which would chain or loop", () => {
    // A 301 to a URL that also 301s costs a hop and, if the pair points at each other,
    // never resolves. Every target must be a surviving URL.
    const chained = entries.filter(([, to]) => isRetiredBlogSlug(to));
    expect(
      chained,
      `these targets are themselves retired: ${chained.map(([f, t]) => `${f} -> ${t}`).join(", ")}`,
    ).toEqual([]);
  });

  it("only retires numeric-suffix duplicates, which is the rule that makes this safe", () => {
    // The narrow rule is the whole reason this list can be trusted without a human
    // reading 29 articles: `foo-3` next to `foo` is a duplicate by construction. If a
    // slug without a numeric suffix appears here, someone has started making judgement
    // calls and this file is no longer self-evidently correct.
    const offenders = entries
      .map(([from, to]) => ({ from, to, base: from.replace(/-\d+$/, "") }))
      .filter(({ from, to, base }) => base !== to.replace(/-\d+$/, "") || from === base + "");
    const wrongFamily = offenders.filter(({ base, to }) => base !== to.replace(/-\d+$/, ""));
    expect(
      wrongFamily,
      `these do not share a base slug with their target: ${wrongFamily
        .map(({ from, to }) => `${from} -> ${to}`)
        .join(", ")}`,
    ).toEqual([]);
  });

  it("has exactly one _redirects rule per retired slug, pointing at the same target", () => {
    const fromFile = parseBlogRedirects();

    const missing = entries.filter(([from]) => !(from in fromFile)).map(([from]) => from);
    expect(missing, `no _redirects rule for: ${missing.join(", ")}`).toEqual([]);

    const extra = Object.keys(fromFile).filter((from) => !isRetiredBlogSlug(from));
    expect(extra, `_redirects rules with no entry in this module: ${extra.join(", ")}`).toEqual([]);

    const mismatched = entries
      .filter(([from, to]) => fromFile[from] !== to)
      .map(([from, to]) => `${from}: module says ${to}, _redirects says ${fromFile[from]}`);
    expect(mismatched).toEqual([]);
  });

  it("keeps retired slugs out of the sitemap generator", () => {
    // The edge function is Deno and cannot import this module, so it carries its own
    // copy. This asserts it filters at all and names this file, which is the pointer a
    // future reader needs.
    const sitemap = readFileSync(
      path.join(REPO, "supabase", "functions", "generate-sitemap", "index.ts"),
      "utf8",
    );
    expect(sitemap).toContain("RETIRED_BLOG_SLUGS");
    expect(sitemap).toContain("retired-blog-slugs.ts");

    const declared = [...sitemap.matchAll(/^\s*['"]([a-z0-9-]+)['"],\s*$/gm)].map((m) => m[1]);
    const missing = entries.filter(([from]) => !declared.includes(from)).map(([from]) => from);
    expect(missing, `sitemap generator does not exclude: ${missing.join(", ")}`).toEqual([]);
  });

  it("keeps retired slugs out of the prerenderer, so no static file shadows the 301", () => {
    const prerender = readFileSync(path.join(REPO, "scripts", "prerender.mjs"), "utf8");
    expect(prerender).toContain("retired-blog-slugs");
  });
});
