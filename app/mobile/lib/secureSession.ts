/**
 * Secure session management for mobile
 * 
 * Security guarantees:
 * - Auth tokens stored in Android Keystore via expo-secure-store
 * - Never uses AsyncStorage or SharedPreferences for tokens
 * - Clears all secure storage on sign-out
 * - No tokens logged in production
 * - Session auto-refresh handled by Supabase client config
 */

const SECURE_KEYS = [
  'supabase.auth.token',
  'supabase-auth-token', 
  'biometric_enabled',
  'theme_preference',
] as const;

/**
 * Clear all sensitive data from secure storage on sign-out
 */
export async function clearSecureSession(): Promise<void> {
  try {
    const SecureStore = await import('expo-secure-store').catch(() => null);
    if (!SecureStore) return;

    const deletePromises = SECURE_KEYS.map(key =>
      SecureStore.deleteItemAsync(key).catch(() => {
        // Key may not exist, ignore
      })
    );

    await Promise.all(deletePromises);
  } catch {
    // Best effort cleanup
  }
}

/**
 * Store a value securely using Android Keystore / iOS Keychain
 */
export async function setSecureItem(key: string, value: string): Promise<void> {
  try {
    const SecureStore = await import('expo-secure-store').catch(() => null);
    if (!SecureStore) return;
    await SecureStore.setItemAsync(key, value);
  } catch {
    // Silently fail - don't expose errors that might leak info
  }
}

/**
 * Retrieve a securely stored value
 */
export async function getSecureItem(key: string): Promise<string | null> {
  try {
    const SecureStore = await import('expo-secure-store').catch(() => null);
    if (!SecureStore) return null;
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

/**
 * Check if the session is valid (not expired)
 * Supabase handles auto-refresh, but this is a manual check
 */
export async function isSessionValid(): Promise<boolean> {
  try {
    const { supabase } = await import('@/integrations/supabase/client.mobile');
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return false;

    const expiresAt = session.expires_at;
    if (!expiresAt) return true;

    // Session valid if expiry is in the future
    return expiresAt * 1000 > Date.now();
  } catch {
    return false;
  }
}
