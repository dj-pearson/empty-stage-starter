import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A replaced or deleted photo has to leave storage, not just the row.
 *
 * US-635 made uploads use a random object name so a child's profile picture
 * could not be found by guessing `{id}-{unixSeconds}`. That closed the
 * guessing route but not the retention one: `ImageUploadService.delete` had no
 * callers at all, so replacing a photo uploaded a new object and left the old
 * one in place, and deleting a child left theirs behind entirely.
 *
 * The bucket is public-read by URL. So a picture a parent had replaced, or a
 * child whose profile they had deleted, stayed fetchable by anyone holding the
 * link, with nothing in the system that was ever going to remove it.
 *
 * Deletion runs after the row already points at the new value, so a failure
 * leaves an orphan rather than breaking a save that succeeded.
 */

const ROOT = path.resolve(__dirname, '../..');
const read = (relative: string) => readFileSync(path.join(ROOT, relative), 'utf8');

const SERVICE = read('ios/EatPal/EatPal/Services/ImageUploadService.swift');
const KID_EDITOR = read('ios/EatPal/EatPal/Views/Kids/KidProfileEditorView.swift');
const RECIPE_EDITOR = read('ios/EatPal/EatPal/Views/Recipes/EditRecipeView.swift');
const APP_STATE = read('ios/EatPal/EatPal/App/AppState.swift');

/** Order of two markers within a slice of source. */
function comesBefore(source: string, first: string, second: string): boolean {
  const a = source.indexOf(first);
  const b = source.indexOf(second);
  expect(a, `${first} not found`).toBeGreaterThan(-1);
  expect(b, `${second} not found`).toBeGreaterThan(-1);
  return a < b;
}

describe('image orphans', () => {
  it('is worth checking: the bucket is public-read by URL', () => {
    // Floor. If storage ever becomes signed-URL only, the retention problem
    // is a cost problem rather than an exposure one.
    expect(SERVICE).toContain('getPublicURL');
  });

  it('can delete by the URL it handed out', () => {
    expect(SERVICE).toContain('func deletePublicURL(');
    expect(SERVICE).toContain('func objectPath(fromPublicURL');
  });

  it('ignores URLs that are not ours', () => {
    // Recipes can carry an image imported from another site; that must never
    // become a delete attempt.
    const fn = SERVICE.slice(SERVICE.indexOf('static func objectPath(fromPublicURL'));
    const body = fn.slice(0, fn.indexOf('\n}'));
    expect(body).toContain('/object/public/\\(bucketName)/');
    expect(body).toContain('return nil');
  });

  it('removes the old photo after a child profile is saved', () => {
    // After the update, not before: deleting first would destroy the photo if
    // the save then failed.
    expect(KID_EDITOR).toContain('previousPhotoURL');
    expect(KID_EDITOR).toContain('ImageUploadService.deletePublicURL(previousPhotoURL)');
    expect(
      comesBefore(KID_EDITOR, 'appState.updateKid(', 'deletePublicURL(previousPhotoURL)'),
    ).toBe(true);
  });

  it('removes the old image after a recipe is saved', () => {
    expect(RECIPE_EDITOR).toContain('ImageUploadService.deletePublicURL(previousImageURL)');
    expect(
      comesBefore(
        RECIPE_EDITOR,
        'appState.updateRecipeWithIngredients(',
        'deletePublicURL(previousImageURL)',
      ),
    ).toBe(true);
  });

  it('removes the photo when the child is deleted', () => {
    const fn = APP_STATE.slice(APP_STATE.indexOf('func deleteKid('));
    const body = fn.slice(0, fn.indexOf('\n    // MARK: - Recipe Operations'));
    expect(body).toContain('ImageUploadService.deletePublicURL(photo)');
    expect(comesBefore(body, 'dataService.deleteKid(', 'deletePublicURL(photo)')).toBe(true);
  });

  it('never fails a save over a failed cleanup', () => {
    const fn = SERVICE.slice(SERVICE.indexOf('static func deletePublicURL('));
    const body = fn.slice(0, fn.indexOf('\n    /// Extracts the storage object path'));
    expect(body).toContain('SentryService.capture');
    expect(body).not.toContain('throw');
  });
});
