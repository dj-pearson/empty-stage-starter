// Helpers for Apple Sign In identity inspection.
//
// Apple's "Hide My Email" wraps the user's real address with a forwarding
// alias at @privaterelay.appleid.com. We need to detect that case so the
// account-settings flow can prompt the user to bind their real email and
// optionally set a password (decoupling the account from Apple-only auth).

import type { User } from "@supabase/supabase-js";

export const APPLE_RELAY_DOMAIN = "privaterelay.appleid.com";

export function isAppleRelayEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.toLowerCase().endsWith(`@${APPLE_RELAY_DOMAIN}`);
}

/**
 * All providers backing this auth user. Drawn from `identities` (the
 * source of truth — one entry per linked OAuth provider) and falls back
 * to `app_metadata.provider` when identities is missing (older sessions).
 */
export function getAuthProviders(user: User | null | undefined): string[] {
  if (!user) return [];
  const identities = user.identities ?? [];
  if (identities.length > 0) {
    return Array.from(new Set(identities.map((i) => i.provider).filter(Boolean) as string[]));
  }
  const fallback = (user.app_metadata as { provider?: string } | undefined)?.provider;
  return fallback ? [fallback] : [];
}

export function isAppleAccount(user: User | null | undefined): boolean {
  return getAuthProviders(user).includes("apple");
}
