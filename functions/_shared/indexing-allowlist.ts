/**
 * Owned-hostname allowlist for the google-indexing edge function (US-518).
 *
 * Submitting or removing URLs from Google's index uses the site's service
 * account and a scarce daily quota, so callers must only be able to act on
 * hostnames we actually own. Pure, dependency-free logic so it can be unit
 * tested without a live request.
 */

/** Default owned hostnames when INDEXING_ALLOWED_HOSTS is not configured. */
export const DEFAULT_OWNED_HOSTS = ['tryeatpal.com', 'www.tryeatpal.com'];

/**
 * Resolve the owned-hostname allowlist from an optional comma-separated env
 * string, falling back to the production defaults.
 */
export function ownedHosts(configured?: string | null): string[] {
  if (configured) {
    const parsed = configured
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean);
    if (parsed.length > 0) return parsed;
  }
  return DEFAULT_OWNED_HOSTS;
}

/**
 * True only if `rawUrl` is a well-formed https URL whose hostname is an exact
 * match against the allowlist. Rejects non-https, invalid URLs, and any host
 * (including subdomains) not explicitly listed.
 */
export function isOwnedUrl(rawUrl: string, hosts: string[]): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  return hosts.includes(url.hostname.toLowerCase());
}
