import { describe, it, expect } from 'vitest';
import { parseStorageObjectUrl } from './storagePaths';

const BASE = 'https://abc123.supabase.co';

describe('parseStorageObjectUrl', () => {
  it('parses a web profile photo URL', () => {
    expect(
      parseStorageObjectUrl(
        `${BASE}/storage/v1/object/public/profile-pictures/a1b2/c3d4-e5f6.jpg`
      )
    ).toEqual({ bucket: 'profile-pictures', path: 'a1b2/c3d4-e5f6.jpg' });
  });

  it('parses an iOS kid photo URL from the images bucket', () => {
    expect(
      parseStorageObjectUrl(`${BASE}/storage/v1/object/public/images/kids/kid-99-1737000000.jpg`)
    ).toEqual({ bucket: 'images', path: 'kids/kid-99-1737000000.jpg' });
  });

  it('strips a cache-busting query string', () => {
    expect(
      parseStorageObjectUrl(`${BASE}/storage/v1/object/public/profile-pictures/u/p.jpg?v=2`)?.path
    ).toBe('u/p.jpg');
  });

  it('handles signed URLs', () => {
    expect(
      parseStorageObjectUrl(`${BASE}/storage/v1/object/sign/profile-pictures/u/p.jpg?token=abc`)
    ).toEqual({ bucket: 'profile-pictures', path: 'u/p.jpg' });
  });

  it('decodes percent-encoded paths', () => {
    expect(
      parseStorageObjectUrl(`${BASE}/storage/v1/object/public/images/kids/my%20photo.jpg`)?.path
    ).toBe('kids/my photo.jpg');
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['empty', ''],
    ['a data URI', 'data:image/png;base64,AAAA'],
    ['an external avatar', 'https://gravatar.com/avatar/abc.jpg'],
    ['a bucket with no object path', `${BASE}/storage/v1/object/public/profile-pictures/`],
  ])('returns null for %s', (_label, input) => {
    expect(parseStorageObjectUrl(input as string | null | undefined)).toBeNull();
  });

  it('refuses path traversal', () => {
    expect(
      parseStorageObjectUrl(`${BASE}/storage/v1/object/public/profile-pictures/../../etc/passwd`)
    ).toBeNull();
  });
});

describe('parser hardening found by merging with the US-634 signer', () => {
  const BASE_URL = 'https://abc.supabase.co/storage/v1/object/public';

  it('drops a fragment, which remove() would otherwise be handed verbatim', () => {
    // "user-1/photo.jpg#top" matches no object, so the cleanup silently failed
    // and left the replaced photo behind -- a Privacy Policy problem, since the
    // promise is that deleting a child profile deletes the data.
    expect(parseStorageObjectUrl(`${BASE_URL}/profile-pictures/user-1/photo.jpg#top`)).toEqual({
      bucket: 'profile-pictures',
      path: 'user-1/photo.jpg',
    });
  });

  it('does not throw on a malformed percent escape', () => {
    // deleteStorageObject calls this BEFORE its try block and its callers use
    // `void deleteReplacedStorageObject(...)`, so a URIError here surfaced as an
    // unhandled rejection during the kid save flow rather than a logged failure.
    expect(() => parseStorageObjectUrl(`${BASE_URL}/images/kids/a%zz.jpg`)).not.toThrow();
    expect(parseStorageObjectUrl(`${BASE_URL}/images/kids/a%zz.jpg`)).toEqual({
      bucket: 'images',
      path: 'kids/a%zz.jpg',
    });
  });
});
