/**
 * Pure SEO audit logic (US-505).
 *
 * Regex-based extraction/auditing (no DOM in the edge runtime) so parsing, the
 * per-page checks, duplicate detection, and dedup-vs-prior are unit-testable.
 */

export interface PageMeta {
  url: string;
  title: string | null;
  description: string | null;
  canonical: string | null;
  hasJsonLd: boolean;
  internalLinks: string[];
}

export interface Finding {
  url: string;
  issue: string;
}

/** Extract <loc> URLs from a sitemap XML. */
export function parseSitemapUrls(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1].trim());
}

function firstMatch(re: RegExp, s: string): string | null {
  const m = s.match(re);
  return m ? m[1].trim() : null;
}

/** Extract the SEO-relevant metadata from a page's HTML. */
export function extractMeta(url: string, html: string): PageMeta {
  const title = firstMatch(/<title[^>]*>([\s\S]*?)<\/title>/i, html);
  const description =
    firstMatch(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i, html) ??
    firstMatch(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i, html);
  const canonical = firstMatch(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i, html);
  const hasJsonLd = /<script[^>]+type=["']application\/ld\+json["']/i.test(html);
  // Anchor hrefs only (not <link>/<meta>), so canonical/preload URLs aren't
  // mistaken for internal navigation links.
  const internalLinks = [...html.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["']/gi)]
    .map((m) => m[1])
    .filter((h) => h.startsWith('/') || h.startsWith(originOf(url)));
  return { url, title, description, canonical, hasJsonLd, internalLinks };
}

function originOf(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return '';
  }
}

/** Same production host? (belt-and-suspenders with the SSRF validator). */
export function isSameHost(url: string, productionOrigin: string): boolean {
  try {
    return new URL(url).host === new URL(productionOrigin).host;
  } catch {
    return false;
  }
}

/** Per-page checks: missing title/description/canonical, and missing JSON-LD on blog/recipe. */
export function auditPage(meta: PageMeta): Finding[] {
  const out: Finding[] = [];
  if (!meta.title) out.push({ url: meta.url, issue: 'missing title' });
  if (!meta.description) out.push({ url: meta.url, issue: 'missing meta description' });
  if (!meta.canonical) out.push({ url: meta.url, issue: 'missing canonical' });
  const path = safePath(meta.url);
  if ((path.includes('/blog') || path.includes('/recipe')) && !meta.hasJsonLd) {
    out.push({ url: meta.url, issue: 'missing JSON-LD' });
  }
  return out;
}

function safePath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

/** Duplicate title / meta description across pages. */
export function detectDuplicates(pages: PageMeta[]): Finding[] {
  const out: Finding[] = [];
  for (const field of ['title', 'description'] as const) {
    const byValue = new Map<string, string[]>();
    for (const p of pages) {
      const v = p[field];
      if (!v) continue;
      const arr = byValue.get(v) ?? byValue.set(v, []).get(v)!;
      arr.push(p.url);
    }
    for (const [value, urls] of byValue) {
      if (urls.length > 1) {
        for (const url of urls) {
          out.push({ url, issue: `duplicate ${field === 'title' ? 'title' : 'meta description'}: "${value.slice(0, 60)}"` });
        }
      }
    }
  }
  return out;
}

/** Stable fingerprint for a finding (for dedup across weeks). */
export function fingerprint(f: Finding): string {
  return `${safePath(f.url)}|${f.issue}`;
}

/** Keep only findings not already present in prior (unresolved) fingerprints. */
export function dedupeAgainstPrior(findings: Finding[], priorFingerprints: Set<string>): Finding[] {
  const seen = new Set(priorFingerprints);
  const out: Finding[] = [];
  for (const f of findings) {
    const fp = fingerprint(f);
    if (seen.has(fp)) continue;
    seen.add(fp);
    out.push(f);
  }
  return out;
}
