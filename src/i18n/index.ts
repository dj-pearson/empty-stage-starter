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

export const resources = {
  en: { translation: en },
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
