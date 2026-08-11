/**
 * US-533: guard that every `verify_jwt = false` edge function enforces its own
 * authentication in-source.
 *
 * Supabase's `verify_jwt = false` disables the platform's JWT gate, so the
 * function is publicly reachable and MUST enforce its own secret / signature /
 * JWT check. This static test enumerates those functions from config.toml and
 * asserts each one's source contains a recognized auth-enforcement pattern, so
 * a new internal function that forgets its check cannot ship exposed.
 *
 * Run with: `deno test --allow-read functions/_shared/verify-jwt-guard_test.ts`
 *
 * This is a static source check (fast, hermetic, no live runtime) rather than a
 * live HTTP probe: it catches the actual failure mode — a function with no
 * enforcement at all — without needing the whole edge stack booted.
 */

import { assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';

/**
 * Functions that are INTENTIONALLY public (no caller secret required) and so are
 * exempt from the in-source auth check. Keep this list tight and justified.
 */
const PUBLIC_ALLOWLIST = new Set<string>([
  'health-check', // liveness probe; returns only coarse status, no user data
  'support-intake', // public "contact us" form submission (rate-limited server-side)
  // Serves the public sitemap.xml. Search-engine crawlers fetch it unauthenticated
  // by definition, and it exposes only URLs that are already public. Classified as
  // intentionally public in prd.json (US-558 sweep) but never added here, which is
  // why this gate has been failing.
  'generate-sitemap',
]);

/**
 * Recognized in-source auth-enforcement patterns. A `verify_jwt = false`
 * function must contain at least one:
 *  - AGENT_DISPATCH_SECRET  : internal shared-secret header (dispatcher/cron)
 *  - authenticateRequest    : requires a valid Supabase JWT in-function
 *  - verifyGithubSignature / verifySentrySignature : provider webhook HMAC
 *  - verifyStripeSignature / STRIPE_WEBHOOK_SECRET  : Stripe webhook HMAC
 *  - verifyCsatToken / verifyEmailToken / resolveCsatTokenSecret : signed link token
 *  - CRON_SECRET  : cron/service-role-only endpoint gated by a shared secret
 */
const AUTH_PATTERNS = [
  /AGENT_DISPATCH_SECRET/,
  /authenticateRequest/,
  /verifyGithubSignature/,
  /verifySentrySignature/,
  /verifyStripeSignature/,
  /STRIPE_WEBHOOK_SECRET/,
  /verifyCsatToken/,
  /verifyEmailToken/,
  /resolveCsatTokenSecret/,
  /CRON_SECRET/,
];

/** Parse `[functions.NAME]` blocks and their `verify_jwt` value from config.toml. */
function parseVerifyJwt(toml: string): Array<{ name: string; verifyJwt: boolean }> {
  const out: Array<{ name: string; verifyJwt: boolean }> = [];
  const re = /\[functions\.([a-z0-9-]+)\]\s*\nverify_jwt\s*=\s*(true|false)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(toml)) !== null) {
    out.push({ name: m[1], verifyJwt: m[2] === 'true' });
  }
  return out;
}

Deno.test('every verify_jwt=false function enforces its own auth (US-533)', async () => {
  const toml = await Deno.readTextFile(new URL('../../supabase/config.toml', import.meta.url));
  const fns = parseVerifyJwt(toml).filter((f) => !f.verifyJwt);

  assert(fns.length > 0, 'expected at least one verify_jwt=false function in config.toml');

  const unguarded: string[] = [];
  let checked = 0;

  for (const { name } of fns) {
    if (PUBLIC_ALLOWLIST.has(name)) continue;

    const indexPath = new URL(`../${name}/index.ts`, import.meta.url);
    let src: string;
    try {
      src = await Deno.readTextFile(indexPath);
    } catch {
      // Stale config entry with no deployable source — nothing to expose.
      continue;
    }

    checked++;
    if (!AUTH_PATTERNS.some((p) => p.test(src))) {
      unguarded.push(name);
    }
  }

  assert(checked > 0, 'expected to check at least one non-allowlisted function');
  assert(
    unguarded.length === 0,
    `verify_jwt=false functions with NO in-source auth enforcement (add a secret/JWT/HMAC check ` +
      `or add to PUBLIC_ALLOWLIST with justification): ${unguarded.join(', ')}`,
  );
});
