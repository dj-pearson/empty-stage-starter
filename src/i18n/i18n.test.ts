import { describe, it, expect } from 'vitest';
import i18n, { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from './index';

describe('i18n scaffolding (US-347)', () => {
  it('initializes synchronously with the en resource', () => {
    expect(i18n.isInitialized).toBe(true);
    expect(i18n.language).toBe(DEFAULT_LANGUAGE);
    expect(SUPPORTED_LANGUAGES).toContain('en');
  });

  it('resolves pilot keys (nav / auth / onboarding) to English copy', () => {
    expect(i18n.t('auth.signOut')).toBe('Sign Out');
    expect(i18n.t('nav.dashboard')).toBe('Dashboard');
    expect(i18n.t('onboarding.welcomeTitle')).toBe('Welcome to EatPal');
  });

  it('falls back to the key for an unknown id (no throw)', () => {
    expect(i18n.t('does.not.exist')).toBe('does.not.exist');
  });
});
