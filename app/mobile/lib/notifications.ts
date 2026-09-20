import { Platform } from 'react-native';
import { supabase } from '@/integrations/supabase/client.mobile';

/**
 * US-126: push notification setup for mobile.
 *
 * The expo-notifications plugin is wired in `app.config.js`. This file is
 * the runtime side: request permission on first launch, fetch the Expo
 * push token, and register it with Supabase (`push_tokens` table) so the
 * server can target the device. Foreground notifications get a default
 * banner; background/killed notifications are handled by Expo's native
 * runtime — we add a tap-handler that routes via expo-router deep links.
 *
 * **Web is a no-op** — push delivery on web uses the existing service-worker
 * path, not expo-notifications.
 *
 * Categories the server is expected to set (in `data.category`):
 *   - meal_reminder  → eatpal://meals/<date>
 *   - list_update    → eatpal://lists/<id>
 *   - plan_ready     → eatpal://meals/<date>
 *
 * The mapping is enforced here so the server / function side just sends
 * `data: { category, ... }` plus the route-specific id.
 */

export interface PushPermissionResult {
  granted: boolean;
  /**
   * US-852: `unsupported` and `unavailable` used to be the same answer, which
   * is why nobody noticed. `unsupported` means this platform does not do push
   * this way -- web uses the service-worker path. `unavailable` means this is
   * a platform that SHOULD do push and the module is not there, which is a
   * build problem rather than a platform fact.
   */
  reason?: 'denied' | 'unsupported' | 'unavailable' | 'error';
}

/** The surface of `expo-notifications` this module actually uses. */
interface NotificationsModule {
  getPermissionsAsync: () => Promise<{ granted: boolean }>;
  requestPermissionsAsync: () => Promise<{ granted: boolean }>;
  getExpoPushTokenAsync: () => Promise<{ data?: string | null } | null>;
}

/** Reported once per process rather than once per call: three sites share it. */
let missingModuleReported = false;

/**
 * Load `expo-notifications`, telling "not on this platform" apart from
 * "should be here and is not".
 *
 * US-852: all three call sites swallowed the failed import and then returned
 * the same answer they return on web. So a module that is absent because it
 * was never declared as a dependency -- the actual state of this repo since
 * US-126 -- was indistinguishable from a platform that legitimately does not
 * do push this way. Push has been inert on every Expo build, and the code
 * reported that as normal.
 *
 * Still returns null either way, because the caller genuinely cannot proceed.
 * The difference is that this one says so.
 */
/**
 * Swappable so the functions below can be driven in a test (US-852 AC4).
 *
 * The import has to stay out of a bundler's static analysis: `expo-notifications`
 * is genuinely optional here -- it is not a declared dependency, which is AC1 --
 * and a bundler that resolves the specifier eagerly fails the whole module
 * rather than reaching the catch. That is also why a plain module-factory mock
 * is not enough, and why this seam exists rather than an alias in the test
 * config: an alias would shadow the real module for good once AC1 lands.
 */
let notificationsLoader: () => Promise<NotificationsModule> = async () => {
  const specifier = 'expo-notifications';
  return (await import(/* @vite-ignore */ specifier)) as unknown as NotificationsModule;
};

/** Test seam. Pass null to restore the real loader. */
export function __setNotificationsLoaderForTests(
  loader: (() => Promise<NotificationsModule>) | null
): void {
  if (loader) {
    notificationsLoader = loader;
  } else {
    notificationsLoader = async () => {
      const specifier = 'expo-notifications';
      return (await import(/* @vite-ignore */ specifier)) as unknown as NotificationsModule;
    };
  }
}

async function loadNotifications(): Promise<NotificationsModule | null> {
  try {
    return await notificationsLoader();
  } catch (err) {
    if (!missingModuleReported) {
      missingModuleReported = true;
      console.error(
        `[push] expo-notifications failed to load on ${Platform.OS}. Push is inert on ` +
          'this build. It is not a declared dependency of this repo (US-852 AC1).',
        err
      );
    }
    return null;
  }
}

/** Test seam: the report is once-per-process, so a suite has to reset it. */
export function __resetMissingModuleReportForTests(): void {
  missingModuleReported = false;
}

export async function requestPushPermission(): Promise<PushPermissionResult> {
  if (Platform.OS === 'web') return { granted: false, reason: 'unsupported' };
  try {
    const Notifications = await loadNotifications();
    if (!Notifications) return { granted: false, reason: 'unavailable' };

    const settings = await Notifications.getPermissionsAsync();
    if (settings.granted) return { granted: true };
    const ask = await Notifications.requestPermissionsAsync();
    return ask.granted ? { granted: true } : { granted: false, reason: 'denied' };
  } catch (err) {
    console.warn('[push] permission request failed:', err);
    return { granted: false, reason: 'error' };
  }
}

export async function registerPushToken(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    const Notifications = await loadNotifications();
    if (!Notifications) return null;

    const tokenResult = await Notifications.getExpoPushTokenAsync();
    const token = tokenResult?.data ?? null;
    if (!token) return null;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return token; // Token is valid; just no signed-in user yet.

    // Upsert (user_id, token) so the same device on multiple sign-ins
    // doesn't pile up duplicate rows. The `push_tokens` schema is expected
    // to include columns: user_id, token, platform, updated_at.
    // `is_active` is written explicitly. An upsert only touches the columns
    // it names, so re-registering after a sign-out (which sets it false)
    // would otherwise leave the row inactive forever and push would never
    // resume for this device.
    const { error } = await supabase.from('push_tokens').upsert(
      {
        user_id: user.id,
        token,
        platform: Platform.OS,
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'token' }
    );
    if (error) {
      console.warn('[push] token registration failed:', error.message);
    }
    return token;
  } catch (err) {
    console.warn('[push] token fetch failed:', err);
    return null;
  }
}

/**
 * Stops push delivery to this device before a sign-out.
 *
 * Without it the `push_tokens` row stays `is_active = true` against the
 * departing user, and `process-notification-queue` keeps pushing their meal
 * plan, grocery list, and children's names to a phone they signed out of. The
 * row was only ever corrected by somebody signing in again on the same device.
 *
 * Must run BEFORE `supabase.auth.signOut()`: the update is authenticated and
 * RLS scopes `push_tokens` to `auth.uid()`. Returns whether the row was
 * deactivated so a caller can restore it if the sign-out itself then fails.
 */
export async function deactivatePushToken(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const Notifications = await loadNotifications();
    if (!Notifications) return false;

    const tokenResult = await Notifications.getExpoPushTokenAsync();
    const token = tokenResult?.data ?? null;
    if (!token) return false;

    const { error } = await supabase
      .from('push_tokens')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('token', token);
    if (error) {
      console.warn('[push] token deactivation failed:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[push] token deactivation failed:', err);
    return false;
  }
}

/**
 * Map the `data.category` field on an incoming notification to a deep link.
 * Returns `null` for unknown categories — caller should ignore.
 */
export function deepLinkForNotification(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  const category = typeof d.category === 'string' ? d.category : null;
  if (!category) return null;

  switch (category) {
    case 'meal_reminder':
    case 'plan_ready': {
      const date = typeof d.date === 'string' ? d.date : '';
      return date ? `eatpal://meals/${date}` : 'eatpal://meals';
    }
    case 'list_update': {
      const id = typeof d.list_id === 'string' ? d.list_id : '';
      return id ? `eatpal://lists/${id}` : 'eatpal://lists';
    }
    default:
      return null;
  }
}
