import { parseStorageObjectUrl, type StorageObjectRef } from '@/lib/storagePaths';

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
 * Buckets that `kids.profile_picture_url` can point into, most specific first.
 *
 * There are two, which is easy to miss and matters a great deal. The web
 * uploads to `profile-pictures`; the iOS app uploads kid photos to `images`
 * under a `kids/` prefix (ios/EatPal/EatPal/Services/ImageUploadService.swift,
 * bucketName = "images"). So the same column holds URLs from either bucket
 * depending on which client the parent used. A helper that only knew about
 * `profile-pictures` would silently decline to sign every iOS-uploaded photo,
 * and Release N+1 flipping `profile-pictures` private would leave those photos
 * publicly readable in the other bucket -- which is the outcome this story
 * exists to prevent. See US-635 for the `images` bucket's own audit.
 */
export const PROFILE_PICTURE_BUCKETS = ['profile-pictures', 'images'] as const;

export type { StorageObjectRef };

/**
 * Recover the bucket and storage object path from a stored public URL.
 *
 * Supabase public URLs look like
 *   https://<ref>.supabase.co/storage/v1/object/public/profile-pictures/<uid>/<id>.jpg
 * and the parts after `public/` are the bucket and the path createSignedUrl wants.
 *
 * Returns null for anything that is not a public URL into one of `buckets` --
 * an external avatar, a data: URI, a blob: preview of a file the user just
 * picked, or an empty column. Callers fall back to using the value as-is, so an
 * unrecognised shape degrades to today's behaviour rather than a missing image.
 */
export function storageRefFromPublicUrl(
  url: string | null | undefined,
  buckets: readonly string[] = PROFILE_PICTURE_BUCKETS,
): StorageObjectRef | null {
  if (!url || typeof url !== 'string') return null;
  // A just-picked file, not a stored object. Nothing to sign.
  if (url.startsWith('data:') || url.startsWith('blob:')) return null;

  // US-628's parser rather than a second one. Two functions turning the same
  // stored URL into (bucket, path) had already drifted: this one understood
  // only /object/public/, while the delete path also handled /object/sign/ and
  // refused a path containing "..". A read path and a delete path disagreeing
  // about what a URL means is exactly the kind of difference nobody notices
  // until an object is signed but never cleaned up.
  const ref = parseStorageObjectUrl(url);
  if (!ref) return null;

  // The one thing this adds: only sign buckets that hold kid photos. The delete
  // path is deliberately bucket-agnostic -- it removes whatever the record
  // points at -- but signing an arbitrary bucket because a URL named it is a
  // different matter.
  if (!buckets.includes(ref.bucket)) return null;

  return ref;
}

/**
 * Recover just the object path, for a caller that already knows the bucket.
 *
 * Kept because it reads better at a call site that genuinely means one bucket.
 */
export function objectPathFromPublicUrl(
  url: string | null | undefined,
  bucket = 'profile-pictures',
): string | null {
  return storageRefFromPublicUrl(url, [bucket])?.path ?? null;
}

/**
 * How long to wait before trying again after a signing attempt fails, by
 * attempt number. Capped rather than unbounded: the point is to survive a
 * transient error, not to hammer storage.
 *
 * Giving up after one failure is the behaviour this replaces, and it is only
 * invisible while the bucket is still public. Once Release N+1 makes a signed
 * URL the only way to read the object, a single blip at refresh time leaves a
 * permanently broken avatar until the page is reloaded.
 */
export const SIGNING_RETRY_DELAYS_MS = [5_000, 15_000, 45_000, 120_000] as const;

/**
 * Delay before retry number `attempt` (1-based), or null when the attempts are
 * exhausted and the stored public URL is all we have.
 */
export function retryDelayFor(attempt: number): number | null {
  if (attempt < 1) return SIGNING_RETRY_DELAYS_MS[0];
  return SIGNING_RETRY_DELAYS_MS[attempt - 1] ?? null;
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
