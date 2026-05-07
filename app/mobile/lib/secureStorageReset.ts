import { Platform } from 'react-native';
import { safeStorage } from '@/lib/platform';

/**
 * US-123: tear down all app-owned secure-storage entries on sign-out.
 *
 * Supabase's `auth.signOut()` already clears its own session storage, but
 * the rest of the eatpal.* namespace (theme mode, biometric flag, the
 * crash queue from US-134, the pending recipe imports queue, etc.) needs
 * to be wiped explicitly so the next user on the same device starts clean.
 *
 * Keep the keys list **alphabetical and grouped by feature** so it's easy
 * to audit during code review. Adding a new persisted preference? Add the
 * key here too — the `eatpal.profile.darkMode` legacy boolean is included
 * so a user who never opened the new theme picker still gets a clean wipe.
 */

const KEYS_TO_RESET = [
  // Crash + diagnostics (US-134)
  'eatpal.mobile.sentryQueue',
  // Profile preferences (US-122 + US-129)
  'eatpal.profile.biometric',
  'eatpal.profile.darkMode',
  'eatpal.profile.notifications',
  // Theme (US-129)
  'eatpal.theme.mode',
] as const;

/**
 * Remove every app-owned secure-storage entry. Best-effort: errors on
 * individual keys are swallowed so a hung key can't block the rest.
 */
export async function clearMobileSecureStorage(): Promise<void> {
  // safeStorage is web→localStorage / native→expo-secure-store. Both have
  // the same removeItem semantics.
  await Promise.all(
    KEYS_TO_RESET.map(async (key) => {
      try {
        await safeStorage.removeItem(key);
      } catch {
        // Swallow — a missing key throws on some platforms.
      }
    })
  );

  if (Platform.OS !== 'web') {
    // We deliberately don't enumerate every secure-store entry on native:
    // expo-secure-store has no "list keys" API, and we'd need a manifest
    // anyway to avoid clobbering keys owned by other apps in the same
    // keychain access group. This list is the manifest.
  }
}
