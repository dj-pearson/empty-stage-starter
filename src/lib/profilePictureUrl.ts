/**
 * US-634: turn a stored public profile-picture URL into a signed one.
 *
 * The `profile-pictures` bucket is still public-read by URL, and shipped iOS
 * builds render `kids.profile_picture_url` directly (Kid.swift:11), so the
 * column must keep holding a plain public URL. This is the Release N half of
 * the CLAUDE.md deprecation flow: the WEB stops relying on public readability
 * by minting a signed URL at render time, while the stored value stays
 * unchanged for old clients. Release N+1 flips the bucket private, once
 * app_config.min_ios_build is past the release that ships this.
 *
 * Nothing here changes what is written. It only changes what the web reads.
 */

/** How long a minted URL lasts. Long enough to render, short enough to matter. */
export const SIGNED_URL_TTL_SECONDS = 600;

/**
 * Re-mint this many seconds before expiry. A signed URL that dies mid-session
 * leaves a broken avatar on a tab nobody reloaded, which is the failure mode
 * that makes "just sign it once" wrong.
 */
export const SIGNED_URL_REFRESH_MARGIN_SECONDS = 60;

/**
 * Recover the storage object path from a stored public URL.
 *
 * Supabase public URLs look like
 *   https://<ref>.supabase.co/storage/v1/object/public/profile-pictures/<uid>/<id>.jpg
 * and the part after the bucket name is what createSignedUrl wants.
 *
 * Returns null for anything that is not a URL into this bucket -- an external
 * avatar, a data: URI, a blob: preview of a file the user just picked, or an
 * empty column. Callers fall back to using the value as-is, so an unrecognised
 * shape degrades to today's behaviour rather than a missing image.
 */
export function objectPathFromPublicUrl(
  url: string | null | undefined,
  bucket = 'profile-pictures',
): string | null {
  if (!url || typeof url !== 'string') return null;
  if (url.startsWith('data:') || url.startsWith('blob:')) return null;

  const marker = `/storage/v1/object/public/${bucket}/`;
  const at = url.indexOf(marker);
  if (at === -1) return null;

  const rest = url.slice(at + marker.length);
  if (!rest) return null;

  // Drop any query string or fragment the stored value picked up.
  const objectPath = rest.split(/[?#]/)[0];
  if (!objectPath) return null;

  try {
    return decodeURIComponent(objectPath);
  } catch {
    // A malformed escape sequence is not worth throwing over mid-render.
    return objectPath;
  }
}

/** When a URL minted now should be replaced, as an epoch-ms timestamp. */
export function refreshAtFrom(
  nowMs: number,
  ttlSeconds = SIGNED_URL_TTL_SECONDS,
  marginSeconds = SIGNED_URL_REFRESH_MARGIN_SECONDS,
): number {
  // Never schedule in the past, however small the caller makes the TTL.
  const lifetime = Math.max(ttlSeconds - marginSeconds, 1);
  return nowMs + lifetime * 1000;
}

/** True when a URL minted at `mintedAtMs` is due to be replaced. */
export function isStale(
  mintedAtMs: number,
  nowMs: number,
  ttlSeconds = SIGNED_URL_TTL_SECONDS,
  marginSeconds = SIGNED_URL_REFRESH_MARGIN_SECONDS,
): boolean {
  return nowMs >= refreshAtFrom(mintedAtMs, ttlSeconds, marginSeconds);
}
