import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseStorageObjectUrl } from '@/lib/storagePaths';

/**
 * Deleting a child's photo deletes it on the platform the photo came from
 * (US-644).
 *
 * The web has done this correctly since US-628. iOS is where the production
 * kid photos are taken, and it had a parser that matched one hardcoded marker,
 * `/object/public/images/`. Four consequences, all silent -- the parser
 * returns nil or a path matching nothing, `remove()` succeeds having removed
 * nothing, and the object stays at a public URL after the parent deleted the
 * child:
 *
 *   1. it could only delete from `images`, never `profile-pictures`
 *   2. it ignored signed URLs, which is the shape US-634 moves to
 *   3. it stripped `?` but not `#`, the bug the web already documented
 *   4. it never decoded percent-escapes
 *
 * The Swift suite covers the parser against Swift. What it cannot see is this
 * file drifting from it, so the two are compared here -- the same arrangement
 * as `ladderOfflineParity.test.ts`.
 */

const ROOT = path.resolve(__dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(path.join(ROOT, 'ios', 'EatPal', ...parts), 'utf8');

const SWIFT = read('EatPal', 'Services', 'StorageObjectURL.swift');
const UPLOAD = read('EatPal', 'Services', 'ImageUploadService.swift');
const APP_STATE = read('EatPal', 'App', 'AppState.swift');

describe('storage cleanup parity (US-644)', () => {
  it('recognises the same two URL shapes on both clients', () => {
    expect(parseStorageObjectUrl('https://h/storage/v1/object/public/images/a/b.jpg')).toEqual({
      bucket: 'images',
      path: 'a/b.jpg',
    });
    expect(parseStorageObjectUrl('https://h/storage/v1/object/sign/p-p/a/b.jpg?token=x')).toEqual({
      bucket: 'p-p',
      path: 'a/b.jpg',
    });

    expect(SWIFT).toContain('"/storage/v1/object/public/"');
    expect(SWIFT).toContain('"/storage/v1/object/sign/"');
  });

  it('takes the bucket from the URL rather than assuming one', () => {
    // The whole of failure 1. Web writes kid photos to profile-pictures and
    // iOS writes to images, so a hardcoded bucket means each platform silently
    // skips the other's photos.
    expect(SWIFT).toContain('let bucket = String(withoutQuery[withoutQuery.startIndex..<separator])');
    expect(UPLOAD, 'the delete still assumes a single bucket').toContain('.from(ref.bucket)');
    expect(UPLOAD, 'the bucket-hardcoded parser is still here').not.toContain(
      'objectPath(fromPublicURL:',
    );
  });

  it('strips a fragment as well as a query, on both clients', () => {
    // Failure 3, and the one the web hit in production: remove() called with
    // "a/b.jpg#top" matches nothing.
    expect(parseStorageObjectUrl('https://h/storage/v1/object/public/images/a/b.jpg#top')?.path).toBe(
      'a/b.jpg',
    );
    expect(SWIFT).toContain(`prefix { $0 != "?" && $0 != "#" }`);
  });

  it('decodes percent-escapes and survives a malformed one', () => {
    // Failure 4, plus the unhandled rejection the web hit: a stray % threw out
    // of decodeURIComponent during the kid save flow.
    expect(parseStorageObjectUrl('https://h/storage/v1/object/public/images/a/my%20p.jpg')?.path).toBe(
      'a/my p.jpg',
    );
    expect(parseStorageObjectUrl('https://h/storage/v1/object/public/images/a/a%zz.jpg')?.path).toBe(
      'a/a%zz.jpg',
    );
    expect(SWIFT).toContain('path.removingPercentEncoding ?? path');
  });

  it('refuses traversal on both clients', () => {
    expect(
      parseStorageObjectUrl('https://h/storage/v1/object/public/images/../p-p/a/b.jpg'),
    ).toBeNull();
    expect(SWIFT).toContain('guard !path.contains("..") else { return nil }');
  });

  it('treats a removal that removed nothing as a failure, not a success', () => {
    // AC7. storage.remove() answers with the objects it actually removed, so a
    // row RLS hides is simply absent -- and a non-throwing call reports a
    // deletion that did not happen.
    expect(UPLOAD).toContain('if removed.isEmpty');
    expect(UPLOAD).toContain('image_delete_orphan');
    // The web's equivalent, so the two stay the same shape.
    const cleanup = readFileSync(path.join(ROOT, 'src', 'lib', 'storageCleanup.ts'), 'utf8');
    expect(cleanup).toContain('Array.isArray(data) && data.length === 0');
  });

  it('cleans up on delete as well as on replace', () => {
    // deleteKid already did this; deleteRecipe left its uploaded image in the
    // bucket forever.
    for (const fn of ['func deleteKid(', 'func deleteRecipe(']) {
      const start = APP_STATE.indexOf(fn);
      expect(start, `${fn} not found`).toBeGreaterThan(-1);
      const body = APP_STATE.slice(start, APP_STATE.indexOf('\n    }', start));
      expect(body, `${fn} does not clean up its storage object`).toContain(
        'ImageUploadService.deletePublicURL(',
      );
    }
  });

  it('cleans up the object a replace orphans', () => {
    // AC2 and AC4: the upload writes a new random name (US-635), so without
    // this the previous object stays at the URL it was handed out under.
    for (const rel of [
      ['EatPal', 'Views', 'Kids', 'KidProfileEditorView.swift'],
      ['EatPal', 'Views', 'Recipes', 'EditRecipeView.swift'],
    ] as const) {
      expect(read(...rel)).toContain('ImageUploadService.deletePublicURL(');
    }
  });
});
