/**
 * Pure logic for the CSAT follow-up agent + rating endpoint (US-495).
 *
 * The signed token (HMAC-SHA256 over the ticket id) and the email template are
 * free of DB/runtime so they are unit-testable. Web Crypto is available in both
 * Deno and Node 22, so the signing round-trips in tests.
 */

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
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return base64url(new Uint8Array(sig));
}

/** Constant-time string compare (equal length assumed after prefix checks). */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Sign a CSAT token binding the ticket id: `<b64url(ticketId)>.<hmac>`. */
export async function signCsatToken(ticketId: string, secret: string): Promise<string> {
  return `${b64urlEncodeString(ticketId)}.${await hmac(secret, ticketId)}`;
}

/** Verify a CSAT token; returns the ticket id or null when invalid/tampered. */
export async function verifyCsatToken(token: string, secret: string): Promise<string | null> {
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  let ticketId: string;
  try {
    ticketId = b64urlDecodeString(token.slice(0, dot));
  } catch {
    return null;
  }
  const expected = await hmac(secret, ticketId);
  return timingSafeEqual(token.slice(dot + 1), expected) ? ticketId : null;
}

/** Score at or below 2 (a bad experience) escalates. */
export function scoreEscalates(score: number): boolean {
  return score >= 1 && score <= 2;
}

/** Valid CSAT scores are integers 1..5. */
export function isValidScore(score: number): boolean {
  return Number.isInteger(score) && score >= 1 && score <= 5;
}

/** The 1..5 rating links for the email buttons. `functionsBase` is the edge
 *  functions origin (e.g. https://functions.tryeatpal.com). */
export function ratingLinks(functionsBase: string, token: string): Array<{ score: number; url: string }> {
  const base = functionsBase.replace(/\/$/, '');
  return [1, 2, 3, 4, 5].map((score) => ({
    score,
    url: `${base}/csat-rate?t=${encodeURIComponent(token)}&score=${score}`,
  }));
}

export interface CsatEmail {
  subject: string;
  html: string;
}

/** Templated CSAT rating email (subject + body with 1..5 buttons). */
export function buildCsatEmail(ticketSubject: string, links: Array<{ score: number; url: string }>): CsatEmail {
  const buttons = links
    .map(
      (l) =>
        `<a href="${l.url}" style="display:inline-block;margin:0 4px;padding:10px 14px;border:1px solid #d1d5db;border-radius:8px;text-decoration:none;color:#111827">${l.score}</a>`,
    )
    .join('');
  return {
    subject: `How did we do? — ${ticketSubject}`,
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:520px">
        <p>Thanks for contacting EatPal support. How would you rate your experience?</p>
        <p style="text-align:center;margin:20px 0">${buttons}</p>
        <p style="color:#6b7280;font-size:13px">1 = poor, 5 = great. One tap — no login needed.</p>
      </div>`.trim(),
  };
}
