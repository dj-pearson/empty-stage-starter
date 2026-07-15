/**
 * Biometric (Face ID / Touch ID) quick-unlock for the Expo app.
 *
 * The app already persists the Supabase session in the iOS Keychain via
 * expo-secure-store, so a returning user is auto-signed-in. This module adds an
 * optional biometric gate in front of that resumed session: when the user opts
 * in (Profile → "Biometric Lock"), the app requires a successful Face ID /
 * Touch ID check on cold start before revealing any data.
 *
 * `expo-local-authentication` is imported dynamically with a graceful fallback,
 * matching the pattern used by notifications / secure-session, so the web
 * bundle and unlinked-module cases degrade to a no-op rather than throwing.
 *
 * The opt-in flag is stored under the SAME key Profile already uses
 * (`eatpal.profile.biometric` via safeStorage) so there is a single source of
 * truth for the preference.
 */

import { Platform } from 'react-native';
import { safeStorage } from '@/lib/platform';

/** Shared preference key — must match PREF_KEYS.biometric in profile.tsx. */
export const BIOMETRIC_PREF_KEY = 'eatpal.profile.biometric';

type LocalAuth = {
  hasHardwareAsync: () => Promise<boolean>;
  isEnrolledAsync: () => Promise<boolean>;
  supportedAuthenticationTypesAsync: () => Promise<number[]>;
  authenticateAsync: (opts: {
    promptMessage?: string;
    cancelLabel?: string;
    fallbackLabel?: string;
    disableDeviceFallback?: boolean;
  }) => Promise<{ success: boolean; error?: string; warning?: string }>;
  AuthenticationType: { FINGERPRINT: number; FACIAL_RECOGNITION: number; IRIS: number };
};

let cached: LocalAuth | null | undefined;

async function getModule(): Promise<LocalAuth | null> {
  if (Platform.OS === 'web') return null;
  if (cached !== undefined) return cached;
  cached = ((await import('expo-local-authentication').catch(() => null)) as unknown as LocalAuth) ?? null;
  return cached;
}

/**
 * True only when the device has biometric hardware AND the user has enrolled a
 * face/fingerprint. Enabling the toggle without enrollment would lock the user
 * out, so callers gate on this first.
 */
export async function isBiometricAvailable(): Promise<boolean> {
  const m = await getModule();
  if (!m) return false;
  try {
    const [hasHardware, isEnrolled] = await Promise.all([m.hasHardwareAsync(), m.isEnrolledAsync()]);
    return hasHardware && isEnrolled;
  } catch {
    return false;
  }
}

/**
 * Human-readable name for the device's biometric, for UI copy
 * ("Unlock with Face ID"). Falls back to a generic label.
 */
export async function getBiometricLabel(): Promise<string> {
  const m = await getModule();
  if (!m) return 'Biometrics';
  try {
    const types = await m.supportedAuthenticationTypesAsync();
    if (types.includes(m.AuthenticationType.FACIAL_RECOGNITION)) {
      return Platform.OS === 'ios' ? 'Face ID' : 'Face Unlock';
    }
    if (types.includes(m.AuthenticationType.FINGERPRINT)) {
      return Platform.OS === 'ios' ? 'Touch ID' : 'Fingerprint';
    }
    if (types.includes(m.AuthenticationType.IRIS)) return 'Iris';
    return 'Biometrics';
  } catch {
    return 'Biometrics';
  }
}

/**
 * Prompt for biometric authentication.
 *
 * Returns true on success. Returns true as a fail-open when the module isn't
 * available at all (web / unlinked) so the gate never permanently traps a user
 * on an unsupported platform — availability is always confirmed via
 * `isBiometricAvailable()` before the preference is turned on.
 *
 * `disableDeviceFallback` is false so the OS offers the device passcode after a
 * failed biometric read — that is the expected iOS unlock affordance.
 */
export async function authenticateBiometric(promptMessage = 'Unlock EatPal'): Promise<boolean> {
  const m = await getModule();
  if (!m) return true;
  try {
    const result = await m.authenticateAsync({
      promptMessage,
      fallbackLabel: 'Use passcode',
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
    });
    return result.success;
  } catch {
    return false;
  }
}

/** Whether the user has opted into biometric lock. */
export async function isBiometricLockEnabled(): Promise<boolean> {
  try {
    return (await safeStorage.getItem(BIOMETRIC_PREF_KEY)) === 'true';
  } catch {
    return false;
  }
}
