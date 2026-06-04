import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import type { Database } from './types';

/** Storage key for the persisted session. Kept explicit (rather than the
 *  SDK-derived default) so secureSession's sign-out cleanup can target the
 *  exact key — see app/mobile/lib/secureSession.ts. */
export const SECURE_STORAGE_KEY = 'sb-eatpal-auth-token';

// Resolve config from whichever bundler is in play. Expo (Metro) replaces
// process.env.EXPO_PUBLIC_* at build time; the web (Vite) build only defines
// import.meta.env.VITE_*. The previous code read ONLY import.meta.env, which
// Metro never populates — so on the Expo app both values were empty and this
// module threw at import, taking the whole app down before sign-in.
const metaEnv = typeof import.meta !== 'undefined' ? import.meta.env : undefined;
const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL || metaEnv?.VITE_SUPABASE_URL || '';
const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || metaEnv?.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Set EXPO_PUBLIC_SUPABASE_URL and ' +
    'EXPO_PUBLIC_SUPABASE_ANON_KEY (Expo) or VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (web).'
  );
}

// Custom storage adapter for React Native using expo-secure-store
const ExpoSecureStoreAdapter = {
  getItem: (key: string) => {
    return SecureStore.getItemAsync(key);
  },
  setItem: (key: string, value: string) => {
    return SecureStore.setItemAsync(key, value);
  },
  removeItem: (key: string) => {
    return SecureStore.deleteItemAsync(key);
  },
};

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    storageKey: SECURE_STORAGE_KEY,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // No URL-based session on native; deep links handled manually.
    flowType: 'pkce', // Match the web client; required for OAuth / magic-link code exchange.
  },
});

// NOTE: expo-secure-store has a ~2KB per-value limit on device. A full Supabase
// session (access + refresh token + user + identities) can exceed that and fail
// to persist, which looks like "signed in, but logged out on next launch". If
// that surfaces, swap ExpoSecureStoreAdapter for a chunked adapter that splits
// the value across multiple keys.

