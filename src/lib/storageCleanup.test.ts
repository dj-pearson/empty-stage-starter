import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

const removeCalls: { bucket: string; paths: string[] }[] = [];
let removeError: { message: string } | null = null;
let removeThrows = false;

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    storage: {
      from: (bucket: string) => ({
        remove: async (paths: string[]) => {
          if (removeThrows) throw new Error('network down');
          removeCalls.push({ bucket, paths });
          return { data: null, error: removeError };
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
