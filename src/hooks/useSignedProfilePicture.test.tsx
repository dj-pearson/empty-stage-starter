import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const createSignedUrl = vi.fn();
const storageFrom = vi.fn((_bucket: string) => ({ createSignedUrl }));

// vi.mock is hoisted above the consts, so the factory must not reference
// storageFrom directly -- only call it later, once it exists.
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { storage: { from: (bucket: string) => storageFrom(bucket) } },
}));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));

import { useSignedProfilePicture } from './useSignedProfilePicture';

const PUBLIC =
  'https://abc123.supabase.co/storage/v1/object/public/profile-pictures/user-1/photo.jpg';

/**
 * The iOS app uploads kid photos to a different bucket than the web does
 * (ImageUploadService.swift: bucketName = "images", folder "kids"), so this
 * column holds URLs from either one.
 */
const IOS_PUBLIC =
  'https://abc123.supabase.co/storage/v1/object/public/images/kids/2f8c-uuid.jpg';

beforeEach(() => {
  createSignedUrl.mockReset();
  storageFrom.mockClear();
});

describe('useSignedProfilePicture (US-634)', () => {
  it('renders the stored public URL immediately, before any signing round trip', () => {
    createSignedUrl.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useSignedProfilePicture(PUBLIC));

    // The bucket is still public until Release N+1, so there is never a moment
    // with no avatar.
    expect(result.current).toBe(PUBLIC);
  });

  it('swaps in the signed URL once it arrives', async () => {
    createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed/x' }, error: null });
    const { result } = renderHook(() => useSignedProfilePicture(PUBLIC));

    await waitFor(() => expect(result.current).toBe('https://signed/x'));
    expect(createSignedUrl).toHaveBeenCalledWith('user-1/photo.jpg', expect.any(Number));
  });

  it('keeps the public URL when signing fails, rather than blanking the avatar', async () => {
    createSignedUrl.mockResolvedValue({ data: null, error: { message: 'nope' } });
    const { result } = renderHook(() => useSignedProfilePicture(PUBLIC));

    await waitFor(() => expect(createSignedUrl).toHaveBeenCalled());
    expect(result.current).toBe(PUBLIC);
  });

  it('does not try to sign a value that is not an object in this bucket', () => {
    const { result } = renderHook(() =>
      useSignedProfilePicture('blob:http://localhost/just-picked'),
    );

    expect(createSignedUrl).not.toHaveBeenCalled();
    expect(result.current).toBe('blob:http://localhost/just-picked');
  });

  it('returns undefined for a kid with no photo', () => {
    const { result } = renderHook(() => useSignedProfilePicture(undefined));

    expect(createSignedUrl).not.toHaveBeenCalled();
    expect(result.current).toBeUndefined();
  });

  it('signs against the bucket the stored URL names, not a hardcoded one', async () => {
    createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed/ios' }, error: null });
    const { result } = renderHook(() => useSignedProfilePicture(IOS_PUBLIC));

    await waitFor(() => expect(result.current).toBe('https://signed/ios'));
    // Before this, the helper only knew about `profile-pictures`, so every
    // photo a parent uploaded from the iOS app was silently never signed --
    // and would have stayed publicly readable after Release N+1 closed the
    // other bucket.
    expect(storageFrom).toHaveBeenCalledWith('images');
    expect(createSignedUrl).toHaveBeenCalledWith('kids/2f8c-uuid.jpg', expect.any(Number));
  });

  it('still signs a web upload against profile-pictures', async () => {
    createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed/web' }, error: null });
    const { result } = renderHook(() => useSignedProfilePicture(PUBLIC));

    await waitFor(() => expect(result.current).toBe('https://signed/web'));
    expect(storageFrom).toHaveBeenCalledWith('profile-pictures');
  });

  it('leaves an object in an unrelated bucket alone', () => {
    const other =
      'https://abc123.supabase.co/storage/v1/object/public/blog-media/hero.jpg';
    const { result } = renderHook(() => useSignedProfilePicture(other));

    expect(createSignedUrl).not.toHaveBeenCalled();
    expect(result.current).toBe(other);
  });
});
