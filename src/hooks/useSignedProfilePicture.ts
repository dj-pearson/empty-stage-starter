import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import {
  objectPathFromPublicUrl,
  refreshAtFrom,
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
  const objectPath = objectPathFromPublicUrl(storedUrl);
  const [signedUrl, setSignedUrl] = useState<string | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    setSignedUrl(undefined);
    if (!objectPath) return;

    let cancelled = false;

    const mint = async () => {
      const { data, error } = await supabase.storage
        .from('profile-pictures')
        .createSignedUrl(objectPath, SIGNED_URL_TTL_SECONDS);

      if (cancelled) return;

      if (error || !data?.signedUrl) {
        // Fall back to the stored public URL rather than blanking an avatar.
        logger.warn('Could not sign profile picture, using the public URL:', error);
        setSignedUrl(undefined);
        return;
      }

      setSignedUrl(data.signedUrl);

      const now = Date.now();
      timer.current = setTimeout(() => void mint(), refreshAtFrom(now) - now);
    };

    void mint();

    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [objectPath]);

  return signedUrl ?? storedUrl ?? undefined;
}
