/**
 * US-842: the feature-flag cache, with a TTL that actually expires.
 *
 * TWO DEFECTS IN THE OLD SHAPE, which was
 *
 *     { flags: { [key]: boolean }, timestamp: number }
 *
 * ONE TIMESTAMP FOR THE WHOLE OBJECT. Every writer -- setCachedFlag,
 * setCachedFlags, and the admin dashboard's syncFlagToHookCache -- set
 * `parsed.timestamp = Date.now()`, and both readers rejected the whole object
 * once that single timestamp aged past 5 minutes. So writing ANY flag renewed
 * the freshness of EVERY OTHER flag in the cache. A flag whose consumer is not
 * currently mounted is never re-evaluated, and its value stayed "fresh"
 * indefinitely in any browser that kept evaluating some other flag. Turning a
 * kill switch off server-side would not reach that browser at all. A TTL that
 * any unrelated write renews is not a TTL.
 *
 * Fixed by timestamping each flag, so ageing is per-flag and a write renews
 * only what it wrote.
 *
 * THE OLD SHAPE IS TREATED AS EXPIRED rather than migrated. Its values may
 * have been renewed arbitrarily far past their real age -- that is the bug --
 * so there is nothing worth carrying forward. One re-evaluation per flag on
 * first load after the deploy is the whole cost.
 */

/** Unchanged from the old module: US-835's sign-out scrub lists this key. */
export const FLAG_CACHE_KEY = 'eatpal_feature_flags';

export const FLAG_CACHE_TTL_MS = 5 * 60 * 1000;

/** Current on-disk shape. `v` distinguishes it from the single-timestamp one. */
interface FlagCacheV2 {
  v: 2;
  flags: Record<string, { value: boolean; at: number }>;
}

function read(): FlagCacheV2 | null {
  try {
    const raw = localStorage.getItem(FLAG_CACHE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      (parsed as FlagCacheV2).v !== 2 ||
      typeof (parsed as FlagCacheV2).flags !== 'object'
    ) {
      return null; // absent, corrupt, or the old single-timestamp shape
    }
    return parsed as FlagCacheV2;
  } catch {
    return null;
  }
}

function write(cache: FlagCacheV2): void {
  try {
    localStorage.setItem(FLAG_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Private mode or a full quota. A missing cache costs a round-trip, and
    // the caller is already prepared for a miss.
  }
}

function fresh(entry: { value: boolean; at: number } | undefined, now: number): boolean {
  return entry !== undefined && now - entry.at <= FLAG_CACHE_TTL_MS;
}

/** The cached value for one flag, or null when it is absent or stale. */
export function readFlag(flagKey: string, now: number = Date.now()): boolean | null {
  const entry = read()?.flags[flagKey];
  return fresh(entry, now) ? entry!.value : null;
}

/** Every flag still inside its TTL. Null when nothing usable is cached. */
export function readAllFlags(now: number = Date.now()): Record<string, boolean> | null {
  const cache = read();
  if (!cache) return null;
  const out: Record<string, boolean> = {};
  for (const [key, entry] of Object.entries(cache.flags)) {
    if (fresh(entry, now)) out[key] = entry.value;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** Cache one flag, renewing that flag's age and nothing else's. */
export function writeFlag(flagKey: string, value: boolean, now: number = Date.now()): void {
  const cache = read() ?? { v: 2 as const, flags: {} };
  cache.flags[flagKey] = { value, at: now };
  write(cache);
}

/** Cache several flags at once, each renewed to `now`. */
export function writeFlags(values: Record<string, boolean>, now: number = Date.now()): void {
  const cache = read() ?? { v: 2 as const, flags: {} };
  for (const [key, value] of Object.entries(values)) {
    cache.flags[key] = { value, at: now };
  }
  write(cache);
}

/**
 * Forget one flag, so the next consumer re-evaluates it against the server.
 *
 * This is what the admin dashboard calls when a flag is toggled. It used to
 * write `feature_flags.enabled` -- the raw column -- straight into this cache,
 * but what belongs here is the PER-USER result: `enabled AND the user's bucket
 * is inside rollout_percentage`. Writing the raw column meant an admin who
 * turned a flag on at 5% rollout saw it enabled in their own browser whatever
 * bucket they were in, which is precisely the browser a staged rollout gets
 * eyeballed in. Evicting instead gives the same immediate refresh without
 * anyone having to claim a rollout answer they cannot compute here.
 */
export function evictFlag(flagKey: string): void {
  const cache = read();
  if (!cache) return;
  delete cache.flags[flagKey];
  write(cache);
}
