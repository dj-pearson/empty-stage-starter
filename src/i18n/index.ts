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

export const DEFAULT_LANGUAGE = 'en';
export const SUPPORTED_LANGUAGES = ['en'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

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
