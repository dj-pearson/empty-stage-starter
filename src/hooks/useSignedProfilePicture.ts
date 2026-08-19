import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import {
  refreshAtFrom,
  retryDelayFor,
  storageRefFromPublicUrl,
  SIGNED_URL_TTL_SECONDS,
} from '@/lib/profilePictureUrl';

/**
 * US-634, Release N: read a kid photo through a signed URL instead of relying
 * on the bucket being public.
 *
 * Returns something renderable at all times. Until the first signed URL comes
 * back -- and permanently, if signing fails -- it hands back the stored public
 * URL, which still works because the bucket is public until Release N+1. So
 * this can ship without changing what any user sees, which is the point: it
 * moves the web off public readability so the bucket can be closed later
 * without a flag day.
 *
 * The URL is re-minted before it expires. A signed URL that dies mid-session
 * would leave a broken avatar on any tab nobody reloaded.
 */
export function useSignedProfilePicture(storedUrl?: string | null): string | undefined {
  // Bucket as well as path: the web writes into `profile-pictures` and iOS
  // writes kid photos into `images`, so which bucket to sign against is a
  // property of the stored value, not a constant.
  const ref = storageRefFromPublicUrl(storedUrl);
  const bucket = ref?.bucket;
  const objectPath = ref?.path;
  const [signedUrl, setSignedUrl] = useState<string | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    setSignedUrl(undefined);
    if (!bucket || !objectPath) return;

    let cancelled = false;
    let failures = 0;

    const mint = async () => {
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(objectPath, SIGNED_URL_TTL_SECONDS);

      if (cancelled) return;

      if (error || !data?.signedUrl) {
        // Fall back to the stored public URL rather than blanking an avatar,
        // and try again. Giving up after one failure is fine only while the
        // bucket is public: once a signed URL is the only read path, one blip
        // at refresh time would leave a broken avatar until the page reloads.
        failures += 1;
        const retryIn = retryDelayFor(failures);
        logger.warn(
          `Could not sign profile picture (attempt ${failures}), using the public URL` +
            `${retryIn === null ? '; giving up' : `; retrying in ${retryIn}ms`}:`,
          error,
        );
        setSignedUrl(undefined);
        if (retryIn !== null) timer.current = setTimeout(() => void mint(), retryIn);
        return;
      }

      failures = 0;
      setSignedUrl(data.signedUrl);

      const now = Date.now();
      timer.current = setTimeout(() => void mint(), refreshAtFrom(now) - now);
    };

    void mint();

    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
    // Two primitives rather than the ref object, so this does not re-run on
    // every render just because the helper returned a fresh object.
  }, [bucket, objectPath]);

  return signedUrl ?? storedUrl ?? undefined;
}
