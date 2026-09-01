import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import path from 'path';

/**
 * US-700: the confirmation email must carry the code the signup screen asks for.
 *
 * src/pages/Auth.tsx sends every new signup to an OTP screen that says
 * "We've sent a 6-digit verification code to your email". The only thing that
 * puts a code in that email is the `{{ .Token }}` placeholder in the
 * confirmation template. Delete it, or "clean up" the template down to a link,
 * and signup breaks for everyone with no error anywhere.
 *
 * This runs in the normal vitest suite rather than only in scripts/ci/ because
 * the repo's own notes record that Deno tests under functions/_shared are
 * mostly never executed; a check that runs on every `vitest run` is the one
 * that actually holds.
 *
 * The live-URL half of this lives in scripts/ci/check-auth-email-templates.mjs,
 * which needs a network fetch and so cannot sit here.
 */
const TOKEN_PLACEHOLDER = '{{ .Token }}';

const TEMPLATES = [
  // What GoTrue is configured to render, when it is configured at all.
  'supabase/templates/confirmation.html',
  // The hosted copy, served from the site so GOTRUE_MAILER_TEMPLATES_CONFIRMATION
  // has a stable URL to point at.
  'public/email-templates/confirmation.html',
];

describe('signup confirmation email template', () => {
  it.each(TEMPLATES)('%s exists', (relPath) => {
    expect(existsSync(path.join(process.cwd(), relPath))).toBe(true);
  });

  it.each(TEMPLATES)('%s renders the verification code placeholder', (relPath) => {
    const body = readFileSync(path.join(process.cwd(), relPath), 'utf8');
    expect(body).toContain(TOKEN_PLACEHOLDER);
  });

  /**
   * The two copies drifted once already (differing titles, differing body copy,
   * one carrying a features block the other lacks). Cosmetic drift is tolerable;
   * drift in the part that carries the code is not, because only one of the two
   * is the file GoTrue renders and the other is the one a human reads when
   * checking whether the email "looks right".
   */
  it('keeps the code block identical across both copies', () => {
    const codeBlock = (relPath: string) => {
      const body = readFileSync(path.join(process.cwd(), relPath), 'utf8');
      const index = body.indexOf(TOKEN_PLACEHOLDER);
      expect(index).toBeGreaterThan(-1);
      // The styled container the code sits in, normalised for whitespace.
      return body.slice(Math.max(0, index - 400), index).replace(/\s+/g, ' ').trim();
    };

    expect(codeBlock(TEMPLATES[0])).toBe(codeBlock(TEMPLATES[1]));
  });
});
