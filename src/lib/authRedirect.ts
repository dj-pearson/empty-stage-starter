/**
 * US-701 AC 4: nothing may pass a redirect GoTrue will not honour.
 *
 * GOTRUE_SITE_URL is pinned by Coolify to ${SERVICE_URL_SUPABASEKONG}, so a
 * link that falls back to it lands on the Kong gateway and answers 401
 * application/json. GoTrue only honours a `redirectTo` that appears in
 * GOTRUE_URI_ALLOW_LIST; anything else is silently replaced by that fallback.
 * So a redirect that is not on the list is worse than no redirect at all --
 * it looks configured and behaves like the broken default.
 *
 * The list below mirrors GOTRUE_URI_ALLOW_LIST as documented in
 * documents/OAUTH_CONFIG.md. authRedirect.test.ts asserts the two agree, so
 * editing one without the other fails the suite rather than production.
 *
 * The project verifies emailed {{ .Token }} codes rather than links, so no auth
 * flow DEPENDS on a redirect landing anywhere. This guard exists so the one
 * remaining `emailRedirectTo` (signup, where the confirmation mail carries both
 * a link and a code) cannot quietly become a dependency.
 */
import { logger } from '@/lib/logger';

/** Exactly the entries of GOTRUE_URI_ALLOW_LIST, in the documented order. */
export const GOTRUE_URI_ALLOW_LIST = [
  'https://tryeatpal.com',
  'https://tryeatpal.com/auth',
  'https://tryeatpal.com/auth/callback',
  'https://tryeatpal.com/dashboard',
] as const;

/**
 * Local development runs over http on localhost, which no production allow list
 * can carry. A dev build never talks to the production GoTrue, so permitting it
 * here costs nothing; permitting http anywhere else would.
 */
function isLocalDevOrigin(url: URL): boolean {
  return (
    (url.hostname === 'localhost' || url.hostname === '127.0.0.1') && url.protocol === 'http:'
  );
}

/**
 * The redirect to hand GoTrue, or `undefined` when the URL would not be
 * honoured. Returning undefined is deliberate: with no redirectTo, GoTrue uses
 * SITE_URL, which is the same place a rejected redirect would have gone -- but
 * the caller and the log now say so instead of the failure being invisible.
 */
export function allowedEmailRedirect(candidate: string): string | undefined {
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    logger.warn('[auth] emailRedirectTo is not a URL, dropping it', { candidate });
    return undefined;
  }

  if (isLocalDevOrigin(url)) return candidate;

  if (url.protocol !== 'https:') {
    logger.warn('[auth] emailRedirectTo must be https, dropping it', { candidate });
    return undefined;
  }

  // Compare on the full path, not the origin: the allow list GoTrue matches
  // against is a prefix list of complete URLs, and an origin-only check would
  // pass a path GoTrue then rejects.
  const normalized = url.href.replace(/\/$/, '');
  const permitted = GOTRUE_URI_ALLOW_LIST.some(
    (entry) => normalized === entry || normalized.startsWith(entry + '/'),
  );

  if (!permitted) {
    logger.warn(
      '[auth] emailRedirectTo is not in GOTRUE_URI_ALLOW_LIST, dropping it so the ' +
        'flow does not depend on the SITE_URL fallback (see documents/OAUTH_CONFIG.md)',
      { candidate },
    );
    return undefined;
  }

  return candidate;
}
