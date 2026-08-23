import * as Sentry from '@sentry/react';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { parseStorageObjectUrl } from '@/lib/storagePaths';

/**
 * An object we meant to delete and did not is a Privacy Policy problem, not a
 * debug line: the promise is that deleting a child profile deletes the data.
 * Every caller discards this module's return value (`void
 * deleteReplacedStorageObject(...)`, and KidsContext ignores it), and
 * logger.warn reaches console.warn and nothing else -- so without this the
 * orphan is recorded in a browser console nobody reads.
 *
 * Reported here rather than through either logError helper: there are two of
 * them, in sentry.tsx and api-errors.ts, and both stamp a `source` tag that is
 * not this one. A compliance signal filed under the wrong source is a signal
 * nobody finds.
 */
function reportOrphanedObject(reason: string, context: Record<string, unknown>): void {
  logger.warn(`Storage object was not removed: ${reason}`, context);
  if (import.meta.env.MODE === 'production' || import.meta.env.VITE_SENTRY_ENABLED === 'true') {
    Sentry.captureException(new Error(`Storage object not removed: ${reason}`), {
      tags: { type: 'storage_orphan' },
      extra: context,
    });
  }
}

/**
 * US-628: removes an uploaded photo given the public URL stored on the record.
 *
 * Always best-effort. The Privacy Policy promises that deleting a child profile
 * or an account deletes that data, so an orphaned object is a compliance
 * problem - but failing the user's delete because a storage call errored is a
 * worse one. Errors are logged, never thrown, never surfaced as a toast.
 *
 * Returns true when an object was removed, false when there was nothing to
 * remove or the removal failed -- including the silent case where RLS hid the
 * row, which Supabase reports as success with an empty result rather than as an
 * error.
 */
export async function deleteStorageObject(url: string | null | undefined): Promise<boolean> {
  const ref = parseStorageObjectUrl(url);
  if (!ref) return false;

  try {
    const { data, error } = await supabase.storage.from(ref.bucket).remove([ref.path]);
    if (error) {
      reportOrphanedObject('the storage API returned an error', {
        bucket: ref.bucket,
        path: ref.path,
        error,
      });
      return false;
    }
    // An RLS-blocked removal is NOT an error. storage.remove() returns the list
    // of objects it actually removed, and a row the policy hides simply is not
    // in it -- so checking `error` alone reports success while the object stays.
    // That is exactly what happened to profile-pictures: the SELECT policy
    // matches folder OR owner, the DELETE policy matched folder only, and a
    // legacy object was readable by its owner and undeletable by them.
    // 20260822000003 gives the write policies the same owner branch; this makes
    // the next such gap loud instead of silent.
    if (Array.isArray(data) && data.length === 0) {
      reportOrphanedObject('no matching object, or RLS denied it', {
        bucket: ref.bucket,
        path: ref.path,
      });
      return false;
    }
    return true;
  } catch (err) {
    reportOrphanedObject('the storage call threw', { bucket: ref.bucket, path: ref.path, err });
    return false;
  }
}

/**
 * Removes a photo that is being replaced. Skips the call when the record is
 * keeping the same object, so a no-op edit cannot delete the live photo.
 */
export async function deleteReplacedStorageObject(
  previousUrl: string | null | undefined,
  nextUrl: string | null | undefined
): Promise<boolean> {
  if (!previousUrl || previousUrl === nextUrl) return false;
  return deleteStorageObject(previousUrl);
}
