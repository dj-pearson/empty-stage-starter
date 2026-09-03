import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import {
  buildIdFromAssets,
  collectAssetFiles,
  stampServiceWorker,
  SW_BUILD_ID_PLACEHOLDER,
} from '../../scripts/build/stamp-sw.mjs';

/**
 * The service worker's cache name changes when the build does (US-765).
 *
 * sw.js lives in public/, which Vite copies verbatim, so nothing in the normal
 * build pipeline can vary its contents. With a hardcoded `tryeatpal-v1` the
 * activate handler found no old cache to delete on any deploy and a returning
 * visitor kept being served the previous build's JS out of a cache-first
 * strategy -- the classic "users are on a version that no longer exists" bug,
 * invisible to everyone testing in a fresh profile.
 *
 * These assertions cover the three ways that regresses: the placeholder is
 * removed from the source, the stamping step is dropped from the build, or the
 * id stops depending on the built output.
 */

const root = process.cwd();
const swSource = readFileSync(path.join(root, 'public', 'sw.js'), 'utf8');

describe('buildIdFromAssets', () => {
  it('is stable for the same asset set regardless of read order', () => {
    const a = buildIdFromAssets(['index-a1b2.js', 'vendor-c3d4.js', 'index-e5f6.css']);
    const b = buildIdFromAssets(['index-e5f6.css', 'index-a1b2.js', 'vendor-c3d4.js']);
    expect(a).toBe(b);
  });

  it('changes when a content-hashed asset name changes', () => {
    const before = buildIdFromAssets(['index-a1b2.js', 'vendor-c3d4.js']);
    const after = buildIdFromAssets(['index-9999.js', 'vendor-c3d4.js']);
    expect(after).not.toBe(before);
  });

  it('is short hex, so it is legible in a cache name', () => {
    expect(buildIdFromAssets(['index-a1b2.js'])).toMatch(/^[a-f0-9]{12}$/);
  });
});

describe('collectAssetFiles', () => {
  /**
   * Regression: the first version of this script hashed
   * readdirSync('dist/assets') directly. Vite writes dist/assets/{js,css,fonts}/,
   * so that returned exactly ["css","fonts","js"] -- three directory names
   * identical in every build ever produced. The build id was therefore a
   * constant, the service worker cache name never changed, and the stamping
   * accomplished nothing while looking like it worked.
   *
   * It shipped that way. The unit tests above passed because they fed
   * buildIdFromAssets a flat list of filenames by hand and never exercised the
   * directory walk the CLI actually used. Caught by rebuilding after a source
   * change and noticing the id had not moved.
   */
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'sw-assets-'));
    mkdirSync(path.join(dir, 'js'), { recursive: true });
    mkdirSync(path.join(dir, 'css'), { recursive: true });
    writeFileSync(path.join(dir, 'js', 'index-a1b2.js'), '');
    writeFileSync(path.join(dir, 'css', 'index-c3d4.css'), '');
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('finds files nested under the asset subdirectories', () => {
    expect(collectAssetFiles(dir).sort()).toEqual(['css/index-c3d4.css', 'js/index-a1b2.js']);
  });

  it('returns paths, not the bare directory names the bug hashed', () => {
    expect(collectAssetFiles(dir)).not.toContain('js');
    expect(collectAssetFiles(dir)).not.toContain('css');
  });

  it('changes the build id when a nested asset hash changes', () => {
    const before = buildIdFromAssets(collectAssetFiles(dir));
    rmSync(path.join(dir, 'js', 'index-a1b2.js'));
    writeFileSync(path.join(dir, 'js', 'index-9999.js'), '');
    const after = buildIdFromAssets(collectAssetFiles(dir));
    // The broken version produced the same id here, which is the whole defect.
    expect(after).not.toBe(before);
  });

  it('uses / separators so the id does not differ by platform', () => {
    expect(collectAssetFiles(dir).every((f) => !f.includes('\\'))).toBe(true);
  });
});

describe('stampServiceWorker', () => {
  it('replaces the placeholder with the build id', () => {
    const out = stampServiceWorker(`const SW_BUILD_ID = '${SW_BUILD_ID_PLACEHOLDER}';`, 'abc123def456');
    expect(out).toBe("const SW_BUILD_ID = 'abc123def456';");
    expect(out).not.toContain(SW_BUILD_ID_PLACEHOLDER);
  });

  it('throws when the placeholder is gone, rather than shipping an unstamped worker', () => {
    // A silent no-op here is indistinguishable from a working build until
    // users report a stale bundle, so the build must fail instead.
    expect(() => stampServiceWorker("const SW_BUILD_ID = 'v1';", 'abc123def456')).toThrow(
      /not found/
    );
  });

  it('refuses a build id that is not a hex digest', () => {
    expect(() =>
      stampServiceWorker(`'${SW_BUILD_ID_PLACEHOLDER}'`, '../../etc/passwd')
    ).toThrow(/non-hex/);
  });
});

describe('public/sw.js is stampable and self-consistent', () => {
  it('carries the placeholder', () => {
    expect(swSource).toContain(SW_BUILD_ID_PLACEHOLDER);
  });

  it('derives the cache name from the build id', () => {
    expect(swSource).toContain("const CACHE_NAME = 'tryeatpal-' + SW_BUILD_ID");
  });

  it('produces a distinct cache name per build', () => {
    const one = stampServiceWorker(swSource, buildIdFromAssets(['index-a1b2.js']));
    const two = stampServiceWorker(swSource, buildIdFromAssets(['index-9999.js']));
    const nameOf = (src: string) => src.match(/const SW_BUILD_ID = '([a-f0-9]+)'/)?.[1];
    expect(nameOf(one)).toBeDefined();
    expect(nameOf(one)).not.toBe(nameOf(two));
  });

  it('keeps the share-target cache out of the activate sweep', () => {
    // The previous cleanup deleted every cache whose name differed from
    // CACHE_NAME, which included share-target-cache -- so a share arriving
    // while a new worker activated was deleted before ShareTarget could read
    // it. Versioned cache names would have made that fire on every deploy.
    expect(swSource).toContain('const KEEP = new Set([CACHE_NAME, SHARE_CACHE]);');
    expect(swSource).toContain('!KEEP.has(cacheName)');
  });

  it('declares SHARE_CACHE exactly once', () => {
    expect(swSource.match(/const SHARE_CACHE =/g)).toHaveLength(1);
  });
});

describe('the build runs the stamping step', () => {
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));

  it('stamps in npm run build', () => {
    expect(pkg.scripts.build).toContain('scripts/build/stamp-sw.mjs');
  });

  it('stamps after vite build, which is what writes dist/assets', () => {
    const build: string = pkg.scripts.build;
    expect(build.indexOf('vite build')).toBeLessThan(build.indexOf('scripts/build/stamp-sw.mjs'));
  });
});

describe('the service worker is actually registered', () => {
  it('main.tsx calls registerServiceWorker', () => {
    // The whole of US-765: sw.js and registerServiceWorker were both complete
    // and nothing called the latter, so every line above was dead.
    const main = readFileSync(path.join(root, 'src', 'main.tsx'), 'utf8');
    expect(main).toContain('registerServiceWorker()');
    expect(main).toContain('import.meta.env.PROD');
  });
});
