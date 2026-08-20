import { describe, it, expect } from 'vitest';
import {
  objectPathFromPublicUrl,
  refreshAtFrom,
  isStale,
  SIGNED_URL_TTL_SECONDS,
  SIGNED_URL_REFRESH_MARGIN_SECONDS,
  storageRefFromPublicUrl,
  retryDelayFor,
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
    ['the marker with nothing after it', 'https://abc.supabase.co/storage/v1/object/public/profile-pictures/'],
  ])('returns null for %s', (_label, value) => {
    expect(objectPathFromPublicUrl(value as string | null | undefined)).toBeNull();
  });

  it('recovers the path from an already-signed URL rather than declining it', () => {
    // This used to return null, back when this file carried its own parser that
    // only knew /object/public/. Delegating to US-628's parser changed it, and
    // the new answer is the better one: a signed URL handed to the hook would
    // otherwise be rendered as-is and never refreshed, so the avatar would
    // break the moment that token expired. Re-signing it is self-healing.
    expect(
      objectPathFromPublicUrl(
        'https://abc.supabase.co/storage/v1/object/sign/profile-pictures/u/p.jpg?token=x',
      ),
    ).toBe('u/p.jpg');
  });

  it('refuses a path traversal, which the parser here previously did not check', () => {
    expect(
      objectPathFromPublicUrl(
        'https://abc.supabase.co/storage/v1/object/public/profile-pictures/u/../../etc/x.jpg',
      ),
    ).toBeNull();
  });

  it('does not throw on a malformed escape', () => {
    // decodeURIComponent raises URIError on "%zz", and parseStorageObjectUrl is
    // called BEFORE deleteStorageObject's try block -- so this used to escape as
    // an unhandled rejection out of a void-ed call during the kid save flow.
    expect(() =>
      objectPathFromPublicUrl(
        'https://abc.supabase.co/storage/v1/object/public/profile-pictures/u/a%zz.jpg',
      ),
    ).not.toThrow();
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

/**
 * US-634: `kids.profile_picture_url` is written by two clients into two
 * different buckets. Recovering the bucket from the URL, rather than assuming
 * one, is what keeps an iOS-uploaded photo from being quietly exempt from the
 * whole story.
 */
describe('storageRefFromPublicUrl', () => {
  it('recovers a web upload from profile-pictures', () => {
    expect(
      storageRefFromPublicUrl(
        'https://abc.supabase.co/storage/v1/object/public/profile-pictures/user-1/a.jpg',
      ),
    ).toEqual({ bucket: 'profile-pictures', path: 'user-1/a.jpg' });
  });

  it('recovers an iOS upload from the images bucket', () => {
    expect(
      storageRefFromPublicUrl(
        'https://abc.supabase.co/storage/v1/object/public/images/kids/2f8c.jpg',
      ),
    ).toEqual({ bucket: 'images', path: 'kids/2f8c.jpg' });
  });

  it('declines a bucket it was not asked about', () => {
    expect(
      storageRefFromPublicUrl(
        'https://abc.supabase.co/storage/v1/object/public/blog-media/hero.jpg',
      ),
    ).toBeNull();
  });

  it('declines a just-picked file preview and an empty column', () => {
    expect(storageRefFromPublicUrl('blob:http://localhost/x')).toBeNull();
    expect(storageRefFromPublicUrl('data:image/png;base64,AAAA')).toBeNull();
    expect(storageRefFromPublicUrl('')).toBeNull();
    expect(storageRefFromPublicUrl(null)).toBeNull();
  });

  it('honours an explicit bucket list', () => {
    const iosUrl = 'https://abc.supabase.co/storage/v1/object/public/images/kids/2f8c.jpg';
    expect(storageRefFromPublicUrl(iosUrl, ['profile-pictures'])).toBeNull();
    expect(storageRefFromPublicUrl(iosUrl, ['images'])?.bucket).toBe('images');
  });

  it('strips a query string the stored value picked up', () => {
    expect(
      storageRefFromPublicUrl(
        'https://abc.supabase.co/storage/v1/object/public/images/kids/2f8c.jpg?t=1',
      )?.path,
    ).toBe('kids/2f8c.jpg');
  });
});

describe('retryDelayFor', () => {
  it('walks the backoff and then stops', () => {
    expect(retryDelayFor(1)).toBe(5_000);
    expect(retryDelayFor(2)).toBe(15_000);
    expect(retryDelayFor(3)).toBe(45_000);
    expect(retryDelayFor(4)).toBe(120_000);
    // null, not a number: the caller has to decide to stop rather than
    // defaulting to some delay and retrying forever.
    expect(retryDelayFor(5)).toBeNull();
    expect(retryDelayFor(99)).toBeNull();
  });

  it('treats a nonsense attempt number as the first retry', () => {
    expect(retryDelayFor(0)).toBe(5_000);
    expect(retryDelayFor(-3)).toBe(5_000);
  });
});
