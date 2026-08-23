import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

const captured: { message: string; tags: Record<string, string> }[] = [];
vi.mock('@sentry/react', () => ({
  captureException: (e: Error, opts: { tags: Record<string, string> }) => {
    captured.push({ message: e.message, tags: opts.tags });
  },
}));

const removeCalls: { bucket: string; paths: string[] }[] = [];
let removeError: { message: string } | null = null;
let removeThrows = false;
/**
 * What storage.remove() hands back on success: the objects it actually removed.
 * The original stub returned `data: null` here, which no real call ever does,
 * and that is why the RLS-denied case went unnoticed for so long -- the test
 * could not tell "removed one object" apart from "removed nothing", because
 * neither shape reached the assertion.
 */
let removeData: Array<{ name: string }> | null = [{ name: 'removed' }];

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    storage: {
      from: (bucket: string) => ({
        remove: async (paths: string[]) => {
          if (removeThrows) throw new Error('network down');
          removeCalls.push({ bucket, paths });
          return { data: removeData, error: removeError };
        },
      }),
    },
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const { deleteStorageObject, deleteReplacedStorageObject } = await import('./storageCleanup');

const BASE = 'https://abc123.supabase.co/storage/v1/object/public';

beforeEach(() => {
  removeCalls.length = 0;
  removeError = null;
  removeThrows = false;
  removeData = [{ name: 'removed' }];
  captured.length = 0;
  vi.stubEnv('VITE_SENTRY_ENABLED', 'true');
});

describe('deleteStorageObject', () => {
  it('removes the object named by a public URL', async () => {
    const removed = await deleteStorageObject(`${BASE}/profile-pictures/user-1/photo.jpg`);

    expect(removed).toBe(true);
    expect(removeCalls).toEqual([{ bucket: 'profile-pictures', paths: ['user-1/photo.jpg'] }]);
  });

  it('routes an iOS photo to the images bucket', async () => {
    await deleteStorageObject(`${BASE}/images/kids/kid-7-1737000000.jpg`);

    expect(removeCalls[0].bucket).toBe('images');
    expect(removeCalls[0].paths).toEqual(['kids/kid-7-1737000000.jpg']);
  });

  it('does nothing when there is no photo', async () => {
    expect(await deleteStorageObject(null)).toBe(false);
    expect(await deleteStorageObject('')).toBe(false);
    expect(removeCalls).toEqual([]);
  });

  it('reports failure when RLS hid the row, which Supabase calls success', async () => {
    // The real shape of an RLS-denied removal: no error, and an empty list.
    // Before US-634's parity migration this was the live behaviour for a
    // profile-pictures object owned by the caller but stored outside their
    // folder -- readable by them, undeletable by them, reported as deleted.
    removeData = [];

    const removed = await deleteStorageObject(`${BASE}/profile-pictures/legacy-photo.jpg`);

    expect(removed).toBe(false);
    // The call still went out; the point is what we conclude from the answer.
    expect(removeCalls).toEqual([{ bucket: 'profile-pictures', paths: ['legacy-photo.jpg'] }]);
  });

  /**
   * The round-6 fix returned false and logged a warning, and that was called
   * "loud". It was not: every caller discards the boolean, and logger.warn
   * reaches console.warn and nothing else. An orphaned child photo is a
   * Privacy Policy problem, so it has to leave the browser.
   */
  it('reports an RLS-denied removal to Sentry, not just the console', async () => {
    removeData = [];

    await deleteStorageObject(`${BASE}/profile-pictures/legacy-photo.jpg`);

    expect(captured).toHaveLength(1);
    expect(captured[0].message).toContain('RLS denied it');
    expect(captured[0].tags).toEqual({ type: 'storage_orphan' });
  });

  it('reports a storage API error the same way', async () => {
    removeError = { message: 'boom' };

    await deleteStorageObject(`${BASE}/profile-pictures/user-1/photo.jpg`);

    expect(captured).toHaveLength(1);
    expect(captured[0].tags).toEqual({ type: 'storage_orphan' });
  });

  it('says nothing when the object really was removed', async () => {
    await deleteStorageObject(`${BASE}/profile-pictures/user-1/photo.jpg`);
    expect(captured).toEqual([]);
  });

  it('leaves a non-storage URL alone', async () => {
    expect(await deleteStorageObject('https://gravatar.com/avatar/abc.jpg')).toBe(false);
    expect(removeCalls).toEqual([]);
  });

  it('reports failure without throwing when storage errors', async () => {
    removeError = { message: 'object not found' };

    await expect(deleteStorageObject(`${BASE}/profile-pictures/u/p.jpg`)).resolves.toBe(false);
  });

  it('swallows a thrown transport error', async () => {
    removeThrows = true;

    await expect(deleteStorageObject(`${BASE}/profile-pictures/u/p.jpg`)).resolves.toBe(false);
  });
});

describe('deleteReplacedStorageObject', () => {
  it('removes the photo being replaced', async () => {
    const removed = await deleteReplacedStorageObject(
      `${BASE}/profile-pictures/u/old.jpg`,
      `${BASE}/profile-pictures/u/new.jpg`
    );

    expect(removed).toBe(true);
    expect(removeCalls[0].paths).toEqual(['u/old.jpg']);
  });

  it('keeps the live photo when the URL is unchanged', async () => {
    const same = `${BASE}/profile-pictures/u/photo.jpg`;

    expect(await deleteReplacedStorageObject(same, same)).toBe(false);
    expect(removeCalls).toEqual([]);
  });

  it('does nothing when there was no previous photo', async () => {
    expect(await deleteReplacedStorageObject(null, `${BASE}/profile-pictures/u/new.jpg`)).toBe(
      false
    );
    expect(removeCalls).toEqual([]);
  });
});

/**
 * The delete-account handler is Deno and cannot be imported here, so this is a
 * structural guard rather than a behavioural test: it asserts the storage
 * cleanup step is still wired in and still runs before the auth user is
 * removed. End-to-end coverage (upload, delete account, confirm the object is
 * gone) needs an integration harness the repo does not have yet.
 */
describe('delete-account storage cleanup', () => {
  const source = readFileSync(
    path.resolve(__dirname, '../../supabase/functions/delete-account/index.ts'),
    'utf-8'
  );

  it('reads kid photo URLs before the rows are deleted', () => {
    const lookupAt = source.indexOf('profile_picture_url');
    const scrubAt = source.indexOf('for (const table of USER_SCOPED_TABLES)');

    expect(lookupAt).toBeGreaterThan(-1);
    expect(lookupAt).toBeLessThan(scrubAt);
  });

  it('removes storage objects before deleting the auth user', () => {
    const removeAt = source.indexOf('.remove(paths)');
    const deleteUserAt = source.indexOf('auth.admin.deleteUser');

    expect(removeAt).toBeGreaterThan(-1);
    expect(removeAt).toBeLessThan(deleteUserAt);
  });

  it('sweeps the user folder so orphaned uploads go too', () => {
    expect(source).toMatch(/\.from\(USER_FOLDER_BUCKET\)\s*\.list\(userId\)/);
  });

  it('records storage failures instead of failing the account delete', () => {
    expect(source).toMatch(/failures\[`storage:/);
    // No throw between the storage block and the auth delete.
    const storageBlock = source.slice(
      source.indexOf('// 2c.'),
      source.indexOf('auth.admin.deleteUser')
    );
    expect(storageBlock).not.toMatch(/\bthrow\b/);
  });
});
