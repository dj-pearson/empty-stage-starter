import type { Kid } from "@/types";

/**
 * Sensitive child fields that must NOT be written to the web localStorage
 * backup (US-537). The web app has no encrypted store (mobile uses
 * expo-secure-store), so the write-through cache would otherwise persist
 * allergens, health goals, dietary restrictions, notes, DOB, and photo in
 * plaintext. We keep only what's needed for an offline paint (id/name/age).
 */
export const SENSITIVE_KID_FIELDS = [
  "allergens",
  "health_goals",
  "dietary_restrictions",
  "texture_preferences",
  "texture_dislikes",
  "flavor_preferences",
  "helpful_strategies",
  "disliked_foods",
  "always_eats_foods",
  "notes",
  "date_of_birth",
  "profile_picture_url",
] as const;

/** Drop sensitive fields from a kid before caching. */
export function redactKidForCache(kid: Kid): Kid {
  const out = { ...(kid as Record<string, unknown>) };
  for (const field of SENSITIVE_KID_FIELDS) delete out[field];
  return out as unknown as Kid;
}

/**
 * Redact a full app snapshot before persisting it to the web cache: only the
 * kids slice carries sensitive PII, so only it is minimized. Foods/recipes/plan
 * entries/grocery items are left intact.
 */
export function redactSnapshotForCache<T extends { kids?: unknown }>(snapshot: T): T {
  const kids = snapshot.kids;
  if (!Array.isArray(kids)) return snapshot;
  return { ...snapshot, kids: kids.map((k) => redactKidForCache(k as Kid)) };
}
