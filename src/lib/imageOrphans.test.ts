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
const PARSER = read('ios/EatPal/EatPal/Services/StorageObjectURL.swift');
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
    // US-644 moved the parsing into StorageObjectURL, because the version that
    // lived here matched one hardcoded marker and so could only ever delete
    // from `images`. The property is unchanged; the guard follows the code.
    expect(SERVICE).toContain('func deletePublicURL(');
    expect(SERVICE).toContain('StorageObjectURL.parse(urlString)');
    expect(PARSER).toContain('static func parse(_ urlString: String?) -> StorageObjectRef?');
  });

  it('ignores URLs that are not ours', () => {
    // Recipes can carry an image imported from another site; that must never
    // become a delete attempt.
    const fn = PARSER.slice(PARSER.indexOf('static func parse('));
    const body = fn.slice(0, fn.indexOf('\n    }'));
    expect(body).toContain('return nil');
    // Both markers, so a signed URL is recognised rather than skipped (US-634
    // moves profile pictures to a private bucket).
    expect(PARSER).toContain('/storage/v1/object/public/');
    expect(PARSER).toContain('/storage/v1/object/sign/');
    // And a stored URL is user input by the time it comes back out of the DB.
    expect(PARSER).toContain('guard !path.contains("..") else { return nil }');
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
    // Cleanup runs after the row already points at the new value, so a failure
    // here leaves an orphan rather than breaking a save that succeeded.
    const start = SERVICE.indexOf('static func deletePublicURL(');
    expect(start, 'deletePublicURL not found').toBeGreaterThan(-1);
    const rest = SERVICE.slice(start);
    // Ends at the next declaration, whatever that happens to be -- an anchor
    // on one particular neighbouring comment is how this silently came to
    // cover the whole rest of the file.
    const end = rest.slice(1).search(/\n {4}(static func|\/\/\/ )/);
    const body = rest.slice(0, end === -1 ? undefined : end + 1);

    // Comments stripped first: the body explains that a non-throwing call is
    // not the same as a successful delete, and the word "non-throwing"
    // contains the one being searched for. A guard has to read the code, not
    // the commentary about it.
    const code = body
      .split('\n')
      .map((line) => line.replace(/\s*\/\/.*$/, ''))
      .join('\n');

    expect(body).toContain('SentryService.capture');
    expect(code, 'a failed cleanup now throws out at the caller').not.toContain('throw');
  });

  it('does not report a removal that removed nothing as a success', () => {
    // US-644 AC7. storage.remove() answers with the objects it actually
    // removed, so a row RLS hides is simply absent from that list -- and a
    // non-throwing call reports a deletion that did not happen. This is the
    // failure mode the whole file exists to prevent, arriving through the
    // success path instead of the error one.
    expect(SERVICE).toContain('if removed.isEmpty');
    expect(SERVICE).toContain('image_delete_orphan');
  });

  it('removes the image when the recipe is deleted', () => {
    // deleteKid had this; deleteRecipe did not, so a deleted recipe left its
    // uploaded image in the bucket forever.
    const fn = APP_STATE.slice(APP_STATE.indexOf('func deleteRecipe('));
    const body = fn.slice(0, fn.indexOf('\n    }'));
    expect(body).toContain('ImageUploadService.deletePublicURL(');
    expect(comesBefore(body, 'dataService.deleteRecipe(', 'deletePublicURL(')).toBe(true);
  });
});
