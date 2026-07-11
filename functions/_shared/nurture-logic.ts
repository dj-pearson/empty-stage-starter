/**
 * Pure engine logic for the nurture sequence engine (US-498).
 *
 * Free of DB/network so enroll / advance / exit / suppress decisions and the
 * unsubscribe token are unit-testable. The engine function wires these to the
 * database and to requestApproval.
 */

export interface NurtureStep {
  delay_hours: number;
  template_key: string;
  exit_on_events?: string[];
}

export interface NurtureSequence {
  id: string;
  name: string;
  trigger_event: string;
  steps: NurtureStep[];
  enabled: boolean;
}

export interface NurtureEnrollment {
  id: string;
  sequence_id: string;
  household_id: string | null;
  user_id: string | null;
  current_step: number;
  status: 'active' | 'completed' | 'exited' | 'suppressed';
  next_step_at: string | null;
}

export type StepAction = 'send' | 'exit' | 'suppress';

/** ISO time `delayHours` after `from`. */
export function computeNextStepAt(delayHours: number, from: Date): string {
  return new Date(from.getTime() + delayHours * 3_600_000).toISOString();
}

/** A household enrolls in a sequence when it is enabled and not already active in it. */
export function shouldEnroll(sequence: NurtureSequence, hasActiveEnrollment: boolean): boolean {
  return sequence.enabled && !hasActiveEnrollment;
}

/**
 * Decide what to do with a due enrollment's current step. Order of precedence:
 *   1. unsubscribed email     -> suppress (hard stop)
 *   2. step exit event fired  -> exit (goal met; e.g. first_kid_added)
 *   3. open support ticket    -> suppress
 *   4. nurture sent in <72h   -> suppress (frequency cap)
 *   5. otherwise              -> send
 */
export function decideStepAction(
  step: NurtureStep,
  recentEventTypesSinceEnroll: string[],
  flags: { emailSuppressed: boolean; hasOpenTicket: boolean; recentNurtureSent: boolean },
): StepAction {
  if (flags.emailSuppressed) return 'suppress';
  if (step.exit_on_events?.some((e) => recentEventTypesSinceEnroll.includes(e))) return 'exit';
  if (flags.hasOpenTicket) return 'suppress';
  if (flags.recentNurtureSent) return 'suppress';
  return 'send';
}

/**
 * Advance an enrollment AFTER sending its current step. Moves to the next step
 * (scheduling next_step_at from its delay) or completes the sequence.
 */
export function advanceEnrollment(
  enrollment: Pick<NurtureEnrollment, 'current_step'>,
  steps: NurtureStep[],
  now: Date,
): { current_step: number; status: NurtureEnrollment['status']; next_step_at: string | null } {
  const next = enrollment.current_step + 1;
  if (next >= steps.length) {
    return { current_step: next, status: 'completed', next_step_at: null };
  }
  return { current_step: next, status: 'active', next_step_at: computeNextStepAt(steps[next].delay_hours, now) };
}

// ---------------------------------------------------------------------------
// Unsubscribe token (HMAC-SHA256 over the email). Web Crypto — Deno + Node 22.
// ---------------------------------------------------------------------------

const enc = new TextEncoder();

function base64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlEncodeString(s: string): string {
  return base64url(enc.encode(s));
}
function b64urlDecodeString(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return base64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(message))));
}
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/** Sign an unsubscribe token binding the email: `<b64url(email)>.<hmac>`. */
export async function signEmailToken(email: string, secret: string): Promise<string> {
  const norm = email.trim().toLowerCase();
  return `${b64urlEncodeString(norm)}.${await hmac(secret, norm)}`;
}

/** Verify an unsubscribe token; returns the email or null when invalid. */
export async function verifyEmailToken(token: string, secret: string): Promise<string | null> {
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  let email: string;
  try {
    email = b64urlDecodeString(token.slice(0, dot));
  } catch {
    return null;
  }
  const expected = await hmac(secret, email);
  return timingSafeEqual(token.slice(dot + 1), expected) ? email : null;
}
