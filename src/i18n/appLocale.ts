/**
 * Page-scoped English copy, registered on first import.
 *
 * The planner, recipes, grocery and pantry screens carry far more copy than the
 * first paint needs, and en.json is in the entry chunk. So that copy lives in
 * locales/app/*.json and is added to the i18next singleton here. Every
 * component that renders one of those keys imports this module for its side
 * effect; ES module order then guarantees the bundle is registered before the
 * component's own module body runs, whichever chunk loads first. Rollup puts
 * this module and its JSON in a shared lazy chunk.
 *
 * Each fragment is a nested tree rooted at its namespace, so parallel work
 * never edits the same file. keyCoverage.test.ts fails on any leaf that
 * collides with en.json or with another fragment.
 */
import i18n from './index';
import en from './locales/en.json';

type LocaleTree = { [key: string]: string | LocaleTree };

const fragmentModules = import.meta.glob<LocaleTree>('./locales/app/*.json', {
  eager: true,
  import: 'default',
});

/** Sorted by path so a collision resolves the same way on every build. */
export const enFragments: ReadonlyArray<{ path: string; tree: LocaleTree }> = Object.keys(fragmentModules)
  .sort()
  .map((path) => ({ path, tree: fragmentModules[path] }));

const isTree = (value: unknown): value is LocaleTree =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Deep-merge `source` into a copy of `target`. Leaves in `source` win. */
export function mergeLocaleTrees(target: LocaleTree, source: LocaleTree): LocaleTree {
  const out: LocaleTree = { ...target };
  for (const [key, value] of Object.entries(source)) {
    const existing = out[key];
    out[key] = isTree(existing) && isTree(value) ? mergeLocaleTrees(existing, value) : value;
  }
  return out;
}

/** Leaf paths in `fragment` that `base` already defines (as a leaf or a branch). */
export function findLeafCollisions(base: LocaleTree, fragment: LocaleTree, prefix = ''): string[] {
  const hits: string[] = [];
  for (const [key, value] of Object.entries(fragment)) {
    const path = `${prefix}${key}`;
    const existing = base[key];
    if (existing === undefined) continue;
    if (isTree(existing) && isTree(value)) hits.push(...findLeafCollisions(existing, value, `${path}.`));
    else hits.push(path);
  }
  return hits;
}

/** All page fragments merged, without en.json. */
export const appTranslation: LocaleTree = enFragments.reduce<LocaleTree>(
  (acc, { tree }) => mergeLocaleTrees(acc, tree),
  {},
);

/** en.json plus every fragment: the full English resource once registered. */
export const enTranslation: LocaleTree = mergeLocaleTrees(en as LocaleTree, appTranslation);

// deep=true merges into en.json's existing namespaces; overwrite=false keeps
// en.json authoritative for any key both define.
i18n.addResourceBundle('en', 'translation', appTranslation, true, false);
