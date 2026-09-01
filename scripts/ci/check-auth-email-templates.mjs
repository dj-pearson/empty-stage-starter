#!/usr/bin/env node
/**
 * US-700/US-701: every auth email must carry the code its client asks for.
 *
 * WHY THIS EXISTS, because the failure is invisible from inside the repo:
 * GOTRUE_SITE_URL is pinned by Coolify to ${SERVICE_URL_SUPABASEKONG}, so any
 * GoTrue email LINK that falls back to it lands on the Kong gateway, which
 * answers 401 application/json. That is why every auth flow here verifies an
 * emailed {{ .Token }} through verifyOtp instead. The token template is not a
 * nicety; it is the only delivery shape that can work.
 *
 * GoTrue renders a custom template only when its MAILER_TEMPLATES_* variables
 * point at one. On this deployment those are wired through a rename that is
 * very easy to get wrong:
 *
 *   docker-compose.yml:475
 *     GOTRUE_MAILER_TEMPLATES_CONFIRMATION: '${MAILER_TEMPLATES_CONFIRMATION}'
 *
 * The container variable is GOTRUE_-prefixed; the key Coolify must hold is
 * NOT. Setting GOTRUE_MAILER_TEMPLATES_CONFIRMATION in Coolify writes a key
 * the compose never reads, and the container keeps its empty value with no
 * error anywhere. That has already happened twice on this service.
 *
 * So this gate checks the two things a repo CAN check:
 *   1. Every template still renders {{ .Token }}, in both the supabase/ copy
 *      and the hosted public/ copy. If someone "tidies" a placeholder away,
 *      that flow breaks silently for everyone.
 *   2. When AUTH_TEMPLATE_BASE_URL is set, each hosted template is fetched and
 *      checked for the placeholder, so a deploy that drops one is caught.
 *      Unset, it exits 0 with "no target configured" and is safe in CI,
 *      matching scripts/ci/schema-drift-report.mjs.
 *
 * It cannot read the production environment. docs/US-700-auth-email-template-runbook.md
 * carries the operator step and the exact key names.
 */
import fs from 'fs';

const TOKEN_PLACEHOLDER = '{{ .Token }}';

/**
 * Every flow that mails a code. `recovery` matters as much as `confirmation`:
 * the password reset shipped in 70c4559e asks the user for a 6-digit code that
 * only recovery.html produces.
 */
const FLOWS = ['confirmation', 'recovery', 'magic_link', 'email_change', 'invite'];

const localCopies = (flow) => [
  `supabase/templates/${flow}.html`,
  `public/email-templates/${flow}.html`,
];

let failed = false;

function fail(message) {
  console.error(`FAIL  ${message}`);
  failed = true;
}

function ok(message) {
  console.log(`ok    ${message}`);
}

for (const flow of FLOWS) {
  for (const relPath of localCopies(flow)) {
    if (!fs.existsSync(relPath)) {
      fail(`${relPath} is missing. GoTrue has no custom ${flow} template to point at.`);
      continue;
    }
    const body = fs.readFileSync(relPath, 'utf8');
    if (!body.includes(TOKEN_PLACEHOLDER)) {
      fail(
        `${relPath} does not render ${TOKEN_PLACEHOLDER}. ` +
          `The ${flow} flow asks the user for a code; without this placeholder no email contains one.`
      );
      continue;
    }
    ok(`${relPath} renders ${TOKEN_PLACEHOLDER}`);
  }
}

const baseUrl = process.env.AUTH_TEMPLATE_BASE_URL;

if (!baseUrl) {
  console.log('ok    no target configured (AUTH_TEMPLATE_BASE_URL unset), skipping the live fetch');
} else {
  for (const flow of FLOWS) {
    const url = `${baseUrl.replace(/\/$/, '')}/${flow}.html`;
    try {
      // The hosted copies 308-redirect to their extensionless path, so this
      // must follow redirects or it reports a false failure.
      const res = await fetch(url, { redirect: 'follow' });
      if (!res.ok) {
        fail(`${url} returned HTTP ${res.status}. GoTrue cannot fetch the template it is pointed at.`);
        continue;
      }
      const body = await res.text();
      if (!body.includes(TOKEN_PLACEHOLDER)) {
        fail(
          `${url} returned HTTP 200 but the body does not contain ${TOKEN_PLACEHOLDER}. ` +
            `GoTrue would send a ${flow} email with no code in it.`
        );
        continue;
      }
      ok(`${url} serves a body containing ${TOKEN_PLACEHOLDER}`);
    } catch (error) {
      fail(`could not fetch ${url}: ${error.message}`);
    }
  }
}

if (failed) {
  console.error('');
  console.error('An auth email is broken or about to be.');
  console.error('See docs/US-700-auth-email-template-runbook.md.');
  process.exit(1);
}

console.log('');
console.log('Auth email template checks passed.');
