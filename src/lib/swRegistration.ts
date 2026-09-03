/**
 * Service worker registration policy (US-765).
 *
 * public/sw.js and registerServiceWorker() in src/lib/pwa.ts were both complete
 * and nothing ever called the latter, so the offline cache, offline.html and
 * the manifest's POST share target were all inert. Registering it is one line;
 * the reason this module exists is the other half of that decision -- being
 * able to turn it back off without shipping a deploy.
 *
 * A service worker is the one piece of the app that outlives the page that
 * installed it. If a bad worker ships, removing the registration call from
 * main.tsx fixes nothing: every browser that already installed it keeps serving
 * from it, and the fix cannot reach them because the worker is what decides
 * whether the fix is fetched. So the kill switch has to run inside the client
 * and has to actively unregister, not merely decline to register.
 *
 * The flag is read from the same localStorage cache useFeatureFlag writes
 * (eatpal_feature_flags), so toggling `pwa_service_worker` in the admin
 * dashboard reaches a user on their next load without a build.
 *
 * TTL is deliberately ignored here, unlike in useFeatureFlag. That hook expires
 * its cache after five minutes and falls back to the default, which is correct
 * for a feature flag and wrong for a kill switch: an off that expires back on
 * five minutes later is not a kill switch. Off is sticky; on is the default.
 */

export const SW_FLAG_KEY = 'pwa_service_worker';
export const FLAG_CACHE_KEY = 'eatpal_feature_flags';

/** Device-level escape hatch: support can set this in a browser console. */
export const SW_DEVICE_DISABLE_KEY = 'eatpal_sw_disabled';

/** Caches sw.js owns. The share-target handoff cache is deliberately not one. */
export const SW_CACHE_PREFIX = 'tryeatpal-';

type StorageLike = Pick<Storage, 'getItem'>;

function readStorage(): StorageLike | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    // Safari in private mode throws on the property access itself.
    return null;
  }
}

/**
 * True unless something explicitly turned it off.
 *
 * Unreadable storage, absent flag and malformed JSON all mean "on": a kill
 * switch that fails closed would take the PWA down for every user whose browser
 * blocks storage, which is a bigger outage than the one it protects against.
 */
export function isServiceWorkerEnabled(storage: StorageLike | null = readStorage()): boolean {
  if (!storage) return true;

  try {
    if (storage.getItem(SW_DEVICE_DISABLE_KEY) === 'true') return false;
  } catch {
    return true;
  }

  let raw: string | null = null;
  try {
    raw = storage.getItem(FLAG_CACHE_KEY);
  } catch {
    return true;
  }
  if (!raw) return true;

  try {
    const parsed = JSON.parse(raw) as { flags?: Record<string, unknown> };
    // Only an explicit false disables. An absent key, a null, or any other
    // value is the default-on case.
    return parsed?.flags?.[SW_FLAG_KEY] !== false;
  } catch {
    return true;
  }
}

/**
 * Remove every registration this origin holds and drop the caches sw.js owns.
 *
 * Returns the number of registrations actually removed, so the caller can say
 * whether it undid something or found nothing to undo.
 */
export async function unregisterServiceWorkers(): Promise<number> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return 0;

  let removed = 0;
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    const results = await Promise.all(registrations.map((r) => r.unregister()));
    removed = results.filter(Boolean).length;
  } catch {
    // A browser that refuses getRegistrations has nothing for us to remove.
    return 0;
  }

  // Only the versioned app caches. share-target-cache holds a share the user
  // made and is consumed by src/pages/ShareTarget.tsx; deleting it here would
  // throw away content mid-handoff.
  try {
    if (typeof caches !== 'undefined') {
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => n.startsWith(SW_CACHE_PREFIX)).map((n) => caches.delete(n))
      );
    }
  } catch {
    // Cache API unavailable; the unregistration above is the part that matters.
  }

  return removed;
}
