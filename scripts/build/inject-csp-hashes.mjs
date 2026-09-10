#!/usr/bin/env node
/**
 * US-845: give the CSP the hashes of the inline scripts the build emits.
 *
 * public/_headers claimed, in a comment: "Vite's inline modulepreload-polyfill
 * is disabled (build.modulePreload.polyfill=false), so the built index.html
 * carries zero inline <script>." That was false. next-themes injects a
 * 557-byte blocking script into every page -- the one that reads the stored
 * theme and sets `class="dark"` on <html> BEFORE first paint -- and it carries
 * `nonce=""`, an empty nonce, because none is configured.
 *
 * script-src lists no nonce and no 'unsafe-inline', so Chrome refused to
 * execute it on every route. Measured against the production CSP with the real
 * build in Chromium:
 *
 *     Refused to execute inline script because it violates the following
 *     Content Security Policy directive: "script-src 'self' ..."
 *
 * on / , /pricing, /faq, /blog, /auth and /guides -- every page tested.
 *
 * The user-visible cost is the exact flash that script exists to prevent: a
 * visitor whose theme is dark gets a white page until React hydrates and
 * applies the class, which on a cold load is after ~260 kB of JS is parsed.
 *
 * WHY A HASH AND NOT A NONCE. A nonce has to be unique per response, and
 * Cloudflare Pages serves _headers statically -- there is nothing to generate
 * one. A hash is fixed for a given script body, which is exactly what a static
 * header can carry. The body changes when next-themes' version or its props
 * change, so it is computed from the built output on every build rather than
 * pinned by hand.
 *
 * ld+json IS DELIBERATELY EXCLUDED. `type="application/ld+json"` is data, not
 * an executable script; the CSP does not gate it and hashing it would add five
 * long tokens per page that protect nothing.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const DIST = path.join(process.cwd(), 'dist');
const HEADERS = path.join(DIST, '_headers');

/**
 * Inline <script> bodies that the CSP actually gates.
 *
 * HTML comments are removed first. index.html carries a comment explaining the
 * CSP that quotes `<script src="/ga-loader.js" defer>` inside it, and the first
 * version of this scanner matched from that opening tag and hashed the prose --
 * producing a "hash" that would change whenever somebody edited the comment.
 */
export function executableInlineScripts(html) {
  const found = [];
  const source = html.replace(/<!--[\s\S]*?-->/g, '');
  for (const m of source.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
    const attrs = m[1];
    if (/\bsrc=/.test(attrs)) continue; // external, covered by 'self'
    if (/type\s*=\s*["']application\/(ld\+json|json)["']/.test(attrs)) continue; // data
    const body = m[2];
    if (body.trim().length === 0) continue;
    found.push(body);
  }
  return found;
}

/** The CSP source expression for one inline script body. */
export function sha256Source(body) {
  return `'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`;
}

/** Put `sources` into the script-src directive of a _headers file. */
export function withScriptSrcHashes(headers, sources) {
  if (sources.length === 0) return headers;
  return headers.replace(/(\n\s*Content-Security-Policy:[^\n]*)/g, (line) =>
    line.replace(/(script-src [^;]*)/, (directive) => {
      const missing = sources.filter((s) => !directive.includes(s));
      return missing.length > 0 ? `${directive} ${missing.join(' ')}` : directive;
    }),
  );
}

function htmlFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) htmlFiles(full, out);
    else if (entry.endsWith('.html')) out.push(full);
  }
  return out;
}

function main() {
  if (!existsSync(HEADERS)) {
    console.error('[csp-hashes] dist/_headers is missing; run after the Vite build.');
    process.exit(1);
  }

  const sources = new Set();
  let scriptCount = 0;
  for (const file of htmlFiles(DIST)) {
    for (const body of executableInlineScripts(readFileSync(file, 'utf8'))) {
      scriptCount += 1;
      sources.add(sha256Source(body));
    }
  }

  const list = [...sources];
  const updated = withScriptSrcHashes(readFileSync(HEADERS, 'utf8'), list);
  writeFileSync(HEADERS, updated);

  console.log(
    `[csp-hashes] ${scriptCount} inline script(s) across the build, ${list.length} distinct hash(es) added to script-src.`,
  );
  // A build that emits an inline script the CSP will refuse is the defect this
  // exists to stop, so a run that placed nothing is worth saying out loud
  // rather than passing quietly.
  if (list.length === 0) {
    console.log('[csp-hashes] no executable inline script found; script-src left unchanged.');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
