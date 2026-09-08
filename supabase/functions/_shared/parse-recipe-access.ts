/**
 * US-806: who may call `parse-recipe`, and how much an anonymous caller gets.
 *
 * Background. b9d0427b gated parse-recipe behind `requireUser` because the
 * function fetches a user-supplied URL and pays for a Claude call. Correct
 * intent, wrong assumption about the callers: the iOS share extension, the
 * `eatpal://recipe/import` deep link and the Shortcuts intent all go through
 * `Shared/RecipeParseAPI.swift`, which sends the Supabase anon key as its
 * bearer. That is not a user JWT, so `auth.getUser()` returned nothing and
 * every one of those paths has answered 401 since the gate deployed. The
 * in-app paste path survived only because it goes through EdgeFunctions.swift,
 * which substitutes a real access token when a session exists.
 *
 * A client fix needs an App Store release; this one reaches every build
 * already on a phone as soon as the functions container restarts. So anon is
 * allowed again, under a ceiling that keeps the denial-of-wallet hole closed:
 * a per-address budget for fairness and a global budget for the bill. The
 * SSRF guards from US-710 (`url-validator.ts`) are untouched and still run.
 *
 * TEMPORARY. Once the iOS release that publishes the session token to the App
 * Group is past MIN_SUPPORTED_IOS_BUILD, delete the anon branch and let
 * `requireUser` stand alone again.
 *
 * The counters live in module memory, not the database. That is a deliberate
 * trade: one container, one process, no migration, and nothing to apply by
 * hand against a prod database that already trails the migration tree. It
 * means the budget resets on redeploy and does not span replicas, which is
 * acceptable for a ceiling whose job is to bound a bill rather than to be
 * exact.
 */

/** Fixed window over which both budgets are counted. */
export const ANON_WINDOW_MS = 60 * 60 * 1000;

/** Anon parses allowed per client address per window. */
export const ANON_PER_IP_LIMIT = 10;

/**
 * Anon parses allowed in total per window. Sized off observed import volume
 * with headroom, and low enough that a scripted abuser costs pennies rather
 * than a rent cheque before the window closes.
 */
export const ANON_GLOBAL_LIMIT = 200;

/** Beyond this many tracked addresses, expired windows get swept. */
const PRUNE_THRESHOLD = 1000;

/** The subset of `requireUser`'s result this module needs. */
export interface GateResult {
  ok: boolean;
  status: number;
  error?: string;
  userId?: string;
  role?: string;
}

export type Access =
  | { allowed: true; mode: 'user' | 'anon'; userId?: string }
  | { allowed: false; status: number; error: string; retryAfterSeconds?: number };

export interface ResolveOptions {
  /** Defaults to `SUPABASE_ANON_KEY` from the function environment. */
  anonKey?: string;
  /** Injectable clock for tests. */
  now?: number;
}

interface Window {
  count: number;
  startedAt: number;
}

const perIp = new Map<string, Window>();
let global: Window = { count: 0, startedAt: 0 };

/** Drop every counter. Tests only. */
export function resetAnonBudget(): void {
  perIp.clear();
  global = { count: 0, startedAt: 0 };
}

/**
 * The caller's address as our edge recorded it, or null when nothing
 * attributable reached us. `x-forwarded-for` may be a chain; the left-most
 * entry is the original client.
 */
export function clientIp(req: Request): string | null {
  const forwarded = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim();
  if (forwarded) return forwarded;
  const cloudflare = (req.headers.get('cf-connecting-ip') ?? '').trim();
  return cloudflare || null;
}

function bearer(req: Request): string {
  return (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
}

/** Read a window, resetting it first if the previous one has elapsed. */
function current(window: Window, now: number): Window {
  if (now - window.startedAt >= ANON_WINDOW_MS) {
    window.count = 0;
    window.startedAt = now;
  }
  return window;
}

function secondsLeft(window: Window, now: number): number {
  return Math.max(1, Math.ceil((window.startedAt + ANON_WINDOW_MS - now) / 1000));
}

function sweep(now: number): void {
  if (perIp.size <= PRUNE_THRESHOLD) return;
  for (const [ip, window] of perIp) {
    if (now - window.startedAt >= ANON_WINDOW_MS) perIp.delete(ip);
  }
}

/**
 * Charge one anon parse against both budgets. Neither budget is charged unless
 * both have room, so a rejected request never eats into the next caller's
 * allowance.
 */
function spendAnonBudget(req: Request, now: number): Access {
  const globalWindow = current(global, now);
  if (globalWindow.count >= ANON_GLOBAL_LIMIT) {
    return {
      allowed: false,
      status: 429,
      error: 'Recipe import is busy right now. Sign in to EatPal, or try again shortly.',
      retryAfterSeconds: secondsLeft(globalWindow, now),
    };
  }

  // An unattributable caller is held to the global ceiling only. Bucketing
  // every header-less request together would mean one proxy that strips
  // x-forwarded-for takes down anonymous import for everyone behind it.
  const ip = clientIp(req);
  let ipWindow: Window | null = null;
  if (ip) {
    sweep(now);
    const existing = perIp.get(ip) ?? { count: 0, startedAt: now };
    ipWindow = current(existing, now);
    perIp.set(ip, ipWindow);

    if (ipWindow.count >= ANON_PER_IP_LIMIT) {
      return {
        allowed: false,
        status: 429,
        error: 'Too many recipe imports from this network. Sign in to EatPal, or try again later.',
        retryAfterSeconds: secondsLeft(ipWindow, now),
      };
    }
  }

  globalWindow.count++;
  if (ipWindow) ipWindow.count++;
  return { allowed: true, mode: 'anon' };
}

/**
 * Decide whether this request may parse a recipe.
 *
 * `gate` is invoked lazily, because a caller presenting the anon key is recognizable
 * from the header alone, and that is the common case (every share-extension
 * import), so it should not cost a round-trip to GoTrue.
 */
export async function resolveAccess(
  req: Request,
  gate: () => Promise<GateResult>,
  options: ResolveOptions = {},
): Promise<Access> {
  const now = options.now ?? Date.now();
  const anonKey = options.anonKey ?? Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const token = bearer(req);

  if (!token) {
    return { allowed: false, status: 401, error: 'Missing Authorization header' };
  }

  if (anonKey && token === anonKey) {
    return spendAnonBudget(req, now);
  }

  const result = await gate();
  if (result.ok) {
    return { allowed: true, mode: 'user', userId: result.userId };
  }

  // 401 means "this token names no user" — an expired session, or a client
  // that never had one. Both get the anon allowance. Anything else (a
  // misconfigured server, say) is a real failure and must not read as
  // anonymous.
  if (result.status === 401) {
    return spendAnonBudget(req, now);
  }

  return {
    allowed: false,
    status: result.status,
    error: result.error ?? 'Unauthorized',
  };
}
