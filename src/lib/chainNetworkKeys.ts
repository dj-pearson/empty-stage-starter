/**
 * Pure key helpers for the Picky-Eater Win Network (US-296).
 *
 * Split out of `chainNetwork.ts` so pure modules (ladderMastery) can build
 * contribution keys and normalized names without importing the Supabase
 * client. `chainNetwork.ts` re-exports everything here, so existing imports
 * keep working.
 */

/**
 * Mirror of the server's `normalize_chain_food_name`. Useful when the UI
 * needs to show a normalized key (e.g. for grouping or for "you contributed
 * to this transition" hints).
 */
export function normalizeChainFoodName(name: string | null | undefined): string {
  if (!name) return '';
  let s = name.toLowerCase().trim();
  s = s.replace(/^the\s+/, '');
  s = s.replace(/['".,!?()[\]]/g, '');
  s = s.replace(/\s+/g, ' ');
  return s;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when `value` is shaped like a UUID, which is what Postgres will cast. */
export function isUuid(value: string | null | undefined): boolean {
  return typeof value === 'string' && UUID_RE.test(value);
}

/**
 * Build a deterministic v5-ish UUID from a string. We only need stability
 * (so the same input always yields the same UUID), not cryptographic
 * uniqueness; the server's PRIMARY KEY on contribution_key handles dedup.
 */
export function deterministicUuid(input: string): string {
  // FNV-1a hash, expanded to 32 hex chars by repeating with a salt.
  function fnv1a(s: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  }
  const a = fnv1a(input).toString(16).padStart(8, '0');
  const b = fnv1a(input + ':b')
    .toString(16)
    .padStart(8, '0');
  const c = fnv1a(input + ':c')
    .toString(16)
    .padStart(8, '0');
  const d = fnv1a(input + ':d')
    .toString(16)
    .padStart(8, '0');
  // shape into 8-4-4-4-12 with v4-ish bits set
  return `${a}-${b.slice(0, 4)}-4${b.slice(4, 7)}-8${c.slice(0, 3)}-${c.slice(4)}${d}`;
}
