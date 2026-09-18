import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

/**
 * The Expo signup screen finishes signup instead of ending on a dead link
 * (US-791).
 *
 * Coolify sets GOTRUE_SITE_URL to ${SERVICE_URL_SUPABASEKONG} and will not let
 * this deployment change it, so every GoTrue email link falls back to the Kong
 * gateway and answers 401 application/json -- verified live against
 * api.tryeatpal.com and written up in docs/US-701-auth-code-flow-audit.md. The
 * screen used to call signUp and then render "We've sent a confirmation link",
 * with nothing behind it: an account created and no way to verify it.
 *
 * Scanned as source rather than rendered, because vitest's include is src/**
 * and the react-native tree is not in it. Comments are stripped first: this
 * file's own explanation of the old copy is not the old copy.
 */
const SIGNUP = path.join(process.cwd(), 'app', '(auth)', 'signup.tsx');

function sourceWithoutComments(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('the Expo signup screen verifies an emailed code', () => {
  const code = sourceWithoutComments(SIGNUP);

  it('no longer promises a confirmation link', () => {
    expect(code).not.toMatch(/confirmation link/i);
    expect(code).not.toMatch(/verify your email to complete signup/i);
  });

  it('verifies the code with type signup, the way the web client does', () => {
    expect(code).toContain('verifyOtp');
    expect(code).toMatch(/type:\s*'signup'/);
  });

  it('has a 6-digit entry wired for the OS autofill', () => {
    // Without textContentType the iOS keyboard does not offer the code from
    // the notification, which is most of the value of a code over a link.
    expect(code).toContain("textContentType=\"oneTimeCode\"");
    expect(code).toContain('maxLength={CODE_LENGTH}');
    expect(code).toMatch(/const CODE_LENGTH = 6/);
  });

  it('lets the user ask for another code rather than starting over', () => {
    expect(code).toMatch(/supabase\.auth\.resend/);
    expect(code).toMatch(/type:\s*'signup'/);
  });

  it('tells the user which of the OTP failures happened', () => {
    // Forwarding GoTrue's string leaves "retype it" and "ask for a new one"
    // indistinguishable; that is what src/lib/authOtpErrors.ts is for.
    expect(code).toContain('classifyOtpError');
    expect(code).toContain('otpFailureFallbackMessage');
  });

  it('signs the verified user in rather than sending them back to login', () => {
    // verifyOtp returns a session, so bouncing to /login would make the user
    // type the password they just chose.
    expect(code).toMatch(/router\.replace\('\/\(tabs\)\/'\)/);
  });

  it('imports useRouter, because the screen now navigates', () => {
    // A previous version of this file called useRouter() without importing it
    // and crashed on mount. TS2304 would catch it now, but only if it is read.
    expect(code).toMatch(/import\s*\{[^}]*useRouter[^}]*\}\s*from\s*'expo-router'/);
  });
});
