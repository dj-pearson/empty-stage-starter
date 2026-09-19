/**
 * US-702: what to tell someone whose 6-digit code did not work.
 *
 * GoTrue answers a wrong code and an expired code with the same human string,
 * "Token has expired or is invalid", so passing `error.message` through leaves
 * the user unable to tell whether to retype the code or ask for a new one --
 * the two cases have opposite remedies. The machine-readable `code` field does
 * separate them (`otp_expired` vs `otp_disabled` vs a plain 403), so classify
 * on that first and fall back to the message only when it is unambiguous.
 *
 * This project verifies emailed codes rather than links because Coolify pins
 * GOTRUE_SITE_URL to ${SERVICE_URL_SUPABASEKONG}, and a link that falls back to
 * it answers 401 application/json. See docs/US-700-auth-email-template-runbook.md.
 */

export type OtpFailure =
  | 'expired'
  | 'invalid'
  | 'already_confirmed'
  | 'rate_limited'
  | 'unknown';

/** The shape supabase-js hands back; every field is optional in practice. */
export interface OtpErrorLike {
  code?: string | null;
  status?: number | null;
  message?: string | null;
}

/**
 * `code` is authoritative when present. The message fallback matters because
 * self-hosted GoTrue versions predating the error-code work send none.
 */
export function classifyOtpError(error: OtpErrorLike | null | undefined): OtpFailure {
  if (!error) return 'unknown';

  switch (error.code) {
    case 'otp_expired':
      return 'expired';
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'rate_limited';
    case 'email_address_not_authorized':
    case 'validation_failed':
      return 'invalid';
    default:
      break;
  }

  if (error.status === 429) return 'rate_limited';

  const message = (error.message ?? '').toLowerCase();
  if (!message) return 'unknown';

  // "already confirmed" has to be tested before the expiry match: GoTrue words
  // it as "Email link is invalid or has expired" for a token that was already
  // spent, which would otherwise read as an expiry and send the user round the
  // resend loop when they are in fact free to sign in.
  if (message.includes('already') && (message.includes('confirm') || message.includes('register'))) {
    return 'already_confirmed';
  }
  if (message.includes('rate limit') || message.includes('too many')) return 'rate_limited';
  if (message.includes('expired')) return 'expired';
  if (message.includes('invalid') || message.includes('incorrect')) return 'invalid';

  return 'unknown';
}

/**
 * True when a sign-in failed only because the address was never verified.
 * That user has an account and needs the code screen, not the raw
 * "Email not confirmed" string and a dead end (US-702 AC 4).
 */
export function isUnconfirmedEmailError(error: OtpErrorLike | null | undefined): boolean {
  if (!error) return false;
  if (error.code === 'email_not_confirmed') return true;
  const message = (error.message ?? '').toLowerCase();
  return message.includes('email not confirmed') || message.includes('email address not confirmed');
}

/** i18n key under the `auth` namespace carrying the copy for each outcome. */
export function otpFailureMessageKey(failure: OtpFailure): string {
  switch (failure) {
    case 'expired':
      return 'auth.otpExpired';
    case 'invalid':
      return 'auth.otpInvalid';
    case 'already_confirmed':
      return 'auth.otpAlreadyConfirmed';
    case 'rate_limited':
      return 'auth.otpRateLimited';
    default:
      return 'auth.otpUnknown';
  }
}

/**
 * The same copy, as literal English, for clients with no i18next (US-791).
 *
 * The Expo tree under app/ never mounts <I18nextProvider>, so it cannot call
 * t() -- and hardcoding a second, slightly different wording there is how the
 * signup screen and the web one end up telling a user two different things
 * about the same GoTrue failure. The test beside this file asserts each string
 * equals the en.json value that otpFailureMessageKey() points at, so the two
 * cannot drift apart silently.
 */
export function otpFailureFallbackMessage(failure: OtpFailure): string {
  switch (failure) {
    case 'expired':
      return 'That code has expired. Send yourself a new one and enter it within the hour.';
    case 'invalid':
      return 'That code is not right. Check the six digits in your most recent email.';
    case 'already_confirmed':
      return 'This address is already verified. Sign in with your password.';
    case 'rate_limited':
      return 'Too many attempts. Wait a few minutes before asking for another code.';
    default:
      return 'We could not verify that code. Send yourself a new one and try again.';
  }
}
