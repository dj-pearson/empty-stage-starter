import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';
import ts from 'typescript';

/**
 * Every kid photo renders through the signing wrappers (US-634).
 *
 * AC3 is the Release N half: reads go through a signed URL while writes keep
 * putting the public URL in `kids.profile_picture_url`, so a shipped iOS build
 * carries on working. AC4 is the half that flips `profile-pictures` to
 * `public = false`, and on that day every render site that still hands a raw
 * stored URL to an `<img>` shows a broken image of somebody's child.
 *
 * AC3 is adopted today: `KidAvatarImage` and `KidPhoto` are the two wrappers,
 * and every call site uses one. Nothing held it there. A new component with
 * `<AvatarImage src={kid.profile_picture_url} />` in it reads correctly, passes
 * review, and breaks months later when a migration nobody is looking at lands
 * -- the failure and its cause separated by a release, which is the shape of
 * bug this file exists to prevent.
 *
 * Parsed rather than grepped: the attribute has to be `src` specifically, and
 * the element it sits on decides whether it is fine. `src={kid.profile_picture_url}`
 * on a `<KidPhoto>` and the same text on an `<img>` differ only by the tag.
 */

const ROOT = path.resolve(__dirname, '..', '..');

/** The two wrappers that call useSignedProfilePicture. */
const SIGNING_WRAPPERS = new Set(['KidAvatarImage', 'KidPhoto']);

/**
 * A `src` expression mentioning one of these is a stored profile-picture URL.
 *
 * `profile_picture_url` is the column; `profilePictureUrl` is the camelCase
 * shape it takes once it has been through the DB-to-UI conversion.
 */
const STORED_PHOTO = /\bprofile_?[Pp]icture_?[Uu]rl\b/;

function tsxFiles(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === '.git') continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) tsxFiles(full, out);
    else if (entry.endsWith('.tsx') && !/\.test\.tsx$/.test(entry)) out.push(full);
  }
  return out;
}

const FILES = [
  ...tsxFiles(path.join(ROOT, 'src')),
  ...tsxFiles(path.join(ROOT, 'app')),
].map((f) => ({
  rel: path.relative(ROOT, f).split(path.sep).join('/'),
  body: readFileSync(f, 'utf8'),
}));

/** `<Tag src={...}>` sites whose src expression names a stored photo URL. */
function photoSrcSites(rel: string, body: string): { tag: string; line: number }[] {
  const source = ts.createSourceFile(rel, body, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
  const found: { tag: string; line: number }[] = [];

  const visit = (node: ts.Node) => {
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      const tag = node.tagName.getText(source);
      for (const attr of node.attributes.properties) {
        if (!ts.isJsxAttribute(attr)) continue;
        if (attr.name.getText(source) !== 'src') continue;
        const value = attr.initializer?.getText(source) ?? '';
        if (!STORED_PHOTO.test(value)) continue;
        found.push({
          tag,
          line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
        });
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(source);
  return found;
}

describe('kid photos render through the signing wrappers (US-634)', () => {
  it('finds the render sites at all, so a passing run means something', () => {
    const sites = FILES.flatMap((f) => photoSrcSites(f.rel, f.body));
    expect(
      sites.length,
      'no kid photo render site found -- the pattern or the tree moved',
    ).toBeGreaterThan(3);
  });

  it('hands no stored photo URL straight to an img or an AvatarImage', () => {
    const raw = FILES.flatMap((f) =>
      photoSrcSites(f.rel, f.body)
        // The wrappers themselves pass a SIGNED src to the element they render.
        .filter(() => !SIGNING_WRAPPERS.has(path.basename(f.rel, '.tsx')))
        .filter((s) => !SIGNING_WRAPPERS.has(s.tag))
        .map((s) => `${f.rel}:${s.line} <${s.tag} src={...}>`),
    ).sort();

    expect(
      raw,
      'These render a stored profile-picture URL directly. Use KidAvatarImage ' +
        '(for an Avatar) or KidPhoto (for a plain img) so the src is signed -- ' +
        'a raw URL breaks the moment US-634 AC4 makes the bucket private.',
    ).toEqual([]);
  });

  it('keeps both wrappers on the signing hook', () => {
    // The check above is only worth anything while the wrappers actually sign.
    for (const wrapper of SIGNING_WRAPPERS) {
      const file = FILES.find((f) => path.basename(f.rel, '.tsx') === wrapper);
      expect(file, `${wrapper} not found`).toBeDefined();
      expect(
        file!.body,
        `${wrapper} no longer calls useSignedProfilePicture, so it signs nothing`,
      ).toContain('useSignedProfilePicture');
    }
  });
});
