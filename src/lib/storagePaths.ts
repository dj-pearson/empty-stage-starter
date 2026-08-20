/**
 * US-628: turning a stored Supabase Storage public URL back into the
 * (bucket, path) pair needed to delete the object.
 *
 * Photos are persisted as full public URLs (kids.profile_picture_url), so the
 * only way to delete one later is to parse the URL back down. Two buckets are
 * in play: profile-pictures, written by the web app at {userId}/{id}.ext, and
 * images, written by iOS at kids/{kidId}-{unix}.jpg (see US-635).
 */

export interface StorageObjectRef {
  bucket: string;
  path: string;
}

const PUBLIC_MARKER = '/storage/v1/object/public/';
const SIGNED_MARKER = '/storage/v1/object/sign/';

/**
 * Parses a Supabase Storage URL into the bucket and object path.
 * Returns null for anything that is not a storage URL - an external avatar, a
 * data: URI, an empty field - so callers can skip it rather than guess.
 */
export function parseStorageObjectUrl(url: string | null | undefined): StorageObjectRef | null {
  if (!url || typeof url !== 'string') return null;

  const marker = url.includes(PUBLIC_MARKER)
    ? PUBLIC_MARKER
    : url.includes(SIGNED_MARKER)
      ? SIGNED_MARKER
      : null;
  if (!marker) return null;

  const afterMarker = url.slice(url.indexOf(marker) + marker.length);
  // Signed URLs carry a ?token=; public ones can still pick up a cache-buster,
  // and a stored value can carry a #fragment. Neither is part of the object
  // path -- keeping a fragment meant remove() was called with
  // "user-1/photo.jpg#top", which matches nothing, so the cleanup quietly
  // failed and left the object behind.
  const withoutQuery = afterMarker.split(/[?#]/)[0];
  const separator = withoutQuery.indexOf('/');
  if (separator <= 0) return null;

  const bucket = withoutQuery.slice(0, separator);
  const path = withoutQuery.slice(separator + 1);
  if (!bucket || !path) return null;

  // A stored URL is user-controlled input by the time it comes back out of the
  // database. Refuse traversal rather than handing it to storage.remove().
  if (path.includes('..')) return null;

  return { bucket, path: decodePathSafely(path) };
}

/**
 * decodeURIComponent throws a URIError on a malformed escape ("a%zz.jpg"), and
 * this function is called BEFORE the caller's try block in
 * deleteStorageObject -- so a single stray % in a stored URL escaped as an
 * unhandled rejection out of a `void deleteReplacedStorageObject(...)` during
 * the kid save flow. A path that will not decode is still a path; hand back
 * what is there and let storage answer for it.
 */
function decodePathSafely(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}
