/**
 * i18n scaffolding (US-347).
 *
 * Localization framework for the web app. Today only `en` exists; the point is
 * to have the plumbing so future languages are a resource file away, and so new
 * user-facing strings are added as keys rather than hardcoded literals.
 *
 * Usage in a component:
 *   import { useTranslation } from 'react-i18next';
 *   const { t } = useTranslation();
 *   <h1>{t('onboarding.welcomeTitle')}</h1>
 *
 * Number/date formatting: prefer Intl.* (or i18next's interpolation.format) so
 * locale switches also localize formatting, not just copy.
 *
 * Import this module once at the app root (src/App.tsx) before anything calls
 * useTranslation — it initializes the singleton.
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import { DEFAULT_SEO_LOCALE, SEO_LOCALES } from '@/lib/seo-config';

/**
 * US-652: the language list is SEO_LOCALES in src/lib/seo-config.ts, not a
 * second list here. Adding a locale file without an hreflang entry was the
 * failure mode worth designing out, so the two cannot be edited independently.
 */
export const DEFAULT_LANGUAGE = DEFAULT_SEO_LOCALE.lang;
export const SUPPORTED_LANGUAGES = SEO_LOCALES.map((locale) => locale.lang);
export type SupportedLanguage = string;

/**
 * Grocery packages keep their copy in their own locale fragments
 * (en.grocery-row.json, en.grocery-input.json, en.grocery-lists.json), each a
 * nested object rooted at "grocery", so parallel work never edits en.json at
 * the same time. They are deep-merged under en.json here.
 *
 * import.meta.glob rather than three static imports: a fragment that does not
 * exist yet is an empty match instead of a build failure. The order is fixed
 * (sorted by path) so a collision resolves the same way on every build, and
 * keyCoverage.test.ts fails on any collision anyway.
 */
type LocaleTree = { [key: string]: string | LocaleTree };

const fragmentModules = import.meta.glob<LocaleTree>('./locales/en.*.json', {
  eager: true,
  import: 'default',
});

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

export const enTranslation: LocaleTree = enFragments.reduce(
  (acc, { tree }) => mergeLocaleTrees(acc, tree),
  en as LocaleTree,
);

export const resources = {
  en: { translation: enTranslation },
} as const;

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources,
    lng: DEFAULT_LANGUAGE,
    fallbackLng: DEFAULT_LANGUAGE,
    defaultNS: 'translation',
    interpolation: {
      // React already escapes against XSS.
      escapeValue: false,
    },
    returnNull: false,
  });
}

export default i18n;
