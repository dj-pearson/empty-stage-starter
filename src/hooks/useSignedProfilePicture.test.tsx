import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const createSignedUrl = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { storage: { from: () => ({ createSignedUrl }) } },
}));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));

import { useSignedProfilePicture } from './useSignedProfilePicture';

const PUBLIC =
  'https://abc123.supabase.co/storage/v1/object/public/profile-pictures/user-1/photo.jpg';

beforeEach(() => {
  createSignedUrl.mockReset();
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
});
