import { describe, it, expect } from 'vitest';
import {
  objectPathFromPublicUrl,
  refreshAtFrom,
  isStale,
  SIGNED_URL_TTL_SECONDS,
  SIGNED_URL_REFRESH_MARGIN_SECONDS,
} from './profilePictureUrl';

const PUBLIC =
  'https://abc123.supabase.co/storage/v1/object/public/profile-pictures/user-1/photo-9.jpg';

describe('objectPathFromPublicUrl (US-634)', () => {
  it('recovers the object path a signed URL has to be minted from', () => {
    expect(objectPathFromPublicUrl(PUBLIC)).toBe('user-1/photo-9.jpg');
  });

  it('drops a query string the stored value picked up', () => {
    expect(objectPathFromPublicUrl(`${PUBLIC}?v=2`)).toBe('user-1/photo-9.jpg');
    expect(objectPathFromPublicUrl(`${PUBLIC}#top`)).toBe('user-1/photo-9.jpg');
  });

  it('decodes an escaped path', () => {
    const encoded =
      'https://abc123.supabase.co/storage/v1/object/public/profile-pictures/user-1/a%20b.jpg';
    expect(objectPathFromPublicUrl(encoded)).toBe('user-1/a b.jpg');
  });

  it('survives a malformed escape rather than throwing mid-render', () => {
    const bad =
      'https://abc123.supabase.co/storage/v1/object/public/profile-pictures/user-1/%E0%A4%A.jpg';
    expect(objectPathFromPublicUrl(bad)).toBe('user-1/%E0%A4%A.jpg');
  });

  /**
   * Every one of these must return null so the caller falls back to rendering
   * the stored value as-is. A wrong answer here is a missing avatar, not a
   * broken build, which is exactly the kind of regression that ships.
   */
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['an empty string', ''],
    ['a blob: preview of a just-picked file', 'blob:http://localhost/abc-123'],
    ['a data: URI', 'data:image/png;base64,iVBORw0KG'],
    ['an external avatar', 'https://lh3.googleusercontent.com/a/default-user'],
    ['a URL into a different bucket', 'https://abc.supabase.co/storage/v1/object/public/images/kids/x.jpg'],
    ['a signed URL that is already signed', 'https://abc.supabase.co/storage/v1/object/sign/profile-pictures/u/p.jpg?token=x'],
    ['the marker with nothing after it', 'https://abc.supabase.co/storage/v1/object/public/profile-pictures/'],
  ])('returns null for %s', (_label, value) => {
    expect(objectPathFromPublicUrl(value as string | null | undefined)).toBeNull();
  });
});

describe('refresh scheduling (US-634)', () => {
  it('re-mints before expiry, not at it', () => {
    const now = 1_000_000;
    const refreshAt = refreshAtFrom(now);

    expect(refreshAt).toBe(now + (SIGNED_URL_TTL_SECONDS - SIGNED_URL_REFRESH_MARGIN_SECONDS) * 1000);
    // The whole point: the refresh lands strictly inside the URL's lifetime.
    expect(refreshAt).toBeLessThan(now + SIGNED_URL_TTL_SECONDS * 1000);
  });

  it('never schedules in the past, however short the TTL', () => {
    const now = 1_000_000;
    // A TTL shorter than the margin would otherwise compute a negative lifetime
    // and re-mint on every render, hammering storage.
    expect(refreshAtFrom(now, 10, 60)).toBeGreaterThan(now);
  });

  it('reports staleness against the same schedule', () => {
    const minted = 1_000_000;
    const refreshAt = refreshAtFrom(minted);

    expect(isStale(minted, minted)).toBe(false);
    expect(isStale(minted, refreshAt - 1)).toBe(false);
    expect(isStale(minted, refreshAt)).toBe(true);
  });
});
