#!/usr/bin/env node
/**
 * US-700: the signup confirmation email must carry the code the app asks for.
 *
 * WHY THIS EXISTS, because the failure is invisible from inside the repo:
 * supabase/templates/confirmation.html renders `{{ .Token }}`, a 6-digit code,
 * and src/pages/Auth.tsx puts every new signup on a screen that asks for that
 * code. But GoTrue only uses a custom template when
 * GOTRUE_MAILER_TEMPLATES_CONFIRMATION points at one. On the production
 * container that variable is EMPTY, so GoTrue falls back to its stock
 * link-only email and the code the UI demands does not exist in any message
 * the user receives. Resend sends the same link-only mail again.
 *
 * That drift cost 35 of the first 200 accounts, and nothing in the repo could
 * see it: both template files are correct, the client code is correct, and the
 * bug lives entirely in one unset environment variable.
 *
 * So this gate checks the two things a repo CAN check:
 *   1. Both template copies still render {{ .Token }}. If someone "tidies" the
 *      placeholder away, signup breaks silently for everyone.
 *   2. When AUTH_CONFIRMATION_TEMPLATE_URL is set, the URL GoTrue is pointed
 *      at actually serves a body containing {{ .Token }}. Unset, it exits 0
 *      with "no target configured" so it is safe in CI, matching
 *      scripts/ci/schema-drift-report.mjs.
 *
 * It cannot assert the production env var itself; that read needs credentials
 * CI does not hold. docs/US-700-auth-email-template-runbook.md carries the
 * operator step.
 */
import fs from 'fs';

const TOKEN_PLACEHOLDER = '{{ .Token }}';

const LOCAL_TEMPLATES = [
  'supabase/templates/confirmation.html',
  'public/email-templates/confirmation.html',
];

/** Exit code accumulator; every check runs so one report lists every fault. */
let failed = false;

function fail(message) {
  console.error(`FAIL  ${message}`);
  failed = true;
}

function ok(message) {
  console.log(`ok    ${message}`);
}

for (const relPath of LOCAL_TEMPLATES) {
  if (!fs.existsSync(relPath)) {
    fail(`${relPath} is missing. GoTrue has no custom confirmation template to point at.`);
    continue;
  }
  const body = fs.readFileSync(relPath, 'utf8');
  if (!body.includes(TOKEN_PLACEHOLDER)) {
    fail(
      `${relPath} does not render ${TOKEN_PLACEHOLDER}. ` +
        'The web signup screen asks for a 6-digit code; without this placeholder no email contains one.'
    );
    continue;
  }
  ok(`${relPath} renders ${TOKEN_PLACEHOLDER}`);
}

const templateUrl = process.env.AUTH_CONFIRMATION_TEMPLATE_URL;

if (!templateUrl) {
  console.log('ok    no target configured (AUTH_CONFIRMATION_TEMPLATE_URL unset), skipping the live fetch');
} else {
  try {
    const res = await fetch(templateUrl, { redirect: 'follow' });
    if (!res.ok) {
      fail(`${templateUrl} returned HTTP ${res.status}. GoTrue cannot fetch the template it is pointed at.`);
    } else {
      const body = await res.text();
      if (!body.includes(TOKEN_PLACEHOLDER)) {
        fail(
          `${templateUrl} returned HTTP 200 but the body does not contain ${TOKEN_PLACEHOLDER}. ` +
            'GoTrue would render an email with no verification code in it.'
        );
      } else {
        ok(`${templateUrl} serves a body containing ${TOKEN_PLACEHOLDER}`);
      }
    }
  } catch (error) {
    fail(`could not fetch ${templateUrl}: ${error.message}`);
  }
}

if (failed) {
  console.error('');
  console.error('The signup confirmation email is broken or about to be.');
  console.error('See docs/US-700-auth-email-template-runbook.md.');
  process.exit(1);
}

console.log('');
console.log('Confirmation email template checks passed.');
